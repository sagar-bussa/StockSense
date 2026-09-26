-- ===================================================================
-- 007 · Operational documents and their lines
-- ===================================================================
-- Four document families share the same lifecycle (draft -> waiting -> ready
-- -> done, or canceled), the same numbering approach, and the same rule that
-- only a validate_* function may move them to Done.

-- ===================================================================
-- Receipts (incoming)
-- ===================================================================

create table if not exists public.receipts (
  id            uuid primary key default gen_random_uuid(),
  receipt_number text not null,
  supplier_id   uuid not null references public.suppliers (id) on delete restrict,
  warehouse_id  uuid not null references public.warehouses (id) on delete restrict,
  -- Default receiving location. Individual lines may override it.
  location_id   uuid not null,
  reference     text,
  notes         text,
  status        public.doc_status not null default 'draft',
  expected_at   timestamptz,

  created_by    uuid references public.profiles (id) on delete set null,
  validated_by  uuid references public.profiles (id) on delete set null,
  validated_at  timestamptz,
  canceled_by   uuid references public.profiles (id) on delete set null,
  canceled_at   timestamptz,
  cancel_reason text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint receipts_number_key unique (receipt_number),
  constraint receipts_reference_length check (reference is null or char_length(reference) <= 80),

  -- A completed receipt must be fully attributed. The converse is guaranteed
  -- by assert_valid_transition, which refuses to reach Done outside a
  -- validate_receipt call.
  constraint receipts_done_is_attributed
    check (status <> 'done' or (validated_at is not null and validated_by is not null)),
  constraint receipts_canceled_is_attributed
    check (status <> 'canceled' or canceled_at is not null),

  constraint receipts_location_belongs_to_warehouse
    foreign key (location_id, warehouse_id)
    references public.locations (id, warehouse_id)
);

comment on table public.receipts is
  'Incoming goods from a supplier. Stock only moves when the receipt is validated.';

create index if not exists receipts_status_idx on public.receipts (status, created_at desc);
create index if not exists receipts_warehouse_idx on public.receipts (warehouse_id, created_at desc);
create index if not exists receipts_supplier_idx on public.receipts (supplier_id);
create index if not exists receipts_number_trgm_idx
  on public.receipts using gin (receipt_number extensions.gin_trgm_ops);

create or replace trigger receipts_set_updated_at
  before update on public.receipts
  for each row execute function public.set_updated_at();

create table if not exists public.receipt_items (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.receipts (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete restrict,
  -- Lines carry their own location so one receipt can land on several racks.
  location_id uuid not null,
  quantity    numeric(14, 3) not null,
  unit_cost   numeric(14, 2),
  notes       text,
  created_at  timestamptz not null default now(),

  constraint receipt_items_line_unique unique (receipt_id, product_id, location_id),
  constraint receipt_items_quantity_positive check (quantity > 0),
  constraint receipt_items_cost_non_negative check (unit_cost is null or unit_cost >= 0)
);

comment on table public.receipt_items is 'Lines of a receipt. Editing is blocked once the receipt is done.';

create index if not exists receipt_items_receipt_idx on public.receipt_items (receipt_id);
create index if not exists receipt_items_product_idx on public.receipt_items (product_id);

-- ===================================================================
-- Deliveries (outgoing)
-- ===================================================================

create table if not exists public.deliveries (
  id             uuid primary key default gen_random_uuid(),
  delivery_number text not null,
  customer_id    uuid not null references public.customers (id) on delete restrict,
  warehouse_id   uuid not null references public.warehouses (id) on delete restrict,
  location_id    uuid not null,
  reference      text,
  notes          text,
  status         public.doc_status not null default 'draft',
  expected_at    timestamptz,

  created_by     uuid references public.profiles (id) on delete set null,
  validated_by   uuid references public.profiles (id) on delete set null,
  validated_at   timestamptz,
  canceled_by    uuid references public.profiles (id) on delete set null,
  canceled_at    timestamptz,
  cancel_reason  text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint deliveries_number_key unique (delivery_number),
  constraint deliveries_reference_length check (reference is null or char_length(reference) <= 80),
  constraint deliveries_done_is_attributed
    check (status <> 'done' or (validated_at is not null and validated_by is not null)),
  constraint deliveries_canceled_is_attributed
    check (status <> 'canceled' or canceled_at is not null),

  constraint deliveries_location_belongs_to_warehouse
    foreign key (location_id, warehouse_id)
    references public.locations (id, warehouse_id)
);

comment on table public.deliveries is
  'Outgoing goods to a customer. Stock only leaves when the delivery is validated.';

create index if not exists deliveries_status_idx on public.deliveries (status, created_at desc);
create index if not exists deliveries_warehouse_idx on public.deliveries (warehouse_id, created_at desc);
create index if not exists deliveries_customer_idx on public.deliveries (customer_id);
create index if not exists deliveries_number_trgm_idx
  on public.deliveries using gin (delivery_number extensions.gin_trgm_ops);

create or replace trigger deliveries_set_updated_at
  before update on public.deliveries
  for each row execute function public.set_updated_at();

create table if not exists public.delivery_items (
  id          uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete restrict,
  location_id uuid not null,
  quantity    numeric(14, 3) not null,
  unit_price  numeric(14, 2),
  notes       text,
  created_at  timestamptz not null default now(),

  constraint delivery_items_line_unique unique (delivery_id, product_id, location_id),
  constraint delivery_items_quantity_positive check (quantity > 0),
  constraint delivery_items_price_non_negative check (unit_price is null or unit_price >= 0)
);

create index if not exists delivery_items_delivery_idx on public.delivery_items (delivery_id);
create index if not exists delivery_items_product_idx on public.delivery_items (product_id);

-- ===================================================================
-- Internal transfers
-- ===================================================================

create table if not exists public.transfers (
  id                    uuid primary key default gen_random_uuid(),
  transfer_number       text not null,
  source_warehouse_id   uuid not null references public.warehouses (id) on delete restrict,
  source_location_id    uuid not null,
  destination_warehouse_id uuid not null references public.warehouses (id) on delete restrict,
  destination_location_id   uuid not null,
  reference             text,
  notes                 text,
  status                public.doc_status not null default 'draft',
  expected_at           timestamptz,

  created_by            uuid references public.profiles (id) on delete set null,
  validated_by          uuid references public.profiles (id) on delete set null,
  validated_at          timestamptz,
  canceled_by           uuid references public.profiles (id) on delete set null,
  canceled_at           timestamptz,
  cancel_reason         text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint transfers_number_key unique (transfer_number),
  -- Moving stock to where it already is is always a mistake.
  constraint transfers_distinct_locations
    check (source_location_id <> destination_location_id),
  constraint transfers_distinct_warehouses_or_locations
    check (
      source_warehouse_id <> destination_warehouse_id
      or source_location_id <> destination_location_id
    ),
  constraint transfers_done_is_attributed
    check (status <> 'done' or (validated_at is not null and validated_by is not null)),
  constraint transfers_canceled_is_attributed
    check (status <> 'canceled' or canceled_at is not null),

  constraint transfers_source_location_valid
    foreign key (source_location_id, source_warehouse_id)
    references public.locations (id, warehouse_id),
  constraint transfers_destination_location_valid
    foreign key (destination_location_id, destination_warehouse_id)
    references public.locations (id, warehouse_id)
);

comment on table public.transfers is
  'Movement of stock between locations. Total company stock is unchanged by a transfer.';

create index if not exists transfers_status_idx on public.transfers (status, created_at desc);
create index if not exists transfers_source_idx on public.transfers (source_warehouse_id, created_at desc);
create index if not exists transfers_number_trgm_idx
  on public.transfers using gin (transfer_number extensions.gin_trgm_ops);

create or replace trigger transfers_set_updated_at
  before update on public.transfers
  for each row execute function public.set_updated_at();

create table if not exists public.transfer_items (
  id          uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete restrict,
  quantity    numeric(14, 3) not null,
  notes       text,
  created_at  timestamptz not null default now(),

  constraint transfer_items_line_unique unique (transfer_id, product_id),
  constraint transfer_items_quantity_positive check (quantity > 0)
);

create index if not exists transfer_items_transfer_idx on public.transfer_items (transfer_id);
create index if not exists transfer_items_product_idx on public.transfer_items (product_id);

-- ===================================================================
-- Adjustments
-- ===================================================================
-- Created already-posted: the counting workflow in the brief has no draft
-- stage (you count, you confirm, the stock becomes the counted figure). The
-- `difference` column is generated, so the arithmetic cannot be wrong.

create table if not exists public.adjustments (
  id                uuid primary key default gen_random_uuid(),
  adjustment_number text not null,
  product_id        uuid not null references public.products (id) on delete restrict,
  warehouse_id      uuid not null references public.warehouses (id) on delete restrict,
  location_id       uuid not null,
  -- Quantity the system believed before the count, and what was actually
  -- counted on the floor. `difference` is derived, never supplied.
  system_quantity   numeric(14, 3) not null,
  counted_quantity  numeric(14, 3) not null,
  difference        numeric(14, 3) generated always as (counted_quantity - system_quantity) stored,
  reason            public.adjustment_reason not null,
  notes             text,
  status            public.doc_status not null default 'done',

  created_by        uuid references public.profiles (id) on delete set null,
  validated_by      uuid references public.profiles (id) on delete set null,
  validated_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint adjustments_number_key unique (adjustment_number),
  constraint adjustments_counted_non_negative check (counted_quantity >= 0),
  constraint adjustments_done_is_attributed
    check (status <> 'done' or validated_at is not null),

  constraint adjustments_location_belongs_to_warehouse
    foreign key (location_id, warehouse_id)
    references public.locations (id, warehouse_id)
);

comment on table public.adjustments is
  'Correction of recorded stock to a physical count. Posts immediately; `difference` is generated.';

create index if not exists adjustments_product_idx on public.adjustments (product_id, created_at desc);
create index if not exists adjustments_warehouse_idx on public.adjustments (warehouse_id, created_at desc);
create index if not exists adjustments_created_at_idx on public.adjustments (created_at desc);

create or replace trigger adjustments_set_updated_at
  before update on public.adjustments
  for each row execute function public.set_updated_at();
