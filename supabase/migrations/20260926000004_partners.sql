-- ===================================================================
-- 004 · Trading partners: suppliers and customers
-- ===================================================================
-- Deliberately simple lookup tables. The brief has no requirement for their
-- own documents or ledgers, so over-modelling them would only add surface.

create table if not exists public.suppliers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  email        text,
  phone        text,
  address      text,
  country      text,
  notes        text,
  status       public.entity_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint suppliers_name_key unique (name),
  constraint suppliers_name_length check (char_length(trim(name)) between 2 and 160),
  constraint suppliers_email_format check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.suppliers is 'Vendors goods are received from.';

create index if not exists suppliers_status_idx on public.suppliers (status);

create or replace trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

create table if not exists public.customers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  contact_name text,
  email        text,
  phone        text,
  address      text,
  country      text,
  notes        text,
  status       public.entity_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint customers_name_key unique (name),
  constraint customers_name_length check (char_length(trim(name)) between 2 and 160),
  constraint customers_email_format check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

comment on table public.customers is 'Recipients goods are delivered to.';

create index if not exists customers_status_idx on public.customers (status);

create or replace trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();
