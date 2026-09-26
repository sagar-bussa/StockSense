-- ===================================================================
-- 016 · Views for the dashboard and every list screen
-- ===================================================================
-- SECURITY NOTE, and it is the important part of this file:
--
-- A Postgres view runs with the privileges of its *owner* by default, which
-- means it does NOT apply the RLS policies of the tables underneath it. A
-- naive `create view v_dashboard_kpis as select ... from stock_ledger` would
-- happily return every ledger row in the database to any signed-in warehouse
-- worker, no matter what the policies say. The failure is silent: the policies
-- look correct and the app looks correct.
--
-- `security_invoker = true` (PostgreSQL 15+) makes the view honour the calling
-- role's RLS, exactly like a direct query. Supabase runs PG 15+, so every view
-- below sets it. This is asserted at the end of the file as well.

-- ===================================================================
-- Inventory detail
-- ===================================================================
-- One row per product per location, with everything a list view needs. The
-- single source the stock tables, warehouse pages and product detail all read.

create or replace view public.v_inventory_detail
with (security_invoker = true)
as
select
  i.id,
  i.product_id,
  p.sku,
  p.name            as product_name,
  p.unit_of_measure,
  p.reorder_level,
  p.status          as product_status,
  p.category_id,
  c.name            as category_name,
  i.warehouse_id,
  w.name            as warehouse_name,
  w.code            as warehouse_code,
  i.location_id,
  l.name            as location_name,
  l.code            as location_code,
  l.kind            as location_kind,
  i.quantity,
  i.updated_at
from public.inventory i
join public.products   p on p.id = i.product_id
join public.warehouses w on w.id = i.warehouse_id
join public.locations  l on l.id = i.location_id
left join public.categories c on c.id = p.category_id;

comment on view public.v_inventory_detail is
  'Stock per product per location, with descriptive columns resolved. Honours RLS via security_invoker.';

-- ===================================================================
-- Product stock summary
-- ===================================================================
-- One row per product, totalled across every location the caller can see.
-- `stock_status` implements the brief's rules exactly:
--   quantity = 0            -> out_of_stock
--   quantity <= reorder     -> low_stock
--   otherwise               -> in_stock

create or replace view public.v_product_stock
with (security_invoker = true)
as
select
  p.id                                as product_id,
  p.sku,
  p.name                              as product_name,
  p.description,
  p.category_id,
  c.name                              as category_name,
  p.unit_of_measure,
  p.reorder_level,
  p.status                            as product_status,
  coalesce(sum(i.quantity) filter (where l.status = 'active'), 0)::numeric(14, 3)
                                      as total_quantity,
  count(distinct i.warehouse_id)      as warehouse_count,
  count(distinct i.location_id)       as location_count,
  max(i.updated_at)                   as last_movement_at,
  p.created_at,
  p.updated_at,
  case
    when coalesce(sum(i.quantity) filter (where l.status = 'active'), 0) <= 0
      then 'out_of_stock'
    when coalesce(sum(i.quantity) filter (where l.status = 'active'), 0) <= p.reorder_level
      then 'low_stock'
    else 'in_stock'
  end                                 as stock_status
from public.products p
left join public.inventory  i on i.product_id = p.id
left join public.locations  l on l.id = i.location_id
left join public.categories c on c.id = p.category_id
group by p.id, c.name;

comment on view public.v_product_stock is
  'Product totals with derived low/out-of-stock status. Honours RLS via security_invoker.';

-- ===================================================================
-- Dashboard KPIs
-- ===================================================================
-- All six headline numbers in one round-trip. Six separate count queries per
-- dashboard load is six round-trips and six chances for the tiles to disagree
-- with each other.

create or replace view public.v_dashboard_kpis
with (security_invoker = true)
as
with stock as (
  select * from public.v_product_stock where product_status = 'active'
),
warehouse_scope as (
  select distinct warehouse_id from public.v_inventory_detail
),
pending as (
  select
    (select count(*) from public.receipts
      where status in ('draft', 'waiting', 'ready'))            as pending_receipts,
    (select count(*) from public.deliveries
      where status in ('draft', 'waiting', 'ready'))            as pending_deliveries,
    (select count(*) from public.transfers
      where status in ('draft', 'waiting', 'ready'))            as pending_transfers,
    (select count(*) from public.transfers
      where status in ('draft', 'waiting', 'ready')
        and (expected_at::date = current_date or expected_at is null)) as transfers_today
)
select
  coalesce((select sum(total_quantity) from stock), 0)::numeric(14, 3) as total_units,
  (select count(*) from stock)                                      as active_products,
  (select count(*) from stock where stock_status = 'low_stock')     as low_stock_products,
  (select count(*) from stock where stock_status = 'out_of_stock')  as out_of_stock_products,
  (select count(*) from stock where total_quantity > 0)              as stocked_products,
  p.pending_receipts,
  p.pending_deliveries,
  p.pending_transfers,
  p.transfers_today,
  (select count(*) from warehouse_scope)                            as visible_warehouses,
  (select count(*) from public.products where status = 'active')   as total_products
from pending p;

comment on view public.v_dashboard_kpis is
  'All headline dashboard figures in a single row. Every figure comes from live data.';

-- ===================================================================
-- Daily movements (for the trend chart)
-- ===================================================================
-- Buckets the ledger into days and splits inbound from outbound, so the chart
-- does not have to aggregate thousands of rows in the browser.

create or replace view public.v_movements_daily
with (security_invoker = true)
as
select
  date_trunc('day', l.created_at)::date                       as day,
  coalesce(sum(l.quantity_change) filter (where l.quantity_change > 0), 0)::numeric(14, 3)
                                                               as received,
  coalesce(-sum(l.quantity_change) filter (where l.quantity_change < 0), 0)::numeric(14, 3)
                                                               as dispatched,
  coalesce(sum(l.quantity_change), 0)::numeric(14, 3)          as net,
  count(*)                                                     as entries
from public.stock_ledger l
group by 1;

comment on view public.v_movements_daily is
  'Ledger aggregated per day into received / dispatched / net. Feeds the movement chart.';

-- ===================================================================
-- Stock distribution
-- ===================================================================

create or replace view public.v_stock_by_category
with (security_invoker = true)
as
select
  p.category_id                            as category_id,
  coalesce(c.name, 'Uncategorised')        as category_name,
  coalesce(sum(i.quantity), 0)::numeric(14, 3)   as total_quantity,
  count(distinct p.id)                           as product_count
from public.inventory i
join public.products p on p.id = i.product_id
left join public.categories c on c.id = p.category_id
where p.status = 'active'
group by 1, 2;

create or replace view public.v_stock_by_warehouse
with (security_invoker = true)
as
select
  w.id                                as warehouse_id,
  w.name                              as warehouse_name,
  w.code                              as warehouse_code,
  coalesce(sum(i.quantity), 0)::numeric(14, 3) as total_quantity,
  count(distinct i.product_id)        as product_count,
  (select count(*) from public.locations l where l.warehouse_id = w.id) as location_count
from public.warehouses w
left join public.inventory i on i.warehouse_id = w.id
where w.status = 'active'
group by w.id, w.name, w.code;

comment on view public.v_stock_by_warehouse is
  'Stock totals per warehouse. Honours RLS, so a warehouse worker sees only their own site.';

-- ===================================================================
-- Attention lists
-- ===================================================================

create or replace view public.v_low_stock_products
with (security_invoker = true)
as
select
  product_id, sku, product_name, category_name, unit_of_measure,
  total_quantity, reorder_level,
  (reorder_level - total_quantity) as shortfall,
  stock_status
from public.v_product_stock
where product_status = 'active'
  and stock_status in ('low_stock', 'out_of_stock');

create or replace view public.v_recent_activity
with (security_invoker = true)
as
select
  l.id,
  l.transaction_type,
  l.quantity_change,
  l.previous_quantity,
  l.new_quantity,
  l.product_id,
  l.product_name,
  l.sku,
  l.warehouse_name,
  l.location_name,
  l.reference_type,
  l.reference_id,
  l.reference_number,
  l.reason,
  l.created_by_name,
  l.created_at
from public.stock_ledger l
order by l.id desc
limit 100;

comment on view public.v_recent_activity is
  'The 100 most recent ledger entries, for the dashboard activity feed.';

-- ===================================================================
-- Document list projection
-- ===================================================================
-- One shape across all four document families, so the shared list, filter and
-- status components work unchanged on receipts, deliveries and transfers.

create or replace view public.v_documents
with (security_invoker = true)
as
select
  r.id,
  'receipt'::public.ref_type                        as reference_type,
  r.receipt_number                                  as document_number,
  r.status,
  r.warehouse_id,
  w.name                                            as warehouse_name,
  r.reference,
  r.notes,
  r.expected_at,
  r.created_at,
  r.updated_at,
  r.validated_at,
  r.created_by,
  p.full_name                                       as created_by_name,
  r.validated_by,
  v.full_name                                       as validated_by_name,
  s.name                                            as partner_name,
  (s.email)::text                                   as partner_detail,
  (select count(*) from public.receipt_items ri where ri.receipt_id = r.id)  as line_count,
  (select coalesce(sum(ri.quantity), 0) from public.receipt_items ri where ri.receipt_id = r.id) as total_quantity
from public.receipts r
join public.warehouses w on w.id = r.warehouse_id
join public.suppliers  s on s.id = r.supplier_id
left join public.profiles p on p.id = r.created_by
left join public.profiles v on v.id = r.validated_by

union all

select
  d.id,
  'delivery'::public.ref_type,
  d.delivery_number,
  d.status,
  d.warehouse_id,
  w.name,
  d.reference,
  d.notes,
  d.expected_at,
  d.created_at,
  d.updated_at,
  d.validated_at,
  d.created_by,
  p.full_name,
  d.validated_by,
  v.full_name,
  c.name,
  (c.email)::text,
  (select count(*) from public.delivery_items di where di.delivery_id = d.id),
  (select coalesce(sum(di.quantity), 0) from public.delivery_items di where di.delivery_id = d.id)
from public.deliveries d
join public.warehouses w on w.id = d.warehouse_id
join public.customers  c on c.id = d.customer_id
left join public.profiles p on p.id = d.created_by
left join public.profiles v on v.id = d.validated_by

union all

select
  t.id,
  'transfer'::public.ref_type,
  t.transfer_number,
  t.status,
  t.source_warehouse_id,
  w.name,
  t.reference,
  t.notes,
  t.expected_at,
  t.created_at,
  t.updated_at,
  t.validated_at,
  t.created_by,
  p.full_name,
  t.validated_by,
  v.full_name,
  null,
  null,
  (select count(*) from public.transfer_items ti where ti.transfer_id = t.id),
  (select coalesce(sum(ti.quantity), 0) from public.transfer_items ti where ti.transfer_id = t.id)
from public.transfers t
join public.warehouses w on w.id = t.source_warehouse_id
left join public.profiles p on p.id = t.created_by
left join public.profiles v on v.id = t.validated_by;

comment on view public.v_documents is
  'Unified projection of receipts, deliveries and transfers for the shared list and filter UI.';

-- ===================================================================
-- Assert the security posture
-- ===================================================================
-- If someone later adds a view without security_invoker, this raises at the end
-- of the migration rather than silently leaking data in production.

do $$
declare
  v_offenders text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
  into v_offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and not coalesce((c.reloptions @> array['security_invoker=true']), false);

  if v_offenders is not null then
    raise exception
      'STOCKSENSE:view(s) % do not set security_invoker=true and would bypass RLS.',
      v_offenders;
  end if;
end
$$;
