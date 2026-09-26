-- ===================================================================
-- 018 · Realtime, notification helpers, and remaining client functions
-- ===================================================================

-- ===================================================================
-- Realtime
-- ===================================================================
-- Validating a receipt on a tablet should move the dashboard, the product
-- list and the ledger on the office desktop without a refresh. The client
-- subscribes to these tables and invalidates the matching query caches.

do $$
declare
  v_missing text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  select string_agg(t, ', ') into v_missing
  from unnest(array['inventory', 'stock_ledger', 'products', 'notifications', 'receipts', 'deliveries', 'transfers', 'adjustments']) as t
  where not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
  );

  if v_missing is not null then
    execute format(
      'alter publication supabase_realtime add table %s',
      v_missing
    );
  end if;
end
$$;

-- RLS applies to Realtime payloads too, which is the behaviour we want: a
-- warehouse worker is never pushed another site's rows even if the filter
-- were wrong. `full` identity means UPDATE events carry the new row.
alter table public.inventory     replica identity full;
alter table public.stock_ledger  replica identity full;
alter table public.products     replica identity full;
alter table public.notifications replica identity full;

-- ===================================================================
-- Notification helpers
-- ===================================================================

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.notifications
  set is_read = true, read_at = now()
  where id = p_notification_id
    and user_id = auth.uid()
    and not is_read;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
  set is_read = true, read_at = now()
  where user_id = auth.uid()
    and not is_read;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.notifications
  where user_id = auth.uid() and not is_read;
$$;

-- ===================================================================
-- Role administration
-- ===================================================================
-- An admin promoting a colleague. Funnelled through a function so the role
-- column is never writable by a direct `update`, which a compromised
-- warehouse-staff session would otherwise use to escalate itself.

create or replace function public.update_profile_role(
  p_user_id uuid,
  p_role    public.app_role
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'STOCKSENSE:Only an admin can change a user''s role.'
      using errcode = 'P0001';
  end if;

  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'STOCKSENSE:You cannot remove your own admin access.'
      using errcode = 'P0001';
  end if;

  update public.profiles set role = p_role where id = p_user_id;

  if not found then
    raise exception 'STOCKSENSE:That user no longer exists.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.set_user_warehouses(
  p_user_id      uuid,
  p_warehouse_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'STOCKSENSE:Only an admin can change warehouse access.'
      using errcode = 'P0001';
  end if;

  delete from public.user_warehouses where user_id = p_user_id;

  insert into public.user_warehouses (user_id, warehouse_id)
  select p_user_id, unnest(coalesce(p_warehouse_ids, '{}'::uuid[]))
  on conflict do nothing;
end;
$$;

-- ===================================================================
-- Global search
-- ===================================================================
-- One query for the command palette across products, warehouses and every
-- document family. Wrapped in a function so it can union across sources the
-- client cannot join directly, and so the RLS scoping is applied once.

create or replace function public.global_search(
  p_query   text,
  p_limit   integer default 8
)
returns table (
  kind        text,
  id          uuid,
  title       text,
  subtitle    text,
  href        text,
  sort_weight integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select nullif(trim(p_query), '') as term
  ),
  matches as (
    select
      'product'::text       as kind,
      p.id,
      p.name                as title,
      coalesce(c.name, 'Uncategorised') || ' · ' || p.sku as subtitle,
      '/products/' || p.id::text as href,
      1                     as sort_weight,
      -- Prefix hits outrank substring hits.
      case when p.name ilike (select term || '%' from q) then 0
           when p.sku  ilike (select term || '%' from q) then 1
           else 2 end       as rank
    from public.products p
    left join public.categories c on c.id = p.category_id
    where (select term from q) is not null
      and p.status = 'active'
      and (p.name ilike '%' || (select term from q) || '%'
        or p.sku  ilike '%' || (select term from q) || '%')

    union all

    select
      'warehouse', w.id, w.name,
      w.code || coalesce(' · ' || w.city, ''),
      '/warehouses/' || w.id::text, 2,
      case when w.name ilike (select term || '%' from q) then 0 else 1 end
    from public.warehouses w
    where (select term from q) is not null
      and w.status = 'active'
      and public.can_access_warehouse(w.id)
      and (w.name ilike '%' || (select term from q) || '%'
        or w.code ilike '%' || (select term from q) || '%')

    union all

    select 'receipt', r.id, r.receipt_number,
      coalesce(s.name, '') || ' · ' || r.status::text,
      '/operations/receipts/' || r.id::text, 3,
      case when r.receipt_number ilike (select term || '%' from q) then 0 else 1 end
    from public.receipts r
    join public.suppliers s on s.id = r.supplier_id
    where (select term from q) is not null
      and public.can_access_warehouse(r.warehouse_id)
      and r.receipt_number ilike '%' || (select term from q) || '%'

    union all

    select 'delivery', d.id, d.delivery_number,
      coalesce(c.name, '') || ' · ' || d.status::text,
      '/operations/deliveries/' || d.id::text, 3,
      case when d.delivery_number ilike (select term || '%' from q) then 0 else 1 end
    from public.deliveries d
    join public.customers c on c.id = d.customer_id
    where (select term from q) is not null
      and public.can_access_warehouse(d.warehouse_id)
      and d.delivery_number ilike '%' || (select term from q) || '%'

    union all

    select 'transfer', t.id, t.transfer_number,
      t.status::text,
      '/operations/transfers/' || t.id::text, 3,
      case when t.transfer_number ilike (select term || '%' from q) then 0 else 1 end
    from public.transfers t
    where (select term from q) is not null
      and (public.can_access_warehouse(t.source_warehouse_id)
        or public.can_access_warehouse(t.destination_warehouse_id))
      and t.transfer_number ilike '%' || (select term from q) || '%'

    union all

    select 'adjustment', a.id, a.adjustment_number,
      a.reason::text,
      '/operations/adjustments', 3, 1
    from public.adjustments a
    where (select term from q) is not null
      and public.can_access_warehouse(a.warehouse_id)
      and a.adjustment_number ilike '%' || (select term from q) || '%'
  )
  select m.kind, m.id, m.title, m.subtitle, m.href, m.sort_weight
  from matches m
  order by m.sort_weight, m.rank, m.title
  limit greatest(1, least(coalesce(p_limit, 8), 25));
$$;

comment on function public.global_search is
  'Cross-entity search for the command palette, scoped to what the caller may see.';

-- ===================================================================
-- Grants for the notification and admin helpers
-- ===================================================================

-- The functions defined in this file were created *after* migration 017 ran its
-- schema-wide `revoke ... from public`, so they still carry PostgreSQL's
-- default EXECUTE grant to PUBLIC - which includes both anon and
-- authenticated, and which PostgREST will happily expose. Clear it here for
-- the whole schema, then grant back only what the application calls.
do $$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public', v_fn.signature);
  end loop;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.update_profile_role(uuid, public.app_role) to authenticated;
grant execute on function public.set_user_warehouses(uuid, uuid[]) to authenticated;
grant execute on function public.global_search(text, integer) to authenticated;

revoke all on function public.mark_notification_read(uuid) from anon;
revoke all on function public.mark_all_notifications_read() from anon;
revoke all on function public.unread_notification_count() from anon;
revoke all on function public.update_profile_role(uuid, public.app_role) from anon;
revoke all on function public.set_user_warehouses(uuid, uuid[]) from anon;
revoke all on function public.global_search(text, integer) from anon;
