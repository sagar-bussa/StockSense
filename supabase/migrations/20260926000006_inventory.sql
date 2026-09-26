-- ===================================================================
-- 006 · Inventory
-- ===================================================================
-- The current quantity of one product at one location. History lives in
-- `stock_ledger`; this table is only ever written by the validate_* RPCs.

create table if not exists public.inventory (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  location_id  uuid not null,
  quantity     numeric(14, 3) not null default 0,
  updated_at   timestamptz not null default now(),

  -- One row per product per location. This uniqueness is what makes an
  -- upsert on (product_id, location_id) safe under concurrency.
  constraint inventory_product_location_key unique (product_id, location_id),

  -- Negative stock is structurally impossible. The validate_* functions also
  -- check availability so they can return a helpful message, but this is the
  -- guarantee - it holds even for a direct write by a table owner.
  constraint inventory_quantity_non_negative check (quantity >= 0),

  -- Composite FK: guarantees the location really belongs to the warehouse
  -- named on this row. Without it, an inventory row could claim Rack A of
  -- Main Warehouse while pointing at Rack A of another site.
  constraint inventory_location_belongs_to_warehouse
    foreign key (location_id, warehouse_id)
    references public.locations (id, warehouse_id)
    on delete cascade
);

comment on table public.inventory is
  'Current quantity per product per location. Written only by the validate_* RPCs inside a transaction.';

create index if not exists inventory_warehouse_idx on public.inventory (warehouse_id);
create index if not exists inventory_location_idx on public.inventory (location_id);
create index if not exists inventory_product_idx on public.inventory (product_id);
-- Partial index for the low-stock sweep: only rows that actually hold stock.
create index if not exists inventory_nonzero_idx
  on public.inventory (product_id) where quantity > 0;

create or replace trigger inventory_set_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

-- ===================================================================
-- Reject direct writes
-- ===================================================================
-- `inventory` must only ever change through the validation functions, so that
-- the ledger and the quantity can never diverge. This trigger is the last line
-- of defence: RLS already blocks the client, and this blocks anything else.

create or replace function public.inventory_write_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The validation functions are SECURITY DEFINER owned by the table owner and
  -- set this flag around their work. Anything else attempting a write is
  -- refused.
  if coalesce(current_setting('stocksense.inventory_write', true), 'off') <> 'on' then
    raise exception
      'STOCKSENSE:Stock levels cannot be edited directly. Post a receipt, delivery, transfer or adjustment.'
      using errcode = 'P0001';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger inventory_no_direct_write
  before insert or update or delete on public.inventory
  for each row execute function public.inventory_write_guard();

revoke insert, update, delete on public.inventory from anon, authenticated;

-- ===================================================================
-- Product deletion guard (deferred from migration 003)
-- ===================================================================

drop trigger if exists products_prevent_delete on public.products;
create trigger products_prevent_delete
  before delete on public.products
  for each row execute function public.prevent_reference_delete();
