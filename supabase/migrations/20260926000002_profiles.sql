-- ===================================================================
-- 002 · Profiles, warehouses, locations, warehouse grants, role helpers
-- ===================================================================
-- Declaration order follows the foreign-key graph:
--   profiles -> warehouses -> locations -> user_warehouses
-- `warehouses.manager_id` points at profiles, so profiles has to exist
-- first, and `user_warehouses` points at both, so it has to exist last.

-- ===================================================================
-- Profiles
-- ===================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  role        public.app_role  not null default 'warehouse_staff',
  avatar_url  text,
  phone       text,
  is_active   boolean         not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 120)
);

comment on table public.profiles is
  'One row per auth.users row. Carries the application role and display name.';

create index if not exists profiles_role_idx on public.profiles (role);

create or replace trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ===================================================================
-- Handle new users
-- ===================================================================
-- Signup must not depend on the client also inserting a profile row, or a
-- user could end up role-less and invisible. New accounts are created here
-- with the least-privileged role; an admin promotes them.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email,
    'warehouse_staff'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================================================================
-- Role helpers
-- ===================================================================
-- SECURITY DEFINER + STABLE so policies can read the caller's role without
-- risking infinite recursion through the profiles RLS policy. A plain
-- `select role from profiles where id = auth.uid()` inside a policy on
-- `profiles` would recurse; this breaks the cycle because the function
-- bypasses RLS on the table it reads.

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role from public.profiles where id = auth.uid() and is_active), null);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_role() in ('admin', 'inventory_manager');
$$;

-- ===================================================================
-- Warehouses
-- ===================================================================

create table if not exists public.warehouses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null,
  address    text,
  city       text,
  country    text,
  phone      text,
  email      text,
  manager_id uuid references public.profiles (id) on delete set null,
  notes      text,
  status     public.entity_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warehouses_name_key unique (name),
  constraint warehouses_code_key unique (code),
  constraint warehouses_code_format check (code ~ '^[A-Z0-9][A-Z0-9-]{1,15}$'),
  constraint warehouses_name_length check (char_length(trim(name)) between 2 and 120)
);

comment on table public.warehouses is
  'Physical sites. A warehouse owns locations, and locations hold stock.';

create index if not exists warehouses_status_idx on public.warehouses (status);

create or replace trigger warehouses_set_updated_at
  before update on public.warehouses
  for each row execute function public.set_updated_at();

-- ===================================================================
-- Locations
-- ===================================================================

create table if not exists public.locations (
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  name         text not null,
  code         text not null,
  kind         public.location_kind not null default 'rack',
  notes        text,
  status       public.entity_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint locations_code_unique_per_warehouse unique (warehouse_id, code),
  constraint locations_name_length check (char_length(trim(name)) between 1 and 80),

  -- Referenced by inventory's composite foreign key, which is what guarantees
  -- an inventory row can never name a location from a different warehouse.
  constraint locations_id_warehouse_unique unique (id, warehouse_id)
);

comment on table public.locations is
  'A storage position inside a warehouse: Rack A, Production Floor, Main Store.';

create index if not exists locations_warehouse_idx on public.locations (warehouse_id);

create or replace trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- ===================================================================
-- Warehouse grants
-- ===================================================================
-- Warehouse Staff may only read and operate on the warehouses they are
-- assigned to. Admins and managers implicitly see everything, so this table
-- only has to record the exceptions.

create table if not exists public.user_warehouses (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, warehouse_id)
);

comment on table public.user_warehouses is
  'Explicit warehouse grants for warehouse_staff. Managers and admins bypass this table.';

create index if not exists user_warehouses_warehouse_idx
  on public.user_warehouses (warehouse_id);

-- ===================================================================
-- Access predicates
-- ===================================================================
-- Single source of truth for "may this user see that row". Policies and RPCs
-- both call them, so a permission change is one edit.

create or replace function public.can_access_warehouse(p_warehouse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_warehouse_id is not null
    and (
      public.is_manager()
      or exists (
        select 1
        from public.user_warehouses uw
        where uw.user_id = auth.uid()
          and uw.warehouse_id = p_warehouse_id
      )
    );
$$;

create or replace function public.can_access_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_location_id is not null
    and exists (
      select 1
      from public.locations l
      where l.id = p_location_id
        and public.can_access_warehouse(l.warehouse_id)
    );
$$;

-- ===================================================================
-- get_my_profile
-- ===================================================================
-- Returns the signed-in user's profile with their warehouse grants already
-- resolved, so the client needs one round-trip to know what it may show.
-- The argument is accepted but ignored: a user may always read their own
-- profile, never someone else's, through this function.

create or replace function public.get_my_profile(p_user_id uuid default null)
returns table (
  id            uuid,
  full_name     text,
  email         text,
  role          public.app_role,
  avatar_url    text,
  phone         text,
  is_active     boolean,
  created_at    timestamptz,
  updated_at    timestamptz,
  warehouse_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.avatar_url,
    p.phone,
    p.is_active,
    p.created_at,
    p.updated_at,
    case
      when public.is_manager() then
        coalesce(
          (select array_agg(w.id) from public.warehouses w where w.status = 'active'),
          '{}'::uuid[]
        )
      else
        coalesce(
          (select array_agg(uw.warehouse_id) from public.user_warehouses uw where uw.user_id = p.id),
          '{}'::uuid[]
        )
    end as warehouse_ids
  from public.profiles p
  where p.id = auth.uid();
$$;

comment on function public.get_my_profile(uuid) is
  'Signed-in user profile plus accessible warehouse ids. Ignores its argument by design.';
