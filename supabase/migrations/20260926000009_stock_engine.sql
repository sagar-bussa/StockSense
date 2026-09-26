-- ===================================================================
-- 009 · The stock movement engine
-- ===================================================================
-- Every quantity change in the database funnels through exactly one function.
-- It applies the delta, writes the matching immutable ledger row, and records
-- the resulting balance. If any part fails the whole transaction unwinds, so
-- `inventory` and `stock_ledger` cannot disagree.

-- ===================================================================
-- apply_stock_movement
-- ===================================================================
-- Why this is not done in the browser:
--   * a delivery touches N inventory rows and writes N ledger rows - a partial
--     failure would leave stock and history inconsistent;
--   * concurrent validations of two documents touching the same product would
--     race on read-modify-write unless the row is locked;
--   * the ledger must be written in the same transaction as the quantity.
-- FOR UPDATE gives the second point; doing it here gives the third.

create or replace function public.apply_stock_movement(
  p_product_id             uuid,
  p_location_id            uuid,
  p_delta                  numeric,
  p_transaction_type       public.tx_type,
  p_reference_type         public.ref_type,
  p_reference_id           uuid,
  p_reference_number       text,
  p_reason                 text default null,
  p_source_location_id     uuid default null,
  p_destination_location_id uuid default null,
  p_notes                  text default null
)
returns public.stock_ledger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inventory_id uuid;
  v_warehouse_id  uuid;
  v_warehouse_name text;
  v_location_name text;
  v_product_name  text;
  v_product_sku   text;
  v_actor         uuid := auth.uid();
  v_actor_name    text;
  v_previous      numeric(14, 3) := 0;
  v_new           numeric(14, 3);
  v_entry         public.stock_ledger%rowtype;
begin
  if p_delta = 0 then
    raise exception 'STOCKSENSE:A movement of zero has no effect. Enter a quantity greater than zero.'
      using errcode = 'P0001';
  end if;

  -- Snapshot the descriptive fields now, while the referenced rows are known
  -- to exist. The ledger keeps these denormalised on purpose: an entry has to
  -- stay meaningful even if the product is later renamed or archived.
  select l.warehouse_id, l.name, w.name
    into v_warehouse_id, v_location_name, v_warehouse_name
  from public.locations l
  join public.warehouses w on w.id = l.warehouse_id
  where l.id = p_location_id;

  if not found then
    raise exception 'STOCKSENSE:The selected location no longer exists. Refresh and try again.'
      using errcode = 'P0001';
  end if;

  select p.name, p.sku into v_product_name, v_product_sku
  from public.products p
  where p.id = p_product_id and p.status = 'active';

  if not found then
    raise exception 'STOCKSENSE:The selected product is unavailable. Refresh and try again.'
      using errcode = 'P0001';
  end if;

  select full_name into v_actor_name from public.profiles where id = v_actor;

  -- Permit writes to `inventory` for the duration of this transaction. The
  -- table's own guard rejects every other writer.
  perform set_config('stocksense.inventory_write', 'on', true);

  -- Serialise concurrent movements on the same product/location pair.
  select id, quantity into v_inventory_id, v_previous
  from public.inventory
  where product_id = p_product_id and location_id = p_location_id
  for update;

  if v_inventory_id is null then
    v_previous := 0;
  end if;

  v_new := v_previous + p_delta;

  -- Human-readable shortage, in the words the brief asks for.
  if v_new < 0 then
    raise exception
      'STOCKSENSE:Insufficient stock. Available: % units of "%". Requested: %.',
      v_previous, v_product_name, -p_delta
      using errcode = 'P0001';
  end if;

  if v_inventory_id is null then
    insert into public.inventory (product_id, warehouse_id, location_id, quantity)
    values (p_product_id, v_warehouse_id, p_location_id, v_new)
    returning id into v_inventory_id;
  else
    update public.inventory
    set quantity = v_new
    where id = v_inventory_id;
  end if;

  insert into public.stock_ledger (
    product_id, product_name, sku,
    warehouse_id, warehouse_name, location_id, location_name,
    transaction_type,
    quantity_change, previous_quantity, new_quantity, running_balance,
    source_location_id, destination_location_id,
    reference_type, reference_id, reference_number,
    reason, notes,
    created_by, created_by_name
  )
  values (
    p_product_id, v_product_name, v_product_sku,
    v_warehouse_id, v_warehouse_name, p_location_id, v_location_name,
    p_transaction_type,
    p_delta, v_previous, v_new, v_new,
    p_source_location_id, p_destination_location_id,
    p_reference_type, p_reference_id, p_reference_number,
    p_reason, p_notes,
    v_actor, v_actor_name
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

comment on function public.apply_stock_movement is
  'Single writer for inventory and stock_ledger. Locks the row, refuses negative stock, appends the audit entry.';

-- `running_balance` is stored per product+location, and v_new is exactly that
-- balance immediately after this entry, so no separate recomputation is needed
-- - and none can drift out of step with the quantity it describes.
