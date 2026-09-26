-- ===================================================================
-- 013 · Deliveries (outgoing stock)
-- ===================================================================
-- Mirrors the receipt flow with the availability check added. Availability is
-- enforced by `inventory.quantity >= 0` at the storage layer and reported as a
-- readable message by `apply_stock_movement`; the pre-check below exists so
-- the user sees every short line at once instead of discovering them one at a
-- time as the transaction rolls back.

create or replace function public.create_delivery(
  p_customer_id  uuid,
  p_warehouse_id uuid,
  p_location_id  uuid,
  p_reference    text default null,
  p_notes        text default null,
  p_expected_at  timestamptz default null,
  p_items        jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid;
  v_item        jsonb;
  v_location    uuid;
  v_quantity    numeric;
begin
  if public.current_role() is null then
    raise exception 'STOCKSENSE:You do not have permission to create deliveries.'
      using errcode = 'P0001';
  end if;

  if not public.can_access_warehouse(p_warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to this warehouse.'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'STOCKSENSE:Add at least one product to the delivery.'
      using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_location := coalesce(nullif(v_item ->> 'location_id', '')::uuid, p_location_id);
    v_quantity := (v_item ->> 'quantity')::numeric;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'STOCKSENSE:Enter a quantity greater than zero for every line.'
        using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.products where id = (v_item ->> 'product_id')::uuid and status = 'active') then
      raise exception 'STOCKSENSE:One of the selected products is no longer available.'
        using errcode = 'P0001';
    end if;
    if not public.can_access_location(v_location) then
      raise exception 'STOCKSENSE:You do not have access to one of the selected locations.'
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.deliveries (
    delivery_number, customer_id, warehouse_id, location_id,
    reference, notes, expected_at, status, created_by
  )
  values (
    public.next_delivery_number(), p_customer_id, p_warehouse_id, p_location_id,
    nullif(trim(p_reference), ''), p_notes, p_expected_at, 'draft', auth.uid()
  )
  returning id into v_delivery_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.delivery_items (delivery_id, product_id, location_id, quantity, unit_price)
    values (
      v_delivery_id,
      (v_item ->> 'product_id')::uuid,
      coalesce(nullif(v_item ->> 'location_id', '')::uuid, p_location_id),
      (v_item ->> 'quantity')::numeric,
      nullif(v_item ->> 'unit_price', '')::numeric
    );
  end loop;

  return v_delivery_id;
end;
$$;

comment on function public.create_delivery is
  'Create a draft delivery. Does not change stock, and does not reserve it.';

-- ===================================================================
-- update_delivery
-- ===================================================================

create or replace function public.update_delivery(
  p_delivery_id  uuid,
  p_customer_id  uuid default null,
  p_location_id  uuid default null,
  p_reference    text default null,
  p_notes        text default null,
  p_expected_at  timestamptz default null,
  p_items        jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_item     jsonb;
  v_location uuid;
  v_quantity numeric;
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'STOCKSENSE:This delivery no longer exists.' using errcode = 'P0001';
  end if;

  if v_delivery.status = 'done' then
    raise exception 'STOCKSENSE:This delivery is already validated and cannot be edited.'
      using errcode = 'P0001';
  end if;
  if v_delivery.status = 'canceled' then
    raise exception 'STOCKSENSE:This delivery is canceled and cannot be edited.'
      using errcode = 'P0001';
  end if;
  if not public.can_access_warehouse(v_delivery.warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to this delivery.' using errcode = 'P0001';
  end if;

  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'STOCKSENSE:A delivery needs at least one line.' using errcode = 'P0001';
    end if;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_location := coalesce(nullif(v_item ->> 'location_id', '')::uuid, p_location_id, v_delivery.location_id);
      v_quantity := (v_item ->> 'quantity')::numeric;

      if v_quantity is null or v_quantity <= 0 then
        raise exception 'STOCKSENSE:Enter a quantity greater than zero for every line.'
          using errcode = 'P0001';
      end if;
      if not exists (
        select 1 from public.products
        where id = (v_item ->> 'product_id')::uuid and status = 'active'
      ) then
        raise exception 'STOCKSENSE:One of the selected products is no longer available.'
          using errcode = 'P0001';
      end if;
      if not public.can_access_location(v_location) then
        raise exception 'STOCKSENSE:You do not have access to one of the selected locations.'
          using errcode = 'P0001';
      end if;
    end loop;

    delete from public.delivery_items where delivery_id = p_delivery_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      insert into public.delivery_items (delivery_id, product_id, location_id, quantity, unit_price)
      values (
        p_delivery_id,
        (v_item ->> 'product_id')::uuid,
        coalesce(nullif(v_item ->> 'location_id', '')::uuid, p_location_id, v_delivery.location_id),
        (v_item ->> 'quantity')::numeric,
        nullif(v_item ->> 'unit_price', '')::numeric
      );
    end loop;
  end if;

  update public.deliveries
  set customer_id = coalesce(p_customer_id, customer_id),
      location_id = coalesce(p_location_id, location_id),
      reference   = coalesce(p_reference, reference),
      notes       = coalesce(p_notes, notes),
      expected_at = coalesce(p_expected_at, expected_at)
  where id = p_delivery_id;

  return p_delivery_id;
end;
$$;

-- ===================================================================
-- check_delivery_availability
-- ===================================================================
-- Read-only pre-flight. Lets the UI grey out an impossible line and show
-- "Insufficient stock. Available: 7 units." before the user reaches the
-- confirmation dialog, without attempting any write.

create or replace function public.check_delivery_availability(p_delivery_id uuid)
returns table (
  product_id    uuid,
  product_name  text,
  sku           text,
  location_id   uuid,
  location_name text,
  requested     numeric,
  available     numeric,
  is_sufficient boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    di.product_id,
    p.name,
    p.sku,
    di.location_id,
    l.name,
    di.quantity,
    coalesce(i.quantity, 0),
    coalesce(i.quantity, 0) >= di.quantity
  from public.delivery_items di
  join public.products p on p.id = di.product_id
  join public.locations l on l.id = di.location_id
  left join public.inventory i
    on i.product_id = di.product_id and i.location_id = di.location_id
  where di.delivery_id = p_delivery_id
  order by p.name;
$$;

-- ===================================================================
-- validate_delivery
-- ===================================================================

create or replace function public.validate_delivery(p_delivery_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_item     public.delivery_items%rowtype;
  v_entry    public.stock_ledger%rowtype;
  v_lines    jsonb := '[]'::jsonb;
  v_shortfall text;
  v_actor    uuid := auth.uid();
begin
  select * into v_delivery from public.deliveries where id = p_delivery_id for update;

  if not found then
    raise exception 'STOCKSENSE:This delivery no longer exists.' using errcode = 'P0001';
  end if;

  if v_delivery.status = 'done' then
    raise exception
      'STOCKSENSE:Delivery % has already been validated. Stock was only deducted once.',
      v_delivery.delivery_number
      using errcode = 'P0001';
  end if;

  if v_delivery.status = 'canceled' then
    raise exception 'STOCKSENSE:This delivery is canceled and cannot be validated.'
      using errcode = 'P0001';
  end if;

  if not public.can_access_warehouse(v_delivery.warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to this delivery.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.delivery_items where delivery_id = p_delivery_id) then
    raise exception 'STOCKSENSE:Add at least one product before validating this delivery.'
      using errcode = 'P0001';
  end if;

  perform public.assert_valid_transition(v_delivery.status, 'done');

  -- Report every shortfall in one message. Validating line by line would fail
  -- on the first problem and make the user retry to discover the rest.
  if exists (
    select 1
    from public.delivery_items di
    left join public.inventory i
      on i.product_id = di.product_id and i.location_id = di.location_id
    where di.delivery_id = p_delivery_id
      and coalesce(i.quantity, 0) < di.quantity
  ) then
    select string_agg(
      format('%s (%s): requested %s, available %s',
        p.name, p.sku, di.quantity, coalesce(i.quantity, 0)),
      '; ' order by p.name
    )
    into v_shortfall
    from public.delivery_items di
    join public.products p on p.id = di.product_id
    left join public.inventory i
      on i.product_id = di.product_id and i.location_id = di.location_id
    where di.delivery_id = p_delivery_id
      and coalesce(i.quantity, 0) < di.quantity;

    raise exception 'STOCKSENSE:Insufficient stock. %', v_shortfall
      using errcode = 'P0001';
  end if;

  for v_item in
    select * from public.delivery_items where delivery_id = p_delivery_id order by id
  loop
    v_entry := public.apply_stock_movement(
      v_item.product_id,
      v_item.location_id,
      -v_item.quantity,
      'delivery',
      'delivery',
      p_delivery_id,
      v_delivery.delivery_number,
      'Goods dispatched',
      null,
      null,
      v_item.notes
    );

    perform public.sync_stock_alert(v_item.product_id, v_entry.warehouse_id);

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_entry.product_id,
      'product_name', v_entry.product_name,
      'sku', v_entry.sku,
      'location_name', v_entry.location_name,
      'quantity', v_item.quantity,
      'previous_quantity', v_entry.previous_quantity,
      'new_quantity', v_entry.new_quantity
    );
  end loop;

  update public.deliveries
  set status = 'done', validated_by = v_actor, validated_at = now()
  where id = p_delivery_id;

  perform public.notify(
    v_delivery.warehouse_id,
    'delivery_validated',
    'info',
    'Delivery ' || v_delivery.delivery_number || ' completed',
    'Stock was deducted for '
      || (select count(*) from public.delivery_items where delivery_id = p_delivery_id)
      || ' product line(s).',
    null,
    null,
    'delivery',
    p_delivery_id,
    '/operations/deliveries/' || p_delivery_id::text
  );

  return jsonb_build_object(
    'delivery_number', v_delivery.delivery_number,
    'lines', v_lines
  );
end;
$$;

comment on function public.validate_delivery(uuid) is
  'Validate a delivery: deduct stock, append ledger entries, close the document. Refuses to go negative.';
