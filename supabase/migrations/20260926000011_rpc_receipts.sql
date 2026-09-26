-- ===================================================================
-- 011 · Receipts (incoming stock)
-- ===================================================================
-- Lifecycle:
--   draft -> waiting -> ready -> done      (validation posts the stock)
--   any non-done state -> canceled
--
-- The defining rule from the brief: stock moves *only* on validation. Nothing
-- in create_receipt or update_receipt touches `inventory`.

-- ===================================================================
-- create_receipt
-- ===================================================================

create or replace function public.create_receipt(
  p_supplier_id  uuid,
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
  v_receipt_id uuid;
  v_item       jsonb;
  v_product_id uuid;
  v_location   uuid;
  v_quantity   numeric;
  v_count      integer := 0;
begin
  if not public.is_manager() and not public.current_role() = 'warehouse_staff' then
    raise exception 'STOCKSENSE:You do not have permission to create receipts.'
      using errcode = 'P0001';
  end if;

  if not public.can_access_warehouse(p_warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to this warehouse.'
      using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'STOCKSENSE:Add at least one product to the receipt.'
      using errcode = 'P0001';
  end if;

  -- Validate every line before inserting anything, so a bad line cannot leave
  -- a half-written receipt behind.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_location   := coalesce(nullif(v_item ->> 'location_id', '')::uuid, p_location_id);
    v_quantity   := (v_item ->> 'quantity')::numeric;

    if v_product_id is null then
      raise exception 'STOCKSENSE:Every line needs a product.' using errcode = 'P0001';
    end if;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'STOCKSENSE:Enter a quantity greater than zero for every line.'
        using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.products where id = v_product_id and status = 'active') then
      raise exception 'STOCKSENSE:One of the selected products is no longer available.'
        using errcode = 'P0001';
    end if;
    if not public.can_access_location(v_location) then
      raise exception 'STOCKSENSE:You do not have access to one of the selected locations.'
        using errcode = 'P0001';
    end if;

    v_count := v_count + 1;
  end loop;

  insert into public.receipts (
    receipt_number, supplier_id, warehouse_id, location_id,
    reference, notes, expected_at, status, created_by
  )
  values (
    public.next_receipt_number(), p_supplier_id, p_warehouse_id, p_location_id,
    nullif(trim(p_reference), ''), p_notes, p_expected_at, 'draft', auth.uid()
  )
  returning id into v_receipt_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.receipt_items (receipt_id, product_id, location_id, quantity, unit_cost)
    values (
      v_receipt_id,
      (v_item ->> 'product_id')::uuid,
      coalesce(nullif(v_item ->> 'location_id', '')::uuid, p_location_id),
      (v_item ->> 'quantity')::numeric,
      nullif(v_item ->> 'unit_cost', '')::numeric
    );
  end loop;

  return v_receipt_id;
end;
$$;

comment on function public.create_receipt is
  'Create a draft receipt. Does not change stock under any circumstances.';

-- ===================================================================
-- update_receipt
-- ===================================================================
-- Only while still editable. Done is terminal, which assert_valid_transition
-- already enforces, so this cannot be used to rewrite validated history.

create or replace function public.update_receipt(
  p_receipt_id  uuid,
  p_supplier_id uuid default null,
  p_location_id uuid default null,
  p_reference   text default null,
  p_notes       text default null,
  p_expected_at timestamptz default null,
  p_items       jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_receipt  public.receipts%rowtype;
  v_item     jsonb;
  v_location uuid;
  v_quantity numeric;
begin
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if not found then
    raise exception 'STOCKSENSE:This receipt no longer exists.' using errcode = 'P0001';
  end if;

  if v_receipt.status = 'done' then
    raise exception 'STOCKSENSE:This receipt is already validated and cannot be edited.'
      using errcode = 'P0001';
  end if;
  if v_receipt.status = 'canceled' then
    raise exception 'STOCKSENSE:This receipt is canceled and cannot be edited.'
      using errcode = 'P0001';
  end if;
  if not public.can_access_warehouse(v_receipt.warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to this receipt.' using errcode = 'P0001';
  end if;

  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
      raise exception 'STOCKSENSE:A receipt needs at least one line.' using errcode = 'P0001';
    end if;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      v_location := coalesce(nullif(v_item ->> 'location_id', '')::uuid, p_location_id, v_receipt.location_id);
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

    delete from public.receipt_items where receipt_id = p_receipt_id;

    for v_item in select * from jsonb_array_elements(p_items)
    loop
      insert into public.receipt_items (receipt_id, product_id, location_id, quantity, unit_cost)
      values (
        p_receipt_id,
        (v_item ->> 'product_id')::uuid,
        coalesce(nullif(v_item ->> 'location_id', '')::uuid, p_location_id, v_receipt.location_id),
        (v_item ->> 'quantity')::numeric,
        nullif(v_item ->> 'unit_cost', '')::numeric
      );
    end loop;
  end if;

  update public.receipts
  set supplier_id  = coalesce(p_supplier_id, supplier_id),
      location_id  = coalesce(p_location_id, location_id),
      reference    = coalesce(p_reference, reference),
      notes        = coalesce(p_notes, notes),
      expected_at  = coalesce(p_expected_at, expected_at)
  where id = p_receipt_id;

  return p_receipt_id;
end;
$$;

-- ===================================================================
-- validate_receipt
-- ===================================================================
-- The moment stock increases. Everything below happens in one transaction:
-- lock, guard, apply, audit, close, alert.

create or replace function public.validate_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_receipt  public.receipts%rowtype;
  v_item     public.receipt_items%rowtype;
  v_entry    public.stock_ledger%rowtype;
  v_lines    jsonb := '[]'::jsonb;
  v_actor    uuid := auth.uid();
begin
  -- Lock the document first. Two concurrent validations serialise here, and the
  -- second one sees status='done' and is refused. This is what makes duplicate
  -- validation impossible rather than merely unlikely.
  select * into v_receipt from public.receipts where id = p_receipt_id for update;

  if not found then
    raise exception 'STOCKSENSE:This receipt no longer exists.' using errcode = 'P0001';
  end if;

  if v_receipt.status = 'done' then
    raise exception
      'STOCKSENSE:Receipt % has already been validated. Stock was only added once.',
      v_receipt.receipt_number
      using errcode = 'P0001';
  end if;

  if v_receipt.status = 'canceled' then
    raise exception 'STOCKSENSE:This receipt is canceled and cannot be validated.'
      using errcode = 'P0001';
  end if;

  if not public.can_access_warehouse(v_receipt.warehouse_id) then
    raise exception 'STOCKSENSE:You do not have access to this receipt.' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.receipt_items where receipt_id = p_receipt_id) then
    raise exception 'STOCKSENSE:Add at least one product before validating this receipt.'
      using errcode = 'P0001';
  end if;

  perform public.assert_valid_transition(v_receipt.status, 'done');

  for v_item in
    select * from public.receipt_items where receipt_id = p_receipt_id order by id
  loop
    v_entry := public.apply_stock_movement(
      v_item.product_id,
      v_item.location_id,
      v_item.quantity,
      'receipt',
      'receipt',
      p_receipt_id,
      v_receipt.receipt_number,
      'Goods received',
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

  update public.receipts
  set status = 'done', validated_by = v_actor, validated_at = now()
  where id = p_receipt_id;

  perform public.notify(
    v_receipt.warehouse_id,
    'receipt_validated',
    'info',
    'Receipt ' || v_receipt.receipt_number || ' validated',
    'Stock was added for '
      || (select count(*) from public.receipt_items where receipt_id = p_receipt_id)
      || ' product line(s).',
    null,
    null,
    'receipt',
    p_receipt_id,
    '/operations/receipts/' || p_receipt_id::text
  );

  return jsonb_build_object(
    'receipt_number', v_receipt.receipt_number,
    'lines', v_lines
  );
end;
$$;

comment on function public.validate_receipt(uuid) is
  'Validate a receipt: increase stock, append ledger entries, close the document. Atomic and non-repeatable.';
