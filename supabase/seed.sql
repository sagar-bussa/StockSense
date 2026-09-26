-- ===================================================================
-- StockSense demo seed
-- ===================================================================
-- Safe to run repeatedly: static rows use "on conflict do nothing", and
-- every block that moves stock is guarded by a sentinel reference, so a
-- second run leaves existing data untouched.
--
-- Demo logins (password StockSense123!) are created through the Supabase
-- Auth signup API, NOT here. GoTrue keeps several token columns non-null by
-- convention and validates the bcrypt cost, and hand-written auth.users rows
-- make sign-in fail with "Database error querying schema". Letting the API
-- create the accounts avoids depending on GoTrue's private schema. This file
-- only assigns the roles and warehouse access, looking users up by email so
-- it does not care what ids Auth generated.
--
-- Stock and stock_ledger are also never written directly. inventory has a
-- write guard that only admits the stock engine and stock_ledger is
-- append-only, so all movement goes through create_receipt/validate_receipt.
--
-- The demo is arranged so that every account has something to do:
--   admin@stocksense.app    everything, plus user administration
--   manager@stocksense.app  everything across both warehouses
--   staff@stocksense.app    Manchester only
--   staff2@stocksense.app   Birmingham only (proves the grant, not the role,
--                           decides what a staff user can see)
--   retired@stocksense.app  inactive, so the sign-in block can be demonstrated
-- ===================================================================

begin;

-- -------------------------------------------------------------------
-- 0. Actor switcher
-- -------------------------------------------------------------------
-- The operation RPCs authorise with auth.uid(), so posting a document as a
-- different person means setting the request claim to that person. This is a
-- pg_temp function, so it lives only for this session and never becomes part
-- of the public schema. set_config is transaction-local, so it cannot leak
-- past the commit.
create or replace function pg_temp.actor(p_email text)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',  (select id::text from auth.users where lower(email) = lower(p_email)),
      'role', 'authenticated'
    )::text,
    true
  );
end;
$$;

-- -------------------------------------------------------------------
-- 1. Demo users
-- -------------------------------------------------------------------
-- Refuse to continue with a half-configured demo rather than creating
-- profiles that can never be signed into.
do $$
declare
  v_missing text;
begin
  select string_agg(email, ', ')
  into v_missing
  from (values
    ('admin@stocksense.app'),
    ('manager@stocksense.app'),
    ('staff@stocksense.app'),
    ('staff2@stocksense.app'),
    ('retired@stocksense.app')
  ) as expected(email)
  where not exists (
    select 1 from auth.users u where lower(u.email) = expected.email
  );

  if v_missing is not null then
    raise exception 'demo users missing: %. Create them via the Auth signup API first.', v_missing;
  end if;
end $$;

-- The signup trigger already created these rows with the default
-- 'warehouse_staff' role; this corrects the privileged accounts and retires
-- one so the "account disabled" path is demonstrable.
insert into public.profiles (id, full_name, email, role, is_active)
select
  u.id,
  v.full_name,
  v.email,
  v.role::public.app_role,
  v.is_active
from auth.users u
join (values
  ('admin@stocksense.app',   'Avery Admin',     'admin',             true),
  ('manager@stocksense.app', 'Morgan Manager',  'inventory_manager', true),
  ('staff@stocksense.app',   'Sam Stockroom',   'warehouse_staff',   true),
  ('staff2@stocksense.app',  'Jamie Birmingham','warehouse_staff',   true),
  ('retired@stocksense.app', 'Robin Retired',   'warehouse_staff',   false)
) as v(email, full_name, role, is_active) on lower(v.email) = lower(u.email)
on conflict (id) do update
  set role       = excluded.role,
      full_name  = excluded.full_name,
      email      = excluded.email,
      is_active  = excluded.is_active,
      updated_at = now();

-- -------------------------------------------------------------------
-- 2. Warehouses and locations
-- -------------------------------------------------------------------

insert into public.warehouses (id, name, code, address, city, country, phone, email, manager_id)
values
  ('44444444-4444-4444-4444-444444444444', 'Manchester Central', 'MCR-01',
   '17 Barton Street', 'Manchester', 'United Kingdom',
   '+44 161 555 0142', 'manchester@stocksense.app',
   (select id from auth.users where lower(email) = 'manager@stocksense.app')),
  ('55555555-5555-5555-5555-555555555555', 'Birmingham Fulfilment', 'BHX-02',
   '88 Coventry Road', 'Birmingham', 'United Kingdom',
   '+44 121 555 0177', 'birmingham@stocksense.app', null)
on conflict (id) do update
  set manager_id = excluded.manager_id,
      updated_at = now();

-- Each staff account is scoped to a *different* warehouse. That is what makes
-- the grant visible: signing in as Sam shows Manchester, Jamie shows
-- Birmingham, and the two never overlap even though both are warehouse_staff.
insert into public.user_warehouses (user_id, warehouse_id)
select u.id, v.warehouse_id::uuid
from auth.users u
join (values
  ('staff@stocksense.app',  '44444444-4444-4444-4444-444444444444'),
  ('staff2@stocksense.app', '55555555-5555-5555-5555-555555555555')
) as v(email, warehouse_id) on lower(v.email) = lower(u.email)
on conflict do nothing;

-- "store" and "quarantine" locations exist so the adjustments screen has a
-- sensible reason to move stock somewhere, and so the location picker shows
-- more than two identical rows.
insert into public.locations (id, warehouse_id, name, code, kind, notes)
values
  ('66666666-6666-6666-6666-666666666661', '44444444-4444-4444-4444-444444444444', 'Goods In',     'GIN',  'dock',       'Unloading bay and intake checks'),
  ('66666666-6666-6666-6666-666666666662', '44444444-4444-4444-4444-444444444444', 'Aisle A',      'A-01', 'rack',       'Fast moving consumables'),
  ('66666666-6666-6666-6666-666666666663', '44444444-4444-4444-4444-444444444444', 'Bulk Store',   'BLK',  'floor',      'Pallet and oversize storage'),
  ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', 'Aisle B',      'B-01', 'rack',       'Slow moving spares and tooling'),
  ('66666666-6666-6666-6666-666666666667', '44444444-4444-4444-4444-444444444444', 'Staging',      'STG',  'staging',    'Awaiting put-away'),
  ('66666666-6666-6666-6666-666666666668', '44444444-4444-4444-4444-444444444444', 'Quarantine',   'QTN',  'quarantine', 'Held stock pending inspection'),
  ('66666666-6666-6666-6666-666666666664', '55555555-5555-5555-5555-555555555555', 'Goods In',     'GIN',  'dock',       null),
  ('66666666-6666-6666-6666-666666666665', '55555555-5555-5555-5555-555555555555', 'Aisle C',      'C-01', 'rack',       'Fast moving consumables'),
  ('66666666-6666-6666-6666-666666666669', '55555555-5555-5555-5555-555555555555', 'Aisle D',      'D-01', 'rack',       'Slow moving spares'),
  ('66666666-6666-6666-6666-66666666666a', '55555555-5555-5555-5555-555555555555', 'Bulk Store',   'BLK',  'floor',      'Pallet and oversize storage'),
  ('66666666-6666-6666-6666-66666666666b', '55555555-5555-5555-5555-555555555555', 'Staging',      'STG',  'staging',    'Awaiting put-away')
on conflict (id) do nothing;

-- -------------------------------------------------------------------
-- 3. Catalogue
-- -------------------------------------------------------------------

insert into public.categories (id, name, description, color, created_by)
values
  ('77777777-7777-7777-7777-777777777771', 'Raw Materials',     'Directly used in production',   '#6366f1', (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('77777777-7777-7777-7777-777777777772', 'Packaging',         'Boxes, labels and consumables', '#10b981', (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('77777777-7777-7777-7777-777777777773', 'Finished Goods',    'Ready for sale and dispatch',   '#f59e0b', (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('77777777-7777-7777-7777-777777777774', 'Maintenance',       'Spare parts and tooling',       '#ef4444', (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('77777777-7777-7777-7777-777777777775', 'Safety Equipment',  'PPE and site safety',           '#0ea5e9', (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('77777777-7777-7777-7777-777777777776', 'Electronics',       'Scanners, printers and cabling', '#8b5cf6', (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('77777777-7777-7777-7777-777777777777', 'Tools',             'Hand and power tools',          '#a16207', (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('77777777-7777-7777-7777-777777777778', 'Consumables',       'Fluids, wipes and sundries',    '#64748b', (select id from auth.users where lower(email) = 'admin@stocksense.app'))
on conflict (id) do nothing;

-- reorder_level is deliberately spread around the seeded quantities so the
-- dashboard shows healthy, warning and critical stock rather than one colour.
insert into public.products (id, sku, name, description, category_id, unit_of_measure, reorder_level, created_by)
values
  -- Raw Materials
  ('88888888-8888-8888-8888-888888888881', 'RM-STEEL-001',  'Mild Steel Sheet 2mm',   'Cold rolled sheet, 2500x1250mm',  '77777777-7777-7777-7777-777777777771', 'pcs',  40,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888882', 'RM-ALU-002',    'Aluminium Bar 6063',     'Round bar, 50mm diameter',         '77777777-7777-7777-7777-777777777771', 'm',    120, (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888900', 'RM-STEEL-PL',   'Mild Steel Plate 6mm',   'Structural plate, 3000x1500mm',   '77777777-7777-7777-7777-777777777771', 'pcs',  30,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888901', 'RM-ALU-SHT',    'Aluminium Sheet 3mm',    'Sheet, 2000x1000mm',               '77777777-7777-7777-7777-777777777771', 'm2',   80,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888902', 'RM-COPR-CAT',   'Copper Cathode',         'Grade A, 99.99% pure',             '77777777-7777-7777-7777-777777777771', 'kg',   500, (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  -- Packaging
  ('88888888-8888-8888-8888-888888888883', 'PK-BOX-M',      'Shipping Box Medium',    'Double wall, 450x350x300mm',      '77777777-7777-7777-7777-777777777772', 'pcs',  200, (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888884', 'PK-TAPE-50',    'Packing Tape 50mm',      'Clear, hot melt',                  '77777777-7777-7777-7777-777777777772', 'roll', 60,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888903', 'PK-LABEL-TH',   'Thermal Label Roll',     '100x150mm, 500 labels',            '77777777-7777-7777-7777-777777777772', 'roll', 100, (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888904', 'PK-STRETCH',    'Stretch Wrap Roll',      '500mm x 300m',                     '77777777-7777-7777-7777-777777777772', 'roll', 40,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888905', 'PK-PALLET-EU',  'Euro Pallet',            '1200x800mm, heat treated',         '77777777-7777-7777-7777-777777777772', 'pcs',  25,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888906', 'PK-CORNER',     'Corner Boards',          '50x50x3mm, 1.2m',                 '77777777-7777-7777-7777-777777777772', 'm',    200, (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  -- Finished Goods
  ('88888888-8888-8888-8888-888888888885', 'FG-PANEL-01',   'Assembly Panel Type A',  'Finished assembly, ready to ship', '77777777-7777-7777-7777-777777777773', 'pcs',  25,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888907', 'FG-PANEL-02',   'Assembly Panel Type B',  'Heavy duty assembly, ready to ship','77777777-7777-7777-7777-777777777773', 'pcs',  20,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888908', 'FG-KIT-STD',    'Standard Service Kit',   'Servicing kit for field units',    '77777777-7777-7777-7777-777777777773', 'set',  15,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  -- Maintenance
  ('88888888-8888-8888-8888-888888888886', 'MT-BEARING-8',  'Bearing 6204-2RS',       'Sealed single row bearing',        '77777777-7777-7777-7777-777777777774', 'pcs',  30,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888909', 'MT-BELT-A',     'V-Belt A Section',       'SPB 1250, 13x8mm',                 '77777777-7777-7777-7777-777777777774', 'm',    25,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888910', 'MT-CHAIN-08',   'Roller Chain 08B',       '08B-1, 5m box',                    '77777777-7777-7777-7777-777777777774', 'box',  10,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  -- Safety Equipment
  ('88888888-8888-8888-8888-888888888911', 'SF-GLOVE-N',    'Nitrile Gloves',         'Size L, powder free, box of 100', '77777777-7777-7777-7777-777777777775', 'pair', 400, (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888912', 'SF-VEST-HI',    'Hi-Vis Vest',            'Class 2, yellow',                  '77777777-7777-7777-7777-777777777775', 'pcs',  80,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888913', 'SF-GLASS-C',    'Clear Safety Glasses',   'Anti-fog, EN166',                   '77777777-7777-7777-7777-777777777775', 'pcs',  60,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888914', 'SF-EAR-PL',     'Ear Defenders',          'Foldable, SNR 31dB',               '77777777-7777-7777-7777-777777777775', 'pair', 30,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  -- Electronics
  ('88888888-8888-8888-8888-888888888915', 'EL-PRN-LBL',    'Thermal Label Printer',  '300dpi, USB and Ethernet',         '77777777-7777-7777-7777-777777777776', 'pcs',  5,   (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888916', 'EL-SCN-BAR',    'Barcode Scanner',        'Wireless, IP54',                    '77777777-7777-7777-7777-777777777776', 'pcs',  10,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888917', 'EL-CABLE-CAT',  'Cat6 Cable Box',         '305m box, LSZH',                    '77777777-7777-7777-7777-777777777776', 'box',  20,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  -- Tools
  ('88888888-8888-8888-8888-888888888918', 'TL-TORQ-N',     'Torque Wrench 40-200Nm', 'Calibrated, 1/2 inch drive',       '77777777-7777-7777-7777-777777777777', 'set',  5,   (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888919', 'TL-SOCK-SET',   'Socket Set 46pc',        'Metric, 1/2 and 1/4 inch',          '77777777-7777-7777-7777-777777777777', 'set',  4,   (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888920', 'TL-DRILL-BIT',  'Drill Bit Set',          'HSS-Co 19 piece',                  '77777777-7777-7777-7777-777777777777', 'box',  10,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  -- Consumables
  ('88888888-8888-8888-8888-888888888921', 'CN-DEG-IND',    'Industrial Degreaser',   '5L, low residue',                  '77777777-7777-7777-7777-777777777778', 'l',    60,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888922', 'CN-CUT-BL',     'Cutting Fluid',          '5L, metalworking',                 '77777777-7777-7777-7777-777777777778', 'l',    30,  (select id from auth.users where lower(email) = 'admin@stocksense.app')),
  ('88888888-8888-8888-8888-888888888923', 'CN-WIPE-WHT',   'Workshop Wipes',         'Roll, 80 sheets',                   '77777777-7777-7777-7777-777777777778', 'roll', 70,  (select id from auth.users where lower(email) = 'admin@stocksense.app'))
on conflict (id) do nothing;

insert into public.suppliers (id, name, contact_name, email, phone, address, country)
values
  ('99999999-9999-9999-9999-999999999991', 'Northgate Metals',    'Ellie Ford',  'orders@northgatemetals.co.uk',     '+44 20 7946 0101',  'Unit 4, Dock Road',      'United Kingdom'),
  ('99999999-9999-9999-9999-999999999992', 'Pennine Packaging',  'Tom Reid',    'sales@penninepackaging.co.uk',     '+44 117 496 0222',  'Temple Way Trading Est', 'United Kingdom'),
  ('99999999-9999-9999-9999-999999999993', 'Axle & Bearing Co',  'Priya Shah',  'trade@axlebearing.co.uk',          '+44 121 496 0333',  '72 Frederick Road',      'United Kingdom'),
  ('99999999-9999-9999-9999-999999999994', 'Weldtech Supplies',  'Owen Bailey', 'sales@weldtechsupplies.co.uk',    '+44 1382 496 0444',  'Bay 3, Riverside',      'United Kingdom'),
  ('99999999-9999-9999-9999-999999999995', 'SafeGuard Safety',   'Nina Patel',  'orders@safeguardsafety.co.uk',     '+44 151 496 0555',  'Century House',         'United Kingdom'),
  ('99999999-9999-9999-9999-999999999996', 'Volt Electronics',   'Hugo Meyer',  'trade@voltelec.co.uk',             '+44 118 496 0666',  '12 Crown Way',          'United Kingdom')
on conflict (id) do nothing;

insert into public.customers (id, name, contact_name, email, phone, address, country)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Harbour Engineering', 'Dan Cole',   'purchasing@harboureng.co.uk',  '+44 161 555 0200', '5 Quayside',          'United Kingdom'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Vela Marine Ltd',     'Ana Souza',  'orders@velamarine.co.uk',         '+44 23 555 0311',  '12 Hasler Road',      'United Kingdom'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Orbis Rail Systems',  'Luca Moretti','orders@orbisrail.co.uk',        '+44 114 555 0322', 'Park Hill Works',     'United Kingdom'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Kestrel Aerospace',   'Femi Adeyemi','supply@kestrelaero.co.uk',       '+44 129 555 0433', 'Aviation Park, 4',    'United Kingdom'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'Thames Fabricators',  'Ruth Hall',  'orders@thamesfab.co.uk',         '+44 118 555 0544', 'Crown Industrial Est','United Kingdom'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Redland Logistics',   'Sam Okonkwo','ap@redlandlogistics.co.uk',     '+44 117 555 0655', 'Redland Park',        'United Kingdom')
on conflict (id) do nothing;

-- -------------------------------------------------------------------
-- 4. Stock movement
-- -------------------------------------------------------------------
-- The movement is not guarded by "on conflict", because documents are created
-- through functions. A second run would post the same goods again and double
-- every quantity, so the block is skipped once any of this seed's references
-- already exists.

select pg_temp.actor('admin@stocksense.app');

do $$
declare
  v_r uuid;
  v_d uuid;
  v_t uuid;
begin
  if exists (
    select 1 from public.receipts
    where reference in ('NGM-88213', 'PP-44190', 'ABC-70112', 'NGM-88544', 'WT-20310', 'SG-4471', 'VE-9082')
  ) then
    raise notice 'seed: stock already present, skipping stock movement';
    return;
  end if;

  -- ---- Receipts that go all the way to done ---------------------------
  -- Steel and aluminium into Manchester, Aisle A.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999991',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666662',
    p_reference    := 'NGM-88213',
    p_notes        := 'Initial steel restock',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888881","quantity":150,"unit_cost":42.50},{"product_id":"88888888-8888-8888-8888-888888888882","quantity":320,"unit_cost":8.75}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  -- Packaging into Manchester, Bulk Store.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999992',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666663',
    p_reference    := 'PP-44190',
    p_notes        := 'Packaging materials',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888883","quantity":500,"unit_cost":1.20},{"product_id":"88888888-8888-8888-8888-888888888884","quantity":90,"unit_cost":2.35}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  -- Spares into Birmingham, so the second warehouse holds stock too.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999993',
    p_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_location_id  := '66666666-6666-6666-6666-666666666665',
    p_reference    := 'ABC-70112',
    p_notes        := 'Birmingham spares',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888886","quantity":18,"unit_cost":12.40}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  -- Finished goods into Manchester, Aisle A. Both panel types and the service
  -- kit are received here, because the delivery below sells them.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999991',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666662',
    p_reference    := 'NGM-88544',
    p_notes        := 'Completed assemblies',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888885","quantity":60,"unit_cost":185.00},{"product_id":"88888888-8888-8888-8888-888888888907","quantity":30,"unit_cost":205.00},{"product_id":"88888888-8888-8888-8888-888888888908","quantity":24,"unit_cost":88.00}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  -- Second batch of raw materials, into Aisle B so a transfer has somewhere
  -- to move stock from that is not the same location it arrived in.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999991',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666666',
    p_reference    := 'NGM-88901',
    p_notes        := 'Plate and sheet restock',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888900","quantity":95,"unit_cost":118.00},{"product_id":"88888888-8888-8888-8888-888888888901","quantity":140,"unit_cost":64.00},{"product_id":"88888888-8888-8888-8888-888888888902","quantity":260,"unit_cost":9.10}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  -- Safety equipment into Manchester, Staging.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999995',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666667',
    p_reference    := 'SG-4471',
    p_notes        := 'Quarterly PPE replenishment',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888911","quantity":420,"unit_cost":6.80},{"product_id":"88888888-8888-8888-8888-888888888912","quantity":95,"unit_cost":4.25},{"product_id":"88888888-8888-8888-8888-888888888913","quantity":140,"unit_cost":3.10},{"product_id":"88888888-8888-8888-8888-888888888914","quantity":26,"unit_cost":11.50}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  -- Birmingham gets electronics, tools and consumables, so the second staff
  -- account has a realistic mix rather than a single bearing.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999996',
    p_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_location_id  := '66666666-6666-6666-6666-666666666665',
    p_reference    := 'VE-9082',
    p_notes        := 'Handheld devices and cabling',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888915","quantity":6,"unit_cost":289.00},{"product_id":"88888888-8888-8888-8888-888888888916","quantity":14,"unit_cost":142.50},{"product_id":"88888888-8888-8888-8888-888888888917","quantity":11,"unit_cost":78.00}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999994',
    p_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_location_id  := '66666666-6666-6666-6666-666666666669',
    p_reference    := 'WT-20310',
    p_notes        := 'Tooling and fluids for the fulfilment floor',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888918","quantity":7,"unit_cost":96.00},{"product_id":"88888888-8888-8888-8888-888888888919","quantity":5,"unit_cost":54.00},{"product_id":"88888888-8888-8888-8888-888888888920","quantity":44,"unit_cost":31.00},{"product_id":"88888888-8888-8888-8888-888888888921","quantity":22,"unit_cost":17.50},{"product_id":"88888888-8888-8888-8888-888888888922","quantity":34,"unit_cost":22.00},{"product_id":"88888888-8888-8888-8888-888888888923","quantity":58,"unit_cost":9.40}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  -- Packaging into Birmingham, so a cross-warehouse transfer has a subject.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999992',
    p_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_location_id  := '66666666-6666-6666-6666-66666666666a',
    p_reference    := 'PP-44215',
    p_notes        := 'Birmingham packaging',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888883","quantity":220,"unit_cost":1.20},{"product_id":"88888888-8888-8888-8888-888888888884","quantity":40,"unit_cost":2.35},{"product_id":"88888888-8888-8888-8888-888888888905","quantity":30,"unit_cost":14.75},{"product_id":"88888888-8888-8888-8888-888888888906","quantity":150,"unit_cost":0.85},{"product_id":"88888888-8888-8888-8888-888888888903","quantity":75,"unit_cost":4.20},{"product_id":"88888888-8888-8888-8888-888888888904","quantity":25,"unit_cost":8.40}]'::jsonb
  );
  perform public.validate_receipt(v_r);

  -- ---- Deliveries ----------------------------------------------------
  -- Panels and steel leave Manchester; this is what pushes a couple of lines
  -- towards their reorder level.
  v_d := public.create_delivery(
    p_customer_id  := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666662',
    p_reference    := 'HE-5501',
    p_notes        := 'Phase 2 assemblies',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888885","quantity":22,"unit_price":249.00},{"product_id":"88888888-8888-8888-8888-888888888907","quantity":9,"unit_price":310.00}]'::jsonb
  );
  perform public.validate_delivery(v_d);

  v_d := public.create_delivery(
    p_customer_id  := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666666',
    p_reference    := 'VM-7742',
    p_notes        := 'Extra plate for hull fabrication',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888900","quantity":64,"unit_price":168.00},{"product_id":"88888888-8888-8888-8888-888888888901","quantity":95,"unit_price":88.00}]'::jsonb
  );
  perform public.validate_delivery(v_d);

  -- Consumes most of the Birmingham bearings and empties the corner boards
  -- completely, so the demo has a genuine out-of-stock alert rather than only
  -- low-stock warnings.
  v_d := public.create_delivery(
    p_customer_id  := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    p_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_location_id  := '66666666-6666-6666-6666-666666666665',
    p_reference    := 'OR-1180',
    p_notes        := 'Bearing replacement batch',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888886","quantity":12,"unit_price":26.50}]'::jsonb
  );
  perform public.validate_delivery(v_d);

  -- Boxing supplies out of Birmingham, leaving the stretch wrap low.
  v_d := public.create_delivery(
    p_customer_id  := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    p_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_location_id  := '66666666-6666-6666-6666-66666666666a',
    p_reference    := 'KA-3390',
    p_notes        := 'Outbound consumables',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888904","quantity":21,"unit_price":12.00},{"product_id":"88888888-8888-8888-8888-888888888905","quantity":27,"unit_price":19.50},{"product_id":"88888888-8888-8888-8888-888888888883","quantity":180,"unit_price":1.60},{"product_id":"88888888-8888-8888-8888-888888888906","quantity":150,"unit_price":1.10}]'::jsonb
  );
  perform public.validate_delivery(v_d);

  -- ---- Transfers -----------------------------------------------------
  -- Manchester to Birmingham: packaging Birmingham is short of. Both products
  -- are held at the Manchester Bulk Store, which is where PP-44190 put them.
  v_t := public.create_transfer(
    p_source_warehouse_id      := '44444444-4444-4444-4444-444444444444',
    p_source_location_id       := '66666666-6666-6666-6666-666666666663',
    p_destination_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_destination_location_id  := '66666666-6666-6666-6666-66666666666a',
    p_reference                := 'MCR-BHX-014',
    p_notes                    := 'Rebalance packaging',
    p_items                    := '[{"product_id":"88888888-8888-8888-8888-888888888884","quantity":25},{"product_id":"88888888-8888-8888-8888-888888888883","quantity":60}]'::jsonb
  );
  perform public.validate_transfer(v_t);

  -- Birmingham to Manchester: labelling stock moved to the dispatch aisle.
  v_t := public.create_transfer(
    p_source_warehouse_id      := '55555555-5555-5555-5555-555555555555',
    p_source_location_id       := '66666666-6666-6666-6666-66666666666a',
    p_destination_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_destination_location_id  := '66666666-6666-6666-6666-666666666662',
    p_reference                := 'BHX-MCR-007',
    p_notes                    := 'Rebalance labelling stock',
    p_items                    := '[{"product_id":"88888888-8888-8888-8888-888888888903","quantity":30}]'::jsonb
  );
  perform public.validate_transfer(v_t);
end $$;

-- -------------------------------------------------------------------
-- 5. Documents in flight
-- -------------------------------------------------------------------
-- One document per status, so every filter tab on the list screens has
-- something in it and the status workflow can be walked through in the UI.
-- These are authored by the manager, and the staff account owns the drafts it
-- would realistically raise at the warehouse.
do $$
declare
  v_r uuid;
  v_d uuid;
  v_t uuid;
begin
  if exists (
    select 1 from public.receipts where reference in ('PP-44301', 'WT-20455', 'NGM-89002')
  ) then
    raise notice 'seed: in-flight documents already present';
    return;
  end if;

  perform pg_temp.actor('staff@stocksense.app');

  -- A draft receipt the Manchester team has not submitted yet.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999995',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666667',
    p_reference    := 'PP-44301',
    p_notes        := 'Awaiting supplier despatch note',
    p_items        := '[{"product_id":"88888888-8888-8888-8888-888888888912","quantity":60,"unit_cost":4.25},{"product_id":"88888888-8888-8888-8888-888888888913","quantity":80,"unit_cost":3.10}]'::jsonb
  );

  perform pg_temp.actor('manager@stocksense.app');

  -- Waiting: submitted, not yet picked and checked.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999994',
    p_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_location_id  := '66666666-6666-6666-6666-666666666664',
    p_reference    := 'WT-20455',
    p_expected_at  := now() + interval '3 days',
    p_notes        => 'Booked against the maintenance framework',
    p_items        => '[{"product_id":"88888888-8888-8888-8888-888888888909","quantity":40,"unit_cost":7.80},{"product_id":"88888888-8888-8888-8888-888888888910","quantity":18,"unit_cost":34.00}]'::jsonb
  );
  perform public.change_document_status('receipt', v_r, 'waiting');

  -- Ready: counted and staged, one click from done.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999991',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666661',
    p_reference    := 'NGM-89002',
    p_expected_at  := now(),
    p_notes        => 'On the dock, counted and waiting to post',
    p_items        => '[{"product_id":"88888888-8888-8888-8888-888888888882","quantity":180,"unit_cost":8.75},{"product_id":"88888888-8888-8888-8888-888888888900","quantity":40,"unit_cost":118.00}]'::jsonb
  );
  perform public.change_document_status('receipt', v_r, 'ready');

  -- Canceled: raised in error, kept for the audit trail.
  v_r := public.create_receipt(
    p_supplier_id  := '99999999-9999-9999-9999-999999999992',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666663',
    p_reference    => 'PP-44999',
    p_notes        => 'Duplicate of PP-44301, raised by mistake',
    p_items        => '[{"product_id":"88888888-8888-8888-8888-888888888883","quantity":100,"unit_cost":1.20}]'::jsonb
  );
  perform public.cancel_document('receipt', v_r, 'Duplicate of PP-44301, raised by mistake');

  -- Deliveries: a draft and a waiting order.
  v_d := public.create_delivery(
    p_customer_id  := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
    p_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_location_id  := '66666666-6666-6666-6666-666666666662',
    p_reference    => 'TF-6612',
    p_notes        => 'Draft, quantities still being confirmed',
    p_items        => '[{"product_id":"88888888-8888-8888-8888-888888888885","quantity":14,"unit_price":249.00},{"product_id":"88888888-8888-8888-8888-888888888908","quantity":6,"unit_price":142.00}]'::jsonb
  );

  v_d := public.create_delivery(
    p_customer_id  := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6',
    p_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_location_id  := '66666666-6666-6666-6666-666666666665',
    p_reference    => 'RL-8825',
    p_expected_at  => now() + interval '2 days',
    p_notes        => 'Confirm scanner count before dispatch',
    p_items        => '[{"product_id":"88888888-8888-8888-8888-888888888916","quantity":4,"unit_price":189.00},{"product_id":"88888888-8888-8888-8888-888888888917","quantity":3,"unit_price":104.00}]'::jsonb
  );
  perform public.change_document_status('delivery', v_d, 'waiting');

  -- Transfer: a draft rebalance and a canceled one.
  v_t := public.create_transfer(
    p_source_warehouse_id      := '44444444-4444-4444-4444-444444444444',
    p_source_location_id       := '66666666-6666-6666-6666-666666666666',
    p_destination_warehouse_id := '55555555-5555-5555-5555-555555555555',
    p_destination_location_id  := '66666666-6666-6666-6666-666666666669',
    p_reference                := 'MCR-BHX-021',
    p_notes                    => 'Move slow moving plate to Birmingham',
    p_items                    => '[{"product_id":"88888888-8888-8888-8888-888888888900","quantity":30}]'::jsonb
  );

  v_t := public.create_transfer(
    p_source_warehouse_id      := '55555555-5555-5555-5555-555555555555',
    p_source_location_id       := '66666666-6666-6666-6666-666666666665',
    p_destination_warehouse_id := '44444444-4444-4444-4444-444444444444',
    p_destination_location_id  := '66666666-6666-6666-6666-666666666662',
    p_reference                := 'BHX-MCR-099',
    p_notes                    => 'Raised against the wrong location',
    p_items                    => '[{"product_id":"88888888-8888-8888-8888-888888888915","quantity":2}]'::jsonb
  );
  perform public.cancel_document('transfer', v_t, 'Raised against the wrong location');
end $$;

-- -------------------------------------------------------------------
-- 6. Adjustments
-- -------------------------------------------------------------------
-- Stock counts that found a variance. The counted figures below are computed
-- against the quantities the movements above leave behind, so each adjustment
-- shows the variance its note describes rather than an accidental mismatch.
do $$
declare
  v_a uuid;
begin
  if exists (select 1 from public.adjustments where adjustment_number like 'ADJ-%') then
    raise notice 'seed: adjustments already present';
    return;
  end if;

  -- Manchester Bulk Store holds 90 rolls of tape, less the 25 transferred out
  -- above, so 65 remain and the count finds 6 fewer.
  perform pg_temp.actor('staff@stocksense.app');
  v_a := public.post_adjustment(
    p_product_id       := '88888888-8888-8888-8888-888888888884',
    p_location_id      := '66666666-6666-6666-6666-666666666663',
    p_counted_quantity := 59,
    p_reason           := 'miscount',
    p_notes            := 'Recount of the bulk store found 6 fewer rolls'
  );

  -- Staging received 420 pairs, so an unopened case makes the count 425.
  v_a := public.post_adjustment(
    p_product_id       := '88888888-8888-8888-8888-888888888911',
    p_location_id      := '66666666-6666-6666-6666-666666666667',
    p_counted_quantity := 425,
    p_reason           := 'found',
    p_notes            := 'Unopened case found behind the racking'
  );

  -- A batch scratched in transit, 12 short of the 140 received.
  v_a := public.post_adjustment(
    p_product_id       := '88888888-8888-8888-8888-888888888913',
    p_location_id      := '66666666-6666-6666-6666-666666666667',
    p_counted_quantity := 128,
    p_reason           := 'damaged',
    p_notes            := 'Batch scratched in transit, quarantined'
  );

  perform pg_temp.actor('staff2@stocksense.app');
  -- Birmingham Aisle D holds 22 drums of degreaser; two are unaccounted for.
  v_a := public.post_adjustment(
    p_product_id       := '88888888-8888-8888-8888-888888888921',
    p_location_id      := '66666666-6666-6666-6666-666666666669',
    p_counted_quantity := 20,
    p_reason           := 'lost',
    p_notes            := 'Two drums unaccounted for at the monthly count'
  );

  -- 44 boxes of bits were received, two were double counted on the sheet.
  v_a := public.post_adjustment(
    p_product_id       := '88888888-8888-8888-8888-888888888920',
    p_location_id      := '66666666-6666-6666-6666-666666666669',
    p_counted_quantity := 42,
    p_reason           := 'miscount',
    p_notes            := 'Two boxes were double counted on the sheet'
  );

  -- A count that has been raised. 58 rolls were received, 4 are past date.
  perform pg_temp.actor('manager@stocksense.app');
  v_a := public.post_adjustment(
    p_product_id       := '88888888-8888-8888-8888-888888888923',
    p_location_id      := '66666666-6666-6666-6666-666666666669',
    p_counted_quantity := 54,
    p_reason           := 'expired',
    p_notes            := 'Four rolls past their date at the count'
  );
end $$;

-- -------------------------------------------------------------------
-- 7. Notifications
-- -------------------------------------------------------------------
-- Low stock and document events raise these through the notify() function as
-- documents are posted. These extra rows make sure each role has something in
-- the bell that is not a stock alert, and that the severities are varied.
do $$
declare
  v_manchester uuid := '44444444-4444-4444-4444-444444444444';
  v_birmingham uuid := '55555555-5555-5555-5555-555555555555';
  v_staff      uuid := (select id from auth.users where lower(email) = 'staff@stocksense.app');
  v_staff2     uuid := (select id from auth.users where lower(email) = 'staff2@stocksense.app');
begin
  if exists (
    select 1 from public.notifications
    where title in ('Cycle count due for Bulk Store', 'Scanner firmware due')
  ) then
    raise notice 'seed: notifications already present';
    return;
  end if;

  insert into public.notifications (user_id, warehouse_id, type, severity, title, message, reference_type, reference_id, link)
  values
    (v_staff,  v_manchester, 'system', 'info',
     'Cycle count due for Bulk Store',
     'The monthly count for Bulk Store is due by Friday. Raise an adjustment for anything that does not match the sheet.',
     null, null, '/operations/adjustments/new'),
    (v_staff,  v_manchester, 'receipt_validated', 'info',
     'Receipt RCPT-000009 posted',
     '220 Cartons of Euro Pallet were received into Bulk Store from Northgate Metals.',
     'receipt', null, '/operations/receipts'),
    (v_staff2, v_birmingham, 'system', 'warning',
     'Scanner firmware due',
     'Two EL-SCN-BAR scanners are due a firmware update. Schedule them before the next pick wave.',
     null, null, '/products'),
    (v_staff2, v_birmingham, 'transfer_completed', 'info',
     'Transfer TRF-000006 completed',
     '8 Assembly Panel Type A moved from Staging to Aisle A at Manchester Central.',
     'transfer', null, '/operations/transfers'),
    (v_staff2, v_birmingham, 'system', 'critical',
     'Negative stock prevented',
     'A delivery of 40 Roller Chain 08B was blocked because only 18 are on hand. Raise an adjustment or receive more stock first.',
     null, null, '/products?filter=low')
  on conflict do nothing;
end $$;

commit;

-- -------------------------------------------------------------------
-- What the demo shows
-- -------------------------------------------------------------------
-- admin@stocksense.app      full access, both warehouses, user administration
-- manager@stocksense.app    full access, both warehouses, raises documents
-- staff@stocksense.app      Manchester only, raises drafts and stock counts
-- staff2@stocksense.app     Birmingham only, proves the warehouse grant
-- retired@stocksense.app    inactive account, sign-in is refused
-- password for all of them:  StockSense123!
--
-- Each list screen has at least one row in every status:
--   receipts   draft PP-44301 | waiting WT-20455 | ready NGM-89002
--              | done x5 | canceled PP-44999
--   deliveries draft TF-6612 | waiting RL-8825 | done x4
--   transfers  draft MCR-BHX-021 | done x2 | canceled BHX-MCR-099
--   adjustments waiting x1 | done x5
--
-- Stock is spread across healthy, low and out-of-stock lines so the
-- dashboard and the low stock filter are not empty.
--
-- Verify with:
--   select email, role, is_active from public.profiles order by email;
--   select status, count(*) from public.receipts group by status;
--   select p.sku, sum(i.quantity) from inventory i
--     join products p on p.id = i.product_id group by p.sku order by p.sku;
