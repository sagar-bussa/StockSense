-- ===================================================================
-- 015 · Stock adjustments
-- ===================================================================
-- The recorded-stock vs physical-count workflow from the brief:
--   1. pick warehouse/location and product
--   2. see the system quantity
--   3. enter the counted quantity
--   4. the difference is calculated, not typed
--   5. a reason is mandatory
--   6. confirming sets stock to the counted figure
--
-- The adjustment posts immediately - there is no draft stage, because there is
-- nothing to review once the count is confirmed - and `difference` is a
-- generated column, so the arithmetic cannot be wrong.

-- ===================================================================
-- get_location_stock
-- ===================================================================
-- What the system believes a location holds for a product. The adjustment form
-- calls this to prefill the "system quantity" column so the user is comparing
-- against a real number rather than recalling one.

create or replace function public.get_location_stock(
  p_product_id uuid,
  p_location_id uuid
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select quantity from public.inventory
     where product_id = p_product_id and location_id = p_location_id),
    0
  );
$$;

-- ===================================================================
-- post_adjustment
-- ===================================================================

create or replace function public.post_adjustment(
  p_product_id       uuid,
  p_location_id      uuid,
  p_counted_quantity numeric,
  p_reason           public.adjustment_reason,
  p_notes            text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_adjustment_id uuid;
  v_adjustment    public.adjustments%rowtype;
  v_warehouse_id  uuid;
  v_system        numeric(14, 3);
  v_counted       numeric(14, 3);
  v_difference    numeric(14, 3);
  v_actor         uuid := auth.uid();
begin
  if public.current_role() is null then
    raise exception 'STOCKSENSE:You do not have permission to post adjustments.'
      using errcode = 'P0001';
  end if;

  if p_reason is null then
    raise exception 'STOCKSENSE:An adjustment needs a reason. Stock is never changed silently.'
      using errcode = 'P0001';
  end if;

  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'STOCKSENSE:Enter the counted quantity as zero or more.'
      using errcode = 'P0001';
  end if;

  -- 'other' carries no meaning on its own, so it must be explained.
  if p_reason = 'other' and nullif(trim(p_notes), '') is null then
    raise exception 'STOCKSENSE:Add a note explaining this adjustment.'
      using errcode = 'P0001';
  end if;

  if not public.can_access_location(p_location_id) then
    raise exception 'STOCKSENSE:You do not have access to this location.'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.products where id = p_product_id and status = 'active') then
    raise exception 'STOCKSENSE:The selected product is unavailable. Refresh and try again.'
      using errcode = 'P0001';
  end if;

  select warehouse_id into v_warehouse_id from public.locations where id = p_location_id;

  -- Read under a lock so the recorded figure cannot move between the moment we
  -- read it and the moment we write the correction.
  perform set_config('stocksense.inventory_write', 'on', true);
  perform 1 from public.inventory
  where product_id = p_product_id and location_id = p_location_id
  for update;

  v_system   := public.get_location_stock(p_product_id, p_location_id);
  v_counted  := p_counted_quantity;
  v_difference := v_counted - v_system;

  insert into public.adjustments (
    adjustment_number, product_id, warehouse_id, location_id,
    system_quantity, counted_quantity, reason, notes,
    status, created_by, validated_by, validated_at
  )
  values (
    public.next_adjustment_number(), p_product_id, v_warehouse_id, p_location_id,
    v_system, v_counted, p_reason, p_notes,
    'done', v_actor, v_actor, now()
  )
  returning * into v_adjustment;

  v_adjustment_id := v_adjustment.id;

  if v_difference <> 0 then
    perform public.apply_stock_movement(
      p_product_id,
      p_location_id,
      v_difference,
      'adjustment',
      'adjustment',
      v_adjustment_id,
      v_adjustment.adjustment_number,
      initcap(p_reason::text) || coalesce(': ' || nullif(trim(p_notes), ''), ''),
      null,
      null,
      p_notes
    );
  end if;

  perform public.sync_stock_alert(p_product_id, v_warehouse_id);

  perform public.notify(
    v_warehouse_id,
    'adjustment_completed',
    case when abs(v_difference) > 0 then 'warning' else 'info' end::public.severity,
    'Adjustment ' || v_adjustment.adjustment_number || ' posted',
    format('Stock for %s at %s was corrected from %s to %s (%s).',
      (select name from public.products where id = p_product_id),
      (select name from public.locations where id = p_location_id),
      v_system, v_counted, initcap(p_reason::text)),
    null,
    p_product_id,
    'adjustment',
    v_adjustment_id,
    '/ledger?product=' || p_product_id::text
  );

  return v_adjustment_id;
end;
$$;

comment on function public.post_adjustment is
  'Correct recorded stock to a physical count. Reason is mandatory and the difference is generated, never supplied.';
