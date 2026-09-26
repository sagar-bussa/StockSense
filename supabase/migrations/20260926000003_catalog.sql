-- ===================================================================
-- 003 · Catalog: categories and products
-- ===================================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text,
  status      public.entity_status not null default 'active',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categories_name_key unique (name),
  constraint categories_name_length check (char_length(trim(name)) between 2 and 80)
);

comment on table public.categories is
  'Product groupings such as Raw Materials or Packaging.';

create index if not exists categories_status_idx on public.categories (status);

create or replace trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ===================================================================
-- Products
-- ===================================================================

create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null,
  name             text not null,
  description      text,
  category_id      uuid references public.categories (id) on delete restrict,
  unit_of_measure  public.unit_of_measure not null default 'pcs',
  reorder_level    numeric(14, 3) not null default 0,
  -- Optional opening balance, applied once at creation time by
  -- create_product() as an 'initial' ledger entry so the opening stock is
  -- itself auditable rather than an unexplained number.
  initial_stock    numeric(14, 3) not null default 0,
  status           public.entity_status not null default 'active',
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint products_name_length check (char_length(trim(name)) between 2 and 160),
  constraint products_sku_length check (char_length(trim(sku)) between 2 and 48),
  constraint products_reorder_level_non_negative check (reorder_level >= 0),
  constraint products_initial_stock_non_negative check (initial_stock >= 0)
);

comment on table public.products is
  'Catalogue of stock-keeping items. Stock itself lives in `inventory` and its history in `stock_ledger`.';

comment on column products.initial_stock is
  'Opening balance applied at creation time. Not a running total - read `inventory` for current stock.';

-- Case-insensitive SKU uniqueness, so "abc-1" and "ABC-1" cannot both exist.
create unique index if not exists products_sku_key_ci on public.products (lower(trim(sku)));

create index if not exists products_category_idx on public.products (category_id);
create index if not exists products_status_idx on public.products (status);

-- Full-text search over the fields a warehouse worker would type.
alter table public.products
  add column if not exists search_document tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(sku, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) stored;

create index if not exists products_search_idx on public.products using gin (search_document);

-- Trigram index so partial SKUs ("STEEL") still match while typing.
create index if not exists products_sku_trgm_idx
  on public.products using gin (sku extensions.gin_trgm_ops);

create or replace trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ===================================================================
-- Immutable reference for the ledger
-- ===================================================================
-- A product is never hard-deleted: the ledger references it forever. This
-- trigger makes that structural rather than a convention, so a stray DELETE
-- from a future script cannot corrupt history.

create or replace function public.prevent_reference_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.stock_ledger where product_id = old.id) then
    raise exception
      'STOCKSENSE:This product has stock history and cannot be deleted. Archive it instead.'
      using errcode = 'P0001';
  end if;

  if exists (select 1 from public.inventory where product_id = old.id and quantity > 0) then
    raise exception
      'STOCKSENSE:This product still holds stock and cannot be deleted. Archive it instead.'
      using errcode = 'P0001';
  end if;

  return old;
end;
$$;

-- Deferred until `stock_ledger` and `inventory` exist (migration 006); see
-- 20260926000006_inventory.sql.
