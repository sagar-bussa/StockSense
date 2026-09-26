-- ===================================================================
-- 008 · Notifications
-- ===================================================================

create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  -- Recipient. NULL is not used: every alert has a concrete owner so a user
  -- never sees another person's alerts.
  user_id        uuid not null references public.profiles (id) on delete cascade,
  type           public.notification_type not null,
  severity       public.severity not null default 'info',
  title          text not null,
  message        text not null,

  -- Deep-link context. All optional, because not every alert relates to a
  -- product or a document.
  product_id     uuid references public.products (id) on delete cascade,
  warehouse_id   uuid references public.warehouses (id) on delete cascade,
  reference_type public.ref_type,
  reference_id   uuid,
  link           text,

  -- Used to suppress duplicates: one unread 'low_stock' alert per product
  -- rather than one per validation that happened to cross the threshold.
  dedupe_key     text,

  is_read        boolean not null default false,
  read_at        timestamptz,
  created_at     timestamptz not null default now(),

  constraint notifications_title_length check (char_length(title) between 1 and 160),
  constraint notifications_read_is_timestamped
    check ((not is_read) or read_at is not null)
);

comment on table public.notifications is
  'Per-user alerts for stock level changes and completed operations.';

create index if not exists notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where not is_read;
create index if not exists notifications_dedupe_idx
  on public.notifications (user_id, dedupe_key) where dedupe_key is not null and not is_read;

-- At most one *unread* notification per (user, dedupe_key). Once the user has
-- read it, a fresh occurrence can notify again - otherwise a product that
-- repeatedly dips below its reorder level would alert exactly once, ever.
create unique index if not exists notifications_dedupe_unread_key
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null and not is_read;

-- ===================================================================
-- Recipients
-- ===================================================================
-- Who hears about what. Alerts follow warehouse scope, so a warehouse that
-- runs out of steel pages its own staff and the managers, not the whole
-- company.

create or replace function public.alert_recipients(p_warehouse_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.profiles p
  where p.is_active
    and (
      p.role in ('admin', 'inventory_manager')
      or exists (
        select 1
        from public.user_warehouses uw
        where uw.user_id = p.id
          and uw.warehouse_id = p_warehouse_id
      )
    );
$$;

-- ===================================================================
-- Raise a notification
-- ===================================================================
-- Resolves recipients from warehouse scope and honours dedupe_key, so callers
-- only describe *what* happened and never *who* to tell.

create or replace function public.notify(
  p_warehouse_id  uuid,
  p_type          public.notification_type,
  p_severity      public.severity,
  p_title         text,
  p_message       text,
  p_dedupe_key    text default null,
  p_product_id    uuid default null,
  p_reference_type public.ref_type default null,
  p_reference_id  uuid default null,
  p_link          text default null
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.notifications (
    user_id, type, severity, title, message,
    product_id, warehouse_id, reference_type, reference_id, link, dedupe_key
  )
  select
    r as user_id, p_type, p_severity, p_title, p_message,
    p_product_id, p_warehouse_id, p_reference_type, p_reference_id, p_link, p_dedupe_key
  from public.alert_recipients(p_warehouse_id) as r
  where p_dedupe_key is null
     or not exists (
       select 1
       from public.notifications n
       where n.user_id = r
         and n.dedupe_key = p_dedupe_key
         and not n.is_read
     );

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.notify is
  'Fan a notification out to the users responsible for a warehouse, with optional unread-dedupe.';
