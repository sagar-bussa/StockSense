-- ===================================================================
-- 014 · Internal transfers
-- ===================================================================
-- The invariant that makes this module different: total company stock is
-- unchanged. The source is debited and the destination credited inside one
-- transaction, and two ledger rows are written (transfer_out / transfer_in) so
-- both locations show the movement in their own history.

create or replace function public.create_transfer(
  p_source_warehouse_id      uuid,
  p_source_location_id       uuid,
  p_destination_warehouse_id uuid,
  p_destination_location_id  uuid,
  p_reference                text default null,
  p_notes                    text default null,
  p_expected_at              timestamptz default null,
  p_items                    jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transfer_id uuid;
  v_item        jsonb;
  v_quantity    numeric;
begin
  if public.current_role() is null then
    raise exception 'STOCKSENSE:You do not have permission to create transfers.'
      using errcode = 'P0001';
  end if;

  if p_source_location_id = p_destination_location_id then
    raise exception 'STOCKSENSE:The source and destination must be different locations.'
      using errcode = 'P0001';
  end if;

  if not public.can_access_warehouse(p_source_warehouse_id)
     or not public.can_access_warehouse(p_destination_warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to both ends of this transfer.'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'STOCKSENSE:Add at least one product to the transfer.'
      using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item ->> 'quantity')::numeric;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'STOCKSENSE:Enter a quantity greater than zero for every line.'
        using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.products where id = (v_item ->> 'product_id')::uuid and status = 'active') then
      raise exception 'STOCKSENSE:One of the selected products is no longer available.'
        using errcode = 'P0001';
    end if;
  end loop;

  insert into public.transfers (
    transfer_number,
    source_warehouse_id, source_location_id,
    destination_warehouse_id, destination_location_id,
    reference, notes, expected_at, status, created_by
  )
  values (
    public.next_transfer_number(),
    p_source_warehouse_id, p_source_location_id,
    p_destination_warehouse_id, p_destination_location_id,
    nullif(trim(p_reference), ''), p_notes, p_expected_at, 'draft', auth.uid()
  )
  returning id into v_transfer_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.transfer_items (transfer_id, product_id, quantity)
    values (
      v_transfer_id,
      (v_item ->> 'product_id')::uuid,
      (v_item ->> 'quantity')::numeric
    );
  end loop;

  return v_transfer_id;
end;
$$;

comment on function public.create_transfer is
  'Create a draft transfer. Does not move stock.';

-- ===================================================================
-- update_transfer
-- ===================================================================

create or replace function public.update_transfer(
  p_transfer_id uuid,
  p_source_location_id      uuid default null,
  p_destination_location_id uuid default null,
  p_reference               text default null,
  p_notes                   text default null,
  p_expected_at             timestamptz default null,
  p_items                   jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transfer public.transfers%rowtype;
  v_item     jsonb;
  v_quantity numeric;
begin
  select * into v_transfer from public.transfers where id = p_transfer_id for update;
  if not found then
    raise exception 'STOCKSENSE:This transfer no longer exists.' using errcode = 'P0001';
  end if;

  if v_transfer.status = 'done' then
    raise exception 'STOCKSENSE:This transfer is already completed and cannot be edited.'
      using errcode = 'P0001';
  end if;
  if v_transfer.status = 'canceled' then
    raise exception 'STOCKSENSE:This transfer is canceled and cannot be edited.'
      using errcode = 'P0001';
  end if;
  if not public.can_access_warehouse(v_transfer.source_warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to this transfer.' using errcode = 'P0001';
  end if;

  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'STOCKSENSE:A transfer needs at least one line.' using errcode = 'P0001';
    end if;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
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
    end loop;

    delete from public.transfer_items where transfer_id = p_transfer_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      insert into public.transfer_items (transfer_id, product_id, quantity)
      values (p_transfer_id, (v_item ->> 'product_id')::uuid, (v_item ->> 'quantity')::numeric);
    end loop;
  end if;

  update public.transfers
  set source_location_id      = coalesce(p_source_location_id, source_location_id),
      destination_location_id = coalesce(p_destination_location_id, destination_location_id),
      reference               = coalesce(p_reference, reference),
      notes                   = coalesce(p_notes, notes),
      expected_at             = coalesce(p_expected_at, expected_at)
  where id = p_transfer_id;

  return p_transfer_id;
end;
$$;

-- ===================================================================
-- check_transfer_availability
-- ===================================================================
-- Same pre-flight idea as deliveries, against the source location.

create or replace function public.check_transfer_availability(p_transfer_id uuid)
returns table (
  product_id     uuid,
  product_name   text,
  sku            text,
  requested      numeric,
  available      numeric,
  is_sufficient  boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ti.product_id,
    p.name,
    p.sku,
    ti.quantity,
    coalesce(i.quantity, 0),
    coalesce(i.quantity, 0) >= ti.quantity
  from public.transfer_items ti
  join public.products p on p.id = ti.product_id
  join public.transfers t on t.id = ti.transfer_id
  left join public.inventory i
    on i.product_id = ti.product_id and i.location_id = t.source_location_id
  where ti.transfer_id = p_transfer_id
  order by p.name;
$$;

-- ===================================================================
-- validate_transfer
-- ===================================================================
-- Two movements per line. Order matters: the source is debited first, so if
-- stock is short the destination is never credited and the transaction unwinds
-- with no partial state.

create or replace function public.validate_transfer(p_transfer_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_transfer public.transfers%rowtype;
  v_item     public.transfer_items%rowtype;
  v_entry    public.stock_ledger%rowtype;
  v_lines    jsonb := '[]'::jsonb;
  v_shortfall text;
  v_source_name text;
  v_destination_name text;
  v_actor    uuid := auth.uid();
begin
  select * into v_transfer from public.transfers where id = p_transfer_id for update;

  if not found then
    raise exception 'STOCKSENSE:This transfer no longer exists.' using errcode = 'P0001';
  end if;

  if v_transfer.status = 'done' then
    raise exception
      'STOCKSENSE:Transfer % has already been completed. Stock was moved only once.',
      v_transfer.transfer_number
      using errcode = 'P0001';
  end if;

  if v_transfer.status = 'canceled' then
    raise exception 'STOCKSENSE:This transfer is canceled and cannot be validated.'
      using errcode = 'P0001';
  end if;

  if v_transfer.source_location_id = v_transfer.destination_location_id then
    raise exception 'STOCKSENSE:The source and destination must be different locations.'
      using errcode = 'P0001';
  end if;

  if not public.can_access_warehouse(v_transfer.source_warehouse_id)
     or not public.can_access_warehouse(v_transfer.destination_warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to both ends of this transfer.'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.transfer_items where transfer_id = p_transfer_id) then
    raise exception 'STOCKSENSE:Add at least one product before completing this transfer.'
      using errcode = 'P0001';
  end if;

  perform public.assert_valid_transition(v_transfer.status, 'done');

  -- Human-readable location names for the ledger reasons. A uuid in a reason
  -- field is technically accurate and practically useless.
  select
    max(name) filter (where id = v_transfer.source_location_id),
    max(name) filter (where id = v_transfer.destination_location_id)
  into v_source_name, v_destination_name
  from public.locations
  where id in (v_transfer.source_location_id, v_transfer.destination_location_id);

  if exists (
    select 1
    from public.transfer_items ti
    left join public.inventory i
      on i.product_id = ti.product_id and i.location_id = v_transfer.source_location_id
    where ti.transfer_id = p_transfer_id
      and coalesce(i.quantity, 0) < ti.quantity
  ) then
    select string_agg(
      format('%s (%s): requested %s, available %s at source',
        p.name, p.sku, ti.quantity, coalesce(i.quantity, 0)),
      '; ' order by p.name
    )
    into v_shortfall
    from public.transfer_items ti
    join public.products p on p.id = ti.product_id
    left join public.inventory i
      on i.product_id = ti.product_id and i.location_id = v_transfer.source_location_id
    where ti.transfer_id = p_transfer_id
      and coalesce(i.quantity, 0) < ti.quantity;

    raise exception 'STOCKSENSE:Insufficient stock. %', v_shortfall
      using errcode = 'P0001';
  end if;

  for v_item in
    select * from public.transfer_items where transfer_id = p_transfer_id order by id
  loop
    -- Out of the source location.
    v_entry := public.apply_stock_movement(
      v_item.product_id,
      v_transfer.source_location_id,
      -v_item.quantity,
      'transfer_out',
      'transfer',
      p_transfer_id,
      v_transfer.transfer_number,
      'Moved to ' || v_destination_name,
      v_transfer.source_location_id,
      v_transfer.destination_location_id,
      v_item.notes
    );

    -- Into the destination location.
    v_entry := public.apply_stock_movement(
      v_item.product_id,
      v_transfer.destination_location_id,
      v_item.quantity,
      'transfer_in',
      'transfer',
      p_transfer_id,
      v_transfer.transfer_number,
      'Moved from ' || v_source_name,
      v_transfer.source_location_id,
      v_transfer.destination_location_id,
      v_item.notes
    );

    perform public.sync_stock_alert(v_item.product_id, v_entry.warehouse_id);

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_item.product_id,
      'quantity', v_item.quantity,
      'source_location_id', v_transfer.source_location_id,
      'destination_location_id', v_transfer.destination_location_id
    );
  end loop;

  update public.transfers
  set status = 'done', validated_by = v_actor, validated_at = now()
  where id = p_transfer_id;

  perform public.notify(
    v_transfer.destination_warehouse_id,
    'transfer_completed',
    'info',
    'Transfer ' || v_transfer.transfer_number || ' completed',
    'Stock was moved for '
      || (select count(*) from public.transfer_items where transfer_id = p_transfer_id)
      || ' product line(s).',
    null,
    null,
    'transfer',
    p_transfer_id,
    '/operations/transfers/' || p_transfer_id::text
  );

  return jsonb_build_object(
    'transfer_number', v_transfer.transfer_number,
    'lines', v_lines
  );
end;
$$;

comment on function public.validate_transfer(uuid) is
  'Complete a transfer: debit the source, credit the destination, write both ledger rows. Company total is unchanged.';
