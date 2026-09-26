-- ===================================================================
-- 005 · Stock ledger
-- ===================================================================
-- The audit spine of the system. Every unit that moves writes exactly one row
-- here, inside the same transaction that changed `inventory`. If the two ever
-- disagree, the transaction rolled back.

create table if not exists public.stock_ledger (
  id                 bigint generated always as identity primary key,

  -- Denormalised product snapshot. A ledger entry must stay readable and
  -- meaningful even if the product is later renamed or archived, and must
  -- never hard-vanish.
  product_id         uuid not null references public.products (id) on delete restrict,
  product_name       text not null,
  sku                text not null,

  -- Where the stock now sits (the location whose quantity changed).
  warehouse_id       uuid not null references public.warehouses (id) on delete restrict,
  warehouse_name     text not null,
  location_id        uuid not null references public.locations (id) on delete restrict,
  location_name      text not null,

  transaction_type   public.tx_type not null,

  -- Signed change actually applied, and the balance either side of it.
  quantity_change    numeric(14, 3) not null,
  previous_quantity  numeric(14, 3) not null,
  new_quantity       numeric(14, 3) not null,

  -- Per product+location running total after this entry. Recomputed inside
  -- the writing transaction, so it cannot drift.
  running_balance    numeric(14, 3) not null,

  -- For transfers: the counterparty location. Null for every other type.
  source_location_id      uuid references public.locations (id) on delete restrict,
  destination_location_id uuid references public.locations (id) on delete restrict,

  reference_type     public.ref_type not null,
  reference_id       uuid,
  reference_number   text,

  reason             text,
  notes              text,

  -- Actor, denormalised for the same reason as the product snapshot: the
  -- audit trail has to outlive the user account.
  created_by         uuid references public.profiles (id) on delete set null,
  created_by_name    text,
  created_at         timestamptz not null default now(),

  -- A ledger row with no change to its balance is meaningless; guard it.
  constraint stock_ledger_quantities_consistent
    check (new_quantity = previous_quantity + quantity_change),
  constraint stock_ledger_previous_non_negative check (previous_quantity >= 0),
  constraint stock_ledger_new_non_negative check (new_quantity >= 0),
  constraint stock_ledger_quantity_positive check (quantity_change <> 0),
  -- A transfer must name both ends; nothing else may.
  constraint stock_ledger_transfer_sides
    check (
      (transaction_type in ('transfer_in', 'transfer_out') and
        source_location_id is not null and
        destination_location_id is not null and
        source_location_id <> destination_location_id)
      or
      (transaction_type not in ('transfer_in', 'transfer_out') and
        source_location_id is null and
        destination_location_id is null)
    )
);

comment on table public.stock_ledger is
  'Immutable record of every stock movement. Insert-only; updated/deleted rows are rejected by trigger.';

comment on column stock_ledger.running_balance is
  'Quantity of this product at this location immediately after this entry.';

create index if not exists stock_ledger_product_idx
  on public.stock_ledger (product_id, created_at desc);
create index if not exists stock_ledger_location_idx
  on public.stock_ledger (location_id, id);
create index if not exists stock_ledger_warehouse_idx
  on public.stock_ledger (warehouse_id, created_at desc);
create index if not exists stock_ledger_type_idx
  on public.stock_ledger (transaction_type, created_at desc);
create index if not exists stock_ledger_created_at_idx
  on public.stock_ledger (created_at desc);
create index if not exists stock_ledger_reference_idx
  on public.stock_ledger (reference_type, reference_id);
create index if not exists stock_ledger_sku_trgm_idx
  on public.stock_ledger using gin (sku extensions.gin_trgm_ops);

-- ===================================================================
-- Immutability
-- ===================================================================
-- A ledger that can be edited is not an audit trail. Block UPDATE and DELETE
-- at the database level, not merely by omitting RLS write policies - a
-- privileged session or a future migration could otherwise bypass RLS.

create or replace function public.forbid_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'STOCKSENSE:Stock ledger entries are permanent and cannot be modified or removed.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists stock_ledger_immutable on public.stock_ledger;
create trigger stock_ledger_immutable
  before update or delete on public.stock_ledger
  for each row execute function public.forbid_ledger_mutation();

-- Belt and braces: even a table owner connecting directly is refused.
revoke update, delete on public.stock_ledger from anon, authenticated;
