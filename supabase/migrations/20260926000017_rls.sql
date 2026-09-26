-- ===================================================================
-- 017 · Row Level Security
-- ===================================================================
-- Three rules govern this file:
--   1. Every table has RLS enabled and forced.
--   2. Client roles get SELECT plus exactly the writes they need, and nothing
--      else. `inventory`, `stock_ledger` and the document tables get no direct
--      write policies at all - those rows are only ever changed by the
--      SECURITY DEFINER functions, which is what keeps stock and history in
--      step.
--   3. `anon` gets nothing. Unauthenticated visitors cannot read a single row.
--
-- RLS is enabled but not yet forced on the tables, because a `FORCE`d table
-- also applies to the table owner, and the seed script needs to write through
-- the app's own RPCs. Reads are protected by the policies; writes are
-- additionally blocked by the `inventory` guard trigger and the ledger
-- immutability trigger, so no path exists for a client to mutate stock.

alter table public.profiles         enable row level security;
alter table public.warehouses       enable row level security;
alter table public.locations        enable row level security;
alter table public.user_warehouses  enable row level security;
alter table public.categories       enable row level security;
alter table public.products         enable row level security;
alter table public.suppliers        enable row level security;
alter table public.customers        enable row level security;
alter table public.inventory        enable row level security;
alter table public.stock_ledger     enable row level security;
alter table public.receipts         enable row level security;
alter table public.receipt_items    enable row level security;
alter table public.deliveries       enable row level security;
alter table public.delivery_items   enable row level security;
alter table public.transfers        enable row level security;
alter table public.transfer_items   enable row level security;
alter table public.adjustments      enable row level security;
alter table public.notifications    enable row level security;

-- Nobody, not even an unauthenticated visitor.
revoke all on all tables in schema public from anon;

-- ===================================================================
-- profiles
-- ===================================================================
-- Readable by any signed-in user so names can be shown on audit trails and
-- document headers. Writable only by the owner, and only by an admin for the
-- role column (enforced in `update_profile_role`).

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- The self-update policy above only controls *which rows* may be updated, not
-- *which columns*. Without the column grants below, any user could run
--   update profiles set role = 'admin' where id = auth.uid()
-- and promote themselves. Grant UPDATE per column instead of per table, so the
-- table-level privilege the browser role holds by default is removed first.
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, phone) on public.profiles to authenticated;

-- ===================================================================
-- warehouses / locations
-- ===================================================================
-- Scoped reads: a warehouse worker sees the sites they are assigned to.
-- Writes are admin-only, matching the brief ("Admin: manage warehouses").

drop policy if exists warehouses_select on public.warehouses;
create policy warehouses_select on public.warehouses
  for select to authenticated
  using (public.can_access_warehouse(id) or public.is_manager());

drop policy if exists warehouses_admin_write on public.warehouses;
create policy warehouses_admin_write on public.warehouses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations
  for select to authenticated
  using (public.can_access_warehouse(warehouse_id) or public.is_manager());

drop policy if exists locations_admin_write on public.locations;
create policy locations_admin_write on public.locations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===================================================================
-- user_warehouses
-- ===================================================================
-- A user may read their own grants. Only an admin may change them.

drop policy if exists user_warehouses_select on public.user_warehouses;
create policy user_warehouses_select on public.user_warehouses
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_warehouses_admin_write on public.user_warehouses;
create policy user_warehouses_admin_write on public.user_warehouses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ===================================================================
-- categories / products
-- ===================================================================
-- Readable by everyone signed in - the catalogue is shared. Written by
-- managers. Deletion is additionally refused by a trigger when history exists.

drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated
  using (true);

drop policy if exists categories_manager_write on public.categories;
create policy categories_manager_write on public.categories
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated
  using (true);

drop policy if exists products_manager_write on public.products;
create policy products_manager_write on public.products
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ===================================================================
-- suppliers / customers
-- ===================================================================

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
  for select to authenticated
  using (true);

drop policy if exists suppliers_manager_write on public.suppliers;
create policy suppliers_manager_write on public.suppliers
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated
  using (true);

drop policy if exists customers_manager_write on public.customers;
create policy customers_manager_write on public.customers
  for all to authenticated
  using (public.is_manager())
  with check (public.is_manager());

-- ===================================================================
-- inventory
-- ===================================================================
-- SELECT only, scoped to accessible warehouses. There is deliberately no
-- INSERT/UPDATE/DELETE policy: the only way a quantity changes is through a
-- validate_* function, which is also the only thing that writes the ledger.

drop policy if exists inventory_select on public.inventory;
create policy inventory_select on public.inventory
  for select to authenticated
  using (public.can_access_warehouse(warehouse_id));

-- ===================================================================
-- stock_ledger
-- ===================================================================
-- Read-only by design. No write policy exists, and the table additionally
-- refuses UPDATE and DELETE at the trigger level.

drop policy if exists stock_ledger_select on public.stock_ledger;
create policy stock_ledger_select on public.stock_ledger
  for select to authenticated
  using (public.can_access_warehouse(warehouse_id));

-- ===================================================================
-- Documents
-- ===================================================================
-- Scoped reads, and no direct writes. Creation and validation both go through
-- functions that re-check permissions and lock the rows.

drop policy if exists receipts_select on public.receipts;
create policy receipts_select on public.receipts
  for select to authenticated
  using (public.can_access_warehouse(warehouse_id));

drop policy if exists receipt_items_select on public.receipt_items;
create policy receipt_items_select on public.receipt_items
  for select to authenticated
  using (
    exists (
      select 1 from public.receipts r
      where r.id = receipt_id
        and public.can_access_warehouse(r.warehouse_id)
    )
  );

drop policy if exists deliveries_select on public.deliveries;
create policy deliveries_select on public.deliveries
  for select to authenticated
  using (public.can_access_warehouse(warehouse_id));

drop policy if exists delivery_items_select on public.delivery_items;
create policy delivery_items_select on public.delivery_items
  for select to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.id = delivery_id
        and public.can_access_warehouse(d.warehouse_id)
    )
  );

-- A transfer is visible if the caller can see either end: you need to know
-- stock is arriving at your site even when it is leaving another.
drop policy if exists transfers_select on public.transfers;
create policy transfers_select on public.transfers
  for select to authenticated
  using (
    public.can_access_warehouse(source_warehouse_id)
    or public.can_access_warehouse(destination_warehouse_id)
  );

drop policy if exists transfer_items_select on public.transfer_items;
create policy transfer_items_select on public.transfer_items
  for select to authenticated
  using (
    exists (
      select 1 from public.transfers t
      where t.id = transfer_id
        and (
          public.can_access_warehouse(t.source_warehouse_id)
          or public.can_access_warehouse(t.destination_warehouse_id)
        )
    )
  );

drop policy if exists adjustments_select on public.adjustments;
create policy adjustments_select on public.adjustments
  for select to authenticated
  using (public.can_access_warehouse(warehouse_id));

-- ===================================================================
-- notifications
-- ===================================================================
-- Strictly personal. A user can read and mark-read only their own alerts.

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ===================================================================
-- Function grants
-- ===================================================================
-- Unauthenticated callers get no function execution. Authenticated callers get
-- only the functions the application actually calls.

-- PostgreSQL grants EXECUTE on every new function to PUBLIC by default, and
-- PUBLIC includes both anon and authenticated. Revoking from `anon` alone
-- therefore leaves the function callable by an unauthenticated client, which
-- PostgREST will happily expose. So the default is cleared for the whole
-- schema first, and each function is then granted back explicitly below.
--
-- This is deliberately not `alter default privileges`: it would only affect
-- functions created after this statement, leaving the ones from migrations
-- 002-016 still world-callable.
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

-- RLS policies below call these to decide visibility, and a policy cannot run
-- a function the invoking role may not execute. They are read-only helpers
-- that answer a question about the *caller* and return nothing about the
-- data, so granting them to the signed-in role is safe; anon has no policies
-- and no grants anywhere, so it gets nothing.
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.can_access_warehouse(uuid) to authenticated;
grant execute on function public.can_access_location(uuid) to authenticated;

revoke all on function public.get_my_profile(uuid) from anon;
grant execute on function public.get_my_profile(uuid) to authenticated;

revoke all on function public.create_product(text, text, uuid, public.unit_of_measure, numeric, numeric, text, uuid) from anon;
grant execute on function public.create_product(text, text, uuid, public.unit_of_measure, numeric, numeric, text, uuid) to authenticated;

revoke all on function public.create_receipt(uuid, uuid, uuid, text, text, timestamptz, jsonb) from anon;
grant execute on function public.create_receipt(uuid, uuid, uuid, text, text, timestamptz, jsonb) to authenticated;

revoke all on function public.update_receipt(uuid, uuid, uuid, text, text, timestamptz, jsonb) from anon;
grant execute on function public.update_receipt(uuid, uuid, uuid, text, text, timestamptz, jsonb) to authenticated;

revoke all on function public.validate_receipt(uuid) from anon;
grant execute on function public.validate_receipt(uuid) to authenticated;

revoke all on function public.create_delivery(uuid, uuid, uuid, text, text, timestamptz, jsonb) from anon;
grant execute on function public.create_delivery(uuid, uuid, uuid, text, text, timestamptz, jsonb) to authenticated;

revoke all on function public.update_delivery(uuid, uuid, uuid, text, text, timestamptz, jsonb) from anon;
grant execute on function public.update_delivery(uuid, uuid, uuid, text, text, timestamptz, jsonb) to authenticated;

revoke all on function public.validate_delivery(uuid) from anon;
grant execute on function public.validate_delivery(uuid) to authenticated;

revoke all on function public.check_delivery_availability(uuid) from anon;
grant execute on function public.check_delivery_availability(uuid) to authenticated;

revoke all on function public.create_transfer(uuid, uuid, uuid, uuid, text, text, timestamptz, jsonb) from anon;
grant execute on function public.create_transfer(uuid, uuid, uuid, uuid, text, text, timestamptz, jsonb) to authenticated;

revoke all on function public.update_transfer(uuid, uuid, uuid, text, text, timestamptz, jsonb) from anon;
grant execute on function public.update_transfer(uuid, uuid, uuid, text, text, timestamptz, jsonb) to authenticated;

revoke all on function public.validate_transfer(uuid) from anon;
grant execute on function public.validate_transfer(uuid) to authenticated;

revoke all on function public.check_transfer_availability(uuid) from anon;
grant execute on function public.check_transfer_availability(uuid) to authenticated;

revoke all on function public.post_adjustment(uuid, uuid, numeric, public.adjustment_reason, text) from anon;
grant execute on function public.post_adjustment(uuid, uuid, numeric, public.adjustment_reason, text) to authenticated;

revoke all on function public.change_document_status(public.ref_type, uuid, public.doc_status) from anon;
grant execute on function public.change_document_status(public.ref_type, uuid, public.doc_status) to authenticated;

revoke all on function public.cancel_document(public.ref_type, uuid, text) from anon;
grant execute on function public.cancel_document(public.ref_type, uuid, text) to authenticated;

revoke all on function public.get_location_stock(uuid, uuid) from anon;
grant execute on function public.get_location_stock(uuid, uuid) to authenticated;

-- Internal engine: never callable from a client. The validation functions
-- reach it as the owner.
revoke all on function public.apply_stock_movement(uuid, uuid, numeric, public.tx_type, public.ref_type, uuid, text, text, uuid, uuid, text) from anon, authenticated;

revoke all on function public.notify(uuid, public.notification_type, public.severity, text, text, text, uuid, public.ref_type, uuid, text) from anon, authenticated;
revoke all on function public.sync_stock_alert(uuid, uuid) from anon, authenticated;
revoke all on function public.product_total_stock(uuid) from anon, authenticated;
