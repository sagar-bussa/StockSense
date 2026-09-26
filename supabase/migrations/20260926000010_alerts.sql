-- ===================================================================
-- 010 · Stock level alerts
-- ===================================================================
-- Re-evaluated after every stock movement, so the dashboard, the product list
-- and the notification centre all agree.

-- ===================================================================
-- Product totals
-- ===================================================================
-- Company-wide total for a product. Used for the low/out-of-stock tests, which
-- the brief defines against the product rather than per location: a company
-- holding 12 chairs across three sites is not out of stock.

create or replace function public.product_total_stock(p_product_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(i.quantity), 0)
  from public.inventory i
  join public.locations l on l.id = i.location_id
  where i.product_id = p_product_id
    and l.status = 'active';
$$;

-- ===================================================================
-- sync_stock_alert
-- ===================================================================
-- Raise or clear the low/out-of-stock alert for a product after a movement.
--
-- Two properties matter:
--   * idempotent - safe to call after every movement, and when nothing has
--     crossed a threshold it does nothing;
--   * self-clearing - when a receipt lifts stock back above the reorder level,
--     the outstanding unread alert is marked read, so the user's list does not
--     keep claiming a problem that no longer exists.

create or replace function public.sync_stock_alert(
  p_product_id uuid,
  p_warehouse_id uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product       public.products%rowtype;
  v_total         numeric(14, 3);
  v_warehouse     uuid;
  v_dedupe        text;
  v_type          public.notification_type;
  v_severity      public.severity;
  v_title         text;
  v_message       text;
  v_label         text;
begin
  select * into v_product from public.products where id = p_product_id;
  if not found then
    return;
  end if;

  v_total := public.product_total_stock(p_product_id);

  -- Scope the alert to a warehouse when the caller named one, otherwise tell
  -- everyone responsible for the product.
  v_warehouse := coalesce(p_warehouse_id, (
    select i.warehouse_id from public.inventory i
    where i.product_id = p_product_id
    order by i.quantity desc, i.warehouse_id
    limit 1
  ));

  if v_warehouse is null then
    return;
  end if;

  if v_total <= 0 then
    v_type     := 'out_of_stock';
    v_severity := 'critical';
    v_label    := 'Out of stock';
    v_dedupe   := 'out_of_stock:' || p_product_id::text;
    v_title    := v_product.name || ' is out of stock';
    v_message  := 'All stock of ' || v_product.name || ' (' || v_product.sku ||
                  ') has been consumed. Reorder immediately.';
  elsif v_total <= v_product.reorder_level then
    v_type     := 'low_stock';
    v_severity := 'warning';
    v_label    := 'Low stock';
    v_dedupe   := 'low_stock:' || p_product_id::text;
    v_title    := v_product.name || ' is below its reorder level';
    v_message  := v_product.name || ' (' || v_product.sku || ') has ' || v_total ||
                  ' ' || v_product.unit_of_measure::text || ' left, at or below the reorder level of ' ||
                  v_product.reorder_level || '.';
  else
    -- Healthy again. Clear anything outstanding so the alert list reflects
    -- reality rather than what was true earlier in the day.
    update public.notifications
    set is_read = true, read_at = now()
    where product_id = p_product_id
      and not is_read
      and type in ('low_stock', 'out_of_stock');

    return;
  end if;

  perform public.notify(
    v_warehouse,
    v_type,
    v_severity,
    v_title,
    v_message,
    v_dedupe,
    p_product_id,
    null,
    null,
    '/products/' || p_product_id::text
  );
end;
$$;

comment on function public.sync_stock_alert is
  'Raise a low/out-of-stock alert for a product, or clear it when stock recovers. Idempotent.';

-- ===================================================================
-- Create a product
-- ===================================================================
-- Wrapped as an RPC so the optional opening stock is applied atomically and,
-- importantly, recorded as a real ledger entry. An opening balance that never
-- appears in the ledger is exactly the kind of untraceable number this system
-- is meant to eliminate.

create or replace function public.create_product(
  p_name            text,
  p_sku             text,
  p_category_id     uuid default null,
  p_unit_of_measure public.unit_of_measure default 'pcs',
  p_reorder_level   numeric default 0,
  p_initial_stock   numeric default 0,
  p_description     text default null,
  p_initial_location_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_initial    numeric;
begin
  if not public.is_manager() then
    raise exception 'STOCKSENSE:You do not have permission to create products.'
      using errcode = 'P0001';
  end if;

  v_initial := coalesce(p_initial_stock, 0);

  if v_initial > 0 and p_initial_location_id is null then
    raise exception 'STOCKSENSE:Choose a location for the opening stock.'
      using errcode = 'P0001';
  end if;

  insert into public.products (
    name, sku, category_id, unit_of_measure, reorder_level,
    initial_stock, description, created_by
  )
  values (
    trim(p_name), upper(trim(p_sku)), p_category_id,
    coalesce(p_unit_of_measure, 'pcs'), coalesce(p_reorder_level, 0),
    v_initial, p_description, auth.uid()
  )
  returning id into v_product_id;

  if v_initial > 0 then
    perform public.apply_stock_movement(
      v_product_id,
      p_initial_location_id,
      v_initial,
      'receipt',
      'initial',
      v_product_id,
      'OPENING',
      'Opening balance recorded when the product was created.'
    );
  end if;

  -- A new product with a zero balance and a positive reorder level is
  -- immediately low on stock; raise that so the dashboard is honest.
  if v_initial <= coalesce(p_reorder_level, 0) then
    perform public.sync_stock_alert(v_product_id, p_initial_location_id);
  end if;

  return v_product_id;
end;
$$;
