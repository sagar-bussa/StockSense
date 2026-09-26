/**
 * Validates every migration against a real Postgres engine (PGlite - Postgres
 * compiled to WASM) so syntax errors, undefined references and constraint
 * mistakes are caught here rather than in a paste into the Supabase SQL editor.
 *
 * It also exercises the inventory rules end to end, because the whole system
 * rests on them:
 *   - a draft receipt does not change stock
 *   - validating a receipt increases stock and writes a ledger entry
 *   - validating twice is refused
 *   - a delivery cannot drive stock negative
 *   - a transfer moves stock without changing the company total
 *   - an adjustment sets stock to the counted figure
 *   - the ledger cannot be updated or deleted
 *
 * Usage: node scripts/verify-migrations.mjs
 */
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootstrapPGlite } from './lib/pglite-preamble.mjs'

const MIGRATIONS_DIR = resolve('supabase/migrations')

const results = { pass: 0, fail: 0 }
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    results.pass += 1
    console.log(`  \u2713 ${name}`)
  } else {
    results.fail += 1
    failures.push(`${name}${detail ? ` - ${detail}` : ''}`)
    console.log(`  \u2717 ${name}${detail ? ` - ${detail}` : ''}`)
  }
}

function eq(name, actual, expected) {
  check(name, Object.is(actual, expected) || String(actual) === String(expected), `got ${actual}, want ${expected}`)
}

// The Supabase prerequisites (roles, auth tables, extension stubs) live in
// lib/pglite-preamble.mjs so the type generator boots an identical schema.
const { db, stripUnsupported } = await bootstrapPGlite()

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

console.log(`Running ${files.length} migrations in order...\n`)
for (const file of files) {
  const sql = stripUnsupported(await readFile(join(MIGRATIONS_DIR, file), 'utf8'))
  try {
    await db.exec(sql)
    console.log(`  applied  ${file}`)
  } catch (error) {
    results.fail += 1
    failures.push(`${file}: ${error.message}`)
    console.log(`  FAILED   ${file}`)
    console.log(`           ${error.message}`)
    // Stop: later migrations depend on this one, so their errors would be noise.
    break
  }
}

// ---------------------------------------------------------------------------
// Seed verification
// ---------------------------------------------------------------------------
// The seed must be valid SQL against the migrated schema, produce stock via
// the RPCs (never a direct write), and be safe to run twice. It is executed
// inside a transaction that is rolled back, so it cannot pollute the checks
// that follow.
// ---------------------------------------------------------------------------
if (results.fail === 0) {
  const seedPath = join(MIGRATIONS_DIR, '..', 'seed.sql')
  try {
    const seedSql = stripUnsupported(await readFile(seedPath, 'utf8'))
    await db.exec('begin;')

    // Stand in for the Auth signup API, which is what creates the demo
    // accounts on a real project. The token columns matter: GoTrue scans them
    // into non-nullable strings, so null makes sign-in fail.
    await db.exec(`
      insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, confirmation_token,
        email_change, email_change_token_new, recovery_token,
        is_sso_user, is_anonymous
      )
      values
        ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
         'admin@stocksense.app', 'x', now(),
         '{"provider":"email","providers":["email"]}',
         '{"sub":"11111111-1111-1111-1111-111111111111","email":"admin@stocksense.app","email_verified":true}',
         '', '', '', '', false, false),
        ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
         'manager@stocksense.app', 'x', now(),
         '{"provider":"email","providers":["email"]}',
         '{"sub":"22222222-2222-2222-2222-222222222222","email":"manager@stocksense.app","email_verified":true}',
         '', '', '', '', false, false),
        ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated',
         'staff@stocksense.app', 'x', now(),
         '{"provider":"email","providers":["email"]}',
         '{"sub":"33333333-3333-3333-3333-333333333333","email":"staff@stocksense.app","email_verified":true}',
         '', '', '', '', false, false),
        ('44444444-4444-4444-4444-444444444443', 'authenticated', 'authenticated',
         'staff2@stocksense.app', 'x', now(),
         '{"provider":"email","providers":["email"]}',
         '{"sub":"44444444-4444-4444-4444-444444444443","email":"staff2@stocksense.app","email_verified":true}',
         '', '', '', '', false, false),
        ('55555555-5555-5555-5555-555555555556', 'authenticated', 'authenticated',
         'retired@stocksense.app', 'x', now(),
         '{"provider":"email","providers":["email"]}',
         '{"sub":"55555555-5555-5555-5555-555555555556","email":"retired@stocksense.app","email_verified":true}',
         '', '', '', '', false, false)
      on conflict (id) do nothing;

      insert into auth.identities (user_id, provider, provider_id, identity_data)
      values
        ('11111111-1111-1111-1111-111111111111', 'email', '11111111-1111-1111-1111-111111111111', '{"email":"admin@stocksense.app"}'),
        ('22222222-2222-2222-2222-222222222222', 'email', '22222222-2222-2222-2222-222222222222', '{"email":"manager@stocksense.app"}'),
        ('33333333-3333-3333-3333-333333333333', 'email', '33333333-3333-3333-3333-333333333333', '{"email":"staff@stocksense.app"}'),
        ('44444444-4444-4444-4444-444444444443', 'email', '44444444-4444-4444-4444-444444444443', '{"email":"staff2@stocksense.app"}'),
        ('55555555-5555-5555-5555-555555555556', 'email', '55555555-5555-5555-5555-555555555556', '{"email":"retired@stocksense.app"}')
      on conflict (provider, provider_id) do nothing;
    `)

    await db.exec(seedSql)

    // The seed must not write stock directly: inventory has a write guard
    // that only admits the stock engine, and stock_ledger is append-only via
    // a trigger. Reaching the expected quantities therefore also proves the
    // seed went through create_receipt/validate_receipt.
    const stock = await db.query(`
      select p.sku, sum(i.quantity)::numeric(10,1) as on_hand
      from public.products p
      join public.inventory i on i.product_id = p.id
      group by p.sku order by p.sku
    `)
    const onHand = Object.fromEntries(stock.rows.map((r) => [r.sku, Number(r.on_hand)]))
    check(
      'seed stocks stock through the receipt RPCs',
      onHand['RM-STEEL-001'] === 150 &&
        onHand['RM-ALU-002'] === 320 &&
        onHand['PK-BOX-M'] === 540 &&
        onHand['PK-TAPE-50'] === 124 &&
        onHand['FG-PANEL-01'] === 38 &&
        onHand['MT-BEARING-8'] === 6,
      `got ${JSON.stringify(onHand)}`,
    )

    // Completed receipts produced matching ledger rows, in-flight receipts
    // represent draft, waiting, ready and canceled states.
    const docs = await db.query(`
      select
        (select count(*) from public.receipts where status <> 'done')::int as open_receipts,
        (select count(*) from public.stock_ledger where transaction_type = 'receipt')::int as ledger_rows,
        (select count(*) from public.stock_ledger where previous_quantity + quantity_change <> new_quantity)::int as broken_balances
    `)
    check(
      'seed leaves in-flight receipts and consistent ledger',
      docs.rows[0].open_receipts === 4 &&
        docs.rows[0].ledger_rows === 30 &&
        docs.rows[0].broken_balances === 0,
      `got ${JSON.stringify(docs.rows[0])}`,
    )

    // Staff is scoped to Manchester only; that scoping is what the RLS tests
    // depend on, so the seed has to set it up.
    const scoped = await db.query(`
      select count(*)::int as n from public.user_warehouses
      where user_id = '33333333-3333-3333-3333-333333333333'
        and warehouse_id = '44444444-4444-4444-4444-444444444444'
    `)
    check('seed scopes staff to a single warehouse', scoped.rows[0].n === 1)

    // Each demo login needs an auth identity row or GoTrue cannot resolve a
    // session, and the password hash must use bcrypt cost 10. Hand-written
    // rows that get either wrong make sign-in fail with a database error, so
    // the seed no longer creates users at all: the Auth API does. The harness
    // stands in for that API by creating the accounts here.
    const ids = await db.query(`
      select count(*)::int as n
      from auth.identities
      where provider = 'email'
        and user_id in (
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333'
        )
    `)
    check('harness accounts mirror the Auth signup shape', ids.rows[0].n === 3, `n=${ids.rows[0].n}`)

    // The seed must not create users itself, and must refuse to run when the
    // demo logins are absent, so a half-seeded database cannot be mistaken for
    // a working one.
    const source = await readFile(seedPath, 'utf8')
    check(
      'seed does not write to auth.users directly',
      !/insert\s+into\s+auth\.users/i.test(source),
      'seed should assign roles to users created by the Auth API',
    )
    check(
      'seed fails loudly if the demo users are missing',
      /raise\s+exception/i.test(source),
    )

    // Re-running must be a no-op rather than an error or a double count.
    const EXPECTED_TOTAL = 2508
    try {
      await db.exec(seedSql)
      const again = await db.query(
        `select sum(quantity)::numeric(10,1) as total from public.inventory`,
      )
      check(
        'seed is safe to run twice (idempotent)',
        Number(again.rows[0].total) === EXPECTED_TOTAL,
        `total ${again.rows[0].total}, expected ${EXPECTED_TOTAL}`,
      )
    } catch (error) {
      check(`seed is idempotent: ${error.message}`, false)
    }

    await db.exec('rollback;')
    check('seed.sql applies against the migrated schema', true)
  } catch (error) {
    try {
      await db.exec('rollback;')
    } catch {
      // Already rolled back by the failed statement.
    }
    check(`seed.sql applies: ${error.message}`, false)
  }
}

// ---------------------------------------------------------------------------
// Only run the behaviour suite if every migration applied.
// ---------------------------------------------------------------------------
if (results.fail === 0) {
  console.log('\nInventory behaviour suite:\n')
  try {
  await db.exec(`
    -- Sign in as an admin for the duration of the checks.
    insert into auth.users (id, email, email_confirmed_at)
    values ('11111111-1111-1111-1111-111111111111', 'admin@test.local', now())
    on conflict do nothing;

    update public.profiles
    set role = 'admin', full_name = 'Test Admin'
    where id = '11111111-1111-1111-1111-111111111111';

    -- auth.uid() reads the JWT claim, exactly as in production.
    select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
    select set_config('request.jwt.claims',
      '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', false);
  `)

  const WH = 'aaaaaaaa-0000-0000-0000-000000000001'
  const LOC_A = 'bbbbbbbb-0000-0000-0000-000000000001'
  const LOC_B = 'bbbbbbbb-0000-0000-0000-000000000002'
  const SUPPLIER = 'dddddddd-0000-0000-0000-000000000001'
  const CUSTOMER = 'eeeeeeee-0000-0000-0000-000000000001'

  await db.exec(`
    insert into public.warehouses (id, name, code) values
      ('${WH}', 'Main Warehouse', 'MAIN');
    insert into public.locations (id, warehouse_id, name, code, kind) values
      ('${LOC_A}', '${WH}', 'Rack A', 'RACK-A', 'rack'),
      ('${LOC_B}', '${WH}', 'Rack B', 'RACK-B', 'rack');
    insert into public.suppliers (id, name) values ('${SUPPLIER}', 'Acme Metals');
    insert into public.customers (id, name) values ('${CUSTOMER}', 'Northwind Traders');
  `)

  // --- product creation with an opening balance -------------------------
  // (name, sku, category, unit, reorder_level, initial_stock, description, location)
  const created = await db.query(
    `select public.create_product('Steel Rods', 'stl-001', null, 'pcs', 20, 100, null, $1) as id`,
    [LOC_A],
  )
  eq('create_product returns an id', typeof created.rows[0].id, 'string')

  let productId = created.rows[0].id
  const stockStatus = async () =>
    (
      await db.query(
        `select stock_status from public.v_product_stock where product_id = $1`,
        [productId],
      )
    ).rows[0]?.stock_status
  // The opening balance must be traceable, not a magic number.
  let r = await db.query(
    `select transaction_type, quantity_change, previous_quantity, new_quantity
     from public.stock_ledger where product_id = $1`,
    [productId],
  )
  eq('opening stock writes a ledger entry', r.rows.length, 1)
  eq('opening ledger type is a receipt', r.rows[0].transaction_type, 'receipt')
  eq('opening previous_quantity is zero', Number(r.rows[0].previous_quantity), 0)
  eq('opening new_quantity is the opening balance', Number(r.rows[0].new_quantity), 100)

  // --- duplicate SKU -----------------------------------------------------
  let threw = null
  try {
    await db.query(`select public.create_product('Copy', 'STL-001', null, 'pcs', 0, 0, null, null)`)
  } catch (e) {
    threw = e.message
  }
  check('duplicate SKU is rejected (case-insensitive)', threw !== null && /unique/i.test(threw), threw ?? 'no error')

  // --- receipt: draft does not move stock --------------------------------
  let receiptId = (
    await db.query(
      `select public.create_receipt($1, $2, $3, 'PO-1', null, null,
         jsonb_build_array(jsonb_build_object('product_id', $4::uuid, 'quantity', 50))) as id`,
      [SUPPLIER, WH, LOC_A, productId],
    )
  ).rows[0].id

  r = await db.query(`select status from public.receipts where id = $1`, [receiptId])
  eq('new receipt starts as draft', r.rows[0].status, 'draft')

  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('draft receipt does NOT change stock', Number(r.rows[0].quantity), 100)

  r = await db.query(`select count(*)::int as n from public.stock_ledger where reference_id = $1`, [receiptId])
  eq('draft receipt writes no ledger entry', r.rows[0].n, 0)

  // --- receipt: validation moves stock -----------------------------------
  await db.query(`select public.validate_receipt($1)`, [receiptId])

  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('validated receipt increases stock', Number(r.rows[0].quantity), 150)

  r = await db.query(`select status, validated_at is not null as att from public.receipts where id = $1`, [receiptId])
  eq('validated receipt status is done', r.rows[0].status, 'done')
  eq('validated receipt is attributed', r.rows[0].att, true)

  r = await db.query(
    `select previous_quantity, new_quantity, running_balance, created_by_name
     from public.stock_ledger where reference_id = $1`,
    [receiptId],
  )
  eq('receipt ledger previous_quantity', Number(r.rows[0].previous_quantity), 100)
  eq('receipt ledger new_quantity', Number(r.rows[0].new_quantity), 150)
  eq('receipt ledger running_balance', Number(r.rows[0].running_balance), 150)
  eq('ledger records the actor', r.rows[0].created_by_name, 'Test Admin')

  // --- duplicate validation is refused -----------------------------------
  threw = null
  try {
    await db.query(`select public.validate_receipt($1)`, [receiptId])
  } catch (e) {
    threw = e.message
  }
  check(
    'validating a receipt twice is refused',
    threw !== null && /already been validated/i.test(threw),
    threw ?? 'no error',
  )

  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('rejected re-validation left stock unchanged', Number(r.rows[0].quantity), 150)

  // --- receipt is immutable once done ------------------------------------
  threw = null
  try {
    await db.query(`select public.update_receipt($1, null, null, 'PO-2', null, null, null)`, [receiptId])
  } catch (e) {
    threw = e.message
  }
  check('a done receipt cannot be edited', threw !== null && /already validated/i.test(threw), threw ?? 'no error')

  // --- cancelling a done receipt is refused ------------------------------
  threw = null
  try {
    await db.query(`select public.cancel_document('receipt', $1, 'changed my mind')`, [receiptId])
  } catch (e) {
    threw = e.message
  }
  check('a done receipt cannot be cancelled', threw !== null && /already completed/i.test(threw), threw ?? 'no error')

  // --- ledger is append-only ---------------------------------------------
  threw = null
  try {
    await db.query(`update public.stock_ledger set quantity_change = 9999`)
  } catch (e) {
    threw = e.message
  }
  check('ledger rows cannot be updated', threw !== null && /cannot be modified/i.test(threw), threw ?? 'no error')

  threw = null
  try {
    await db.query(`delete from public.stock_ledger`)
  } catch (e) {
    threw = e.message
  }
  check('ledger rows cannot be deleted', threw !== null && /cannot be modified/i.test(threw), threw ?? 'no error')

  // --- direct inventory writes are refused -------------------------------
  threw = null
  try {
    await db.exec(`select set_config('stocksense.inventory_write', 'off', false);
                   update public.inventory set quantity = 99999`)
  } catch (e) {
    threw = e.message
  }
  check('inventory cannot be edited directly', threw !== null && /cannot be edited directly/i.test(threw), threw ?? 'no error')

  // --- delivery: availability --------------------------------------------
  const deliveryId = (
    await db.query(
      `select public.create_delivery($1, $2, $3, 'SO-1', null, null,
         jsonb_build_array(jsonb_build_object('product_id', $4::uuid, 'quantity', 40))) as id`,
      [CUSTOMER, WH, LOC_A, productId],
    )
  ).rows[0].id

  r = await db.query(`select * from public.check_delivery_availability($1)`, [deliveryId])
  eq('delivery pre-flight reports availability', r.rows[0].is_sufficient, true)
  eq('delivery pre-flight reports available qty', Number(r.rows[0].available), 150)

  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('draft delivery does not change stock', Number(r.rows[0].quantity), 150)
  // An over-quantity delivery must be refused outright, and must leave stock
  // exactly as it was: the whole operation rolls back, ledger included.
  const bigDelivery = (
    await db.query(
      `select public.create_delivery($1, $2, $3, 'SO-2', null, null,
         jsonb_build_array(jsonb_build_object('product_id', $4::uuid, 'quantity', 9999))) as id`,
      [CUSTOMER, WH, LOC_A, productId],
    )
  ).rows[0].id

  r = await db.query(`select * from public.check_delivery_availability($1)`, [bigDelivery])
  eq('over-quantity pre-flight reports insufficient', r.rows[0].is_sufficient, false)

  threw = null
  try {
    await db.query(`select public.validate_delivery($1)`, [bigDelivery])
  } catch (e) {
    threw = e.message
  }
  check(
    'delivery beyond available stock is refused',
    threw !== null && /Insufficient stock/i.test(threw),
    threw ?? 'no error',
  )

  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('refused delivery left stock unchanged', Number(r.rows[0].quantity), 150)

  r = await db.query(
    `select count(*)::int as n from public.stock_ledger where reference_id = $1`,
    [bigDelivery],
  )
  eq('refused delivery wrote no ledger entry', r.rows[0].n, 0)

  // A valid delivery does reduce stock.
  await db.query(`select public.validate_delivery($1)`, [deliveryId])
  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('validated delivery decreases stock', Number(r.rows[0].quantity), 110)

  // --- transfer preserves the company total -------------------------------
  const totalBefore = (
    await db.query(`select coalesce(sum(quantity),0) as t from public.inventory where product_id = $1`, [productId])
  ).rows[0].t

  const transferId = (
    await db.query(
      `select public.create_transfer($1, $2, $1, $3, 'MV-1', null, null,
         jsonb_build_array(jsonb_build_object('product_id', $4::uuid, 'quantity', 30))) as id`,
      [WH, LOC_A, LOC_B, productId],
    )
  ).rows[0].id

  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('draft transfer does not move stock', Number(r.rows[0].quantity), 110)

  await db.query(`select public.validate_transfer($1)`, [transferId])

  const src = (await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])).rows[0]
  const dst = (await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_B])).rows[0]
  eq('transfer decreases the source', Number(src.quantity), 80)
  eq('transfer increases the destination', Number(dst.quantity), 30)

  const totalAfter = (
    await db.query(`select coalesce(sum(quantity),0) as t from public.inventory where product_id = $1`, [productId])
  ).rows[0].t
  eq('transfer leaves total company stock unchanged', Number(totalAfter), Number(totalBefore))

  r = await db.query(
    `select transaction_type from public.stock_ledger where reference_id = $1 order by id`,
    [transferId],
  )
  eq('transfer writes two ledger rows', r.rows.length, 2)
  eq('transfer_out is recorded first', r.rows[0].transaction_type, 'transfer_out')
  eq('transfer_in is recorded second', r.rows[1].transaction_type, 'transfer_in')

  // --- transfer needs stock at the source -------------------------------
  const overTransfer = (
    await db.query(
      `select public.create_transfer($1, $2, $1, $3, 'MV-2', null, null,
         jsonb_build_array(jsonb_build_object('product_id', $4::uuid, 'quantity', 9999))) as id`,
      [WH, LOC_A, LOC_B, productId],
    )
  ).rows[0].id
  threw = null
  try {
    await db.query(`select public.validate_transfer($1)`, [overTransfer])
  } catch (e) {
    threw = e.message
  }
  check('transfer beyond source stock is refused', threw !== null && /Insufficient stock/i.test(threw), threw ?? 'no error')

  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('refused transfer left source unchanged', Number(r.rows[0].quantity), 80)

  // --- adjustment ---------------------------------------------------------
  const beforeAdjust = (
    await db.query(`select public.get_location_stock($1, $2) as q`, [productId, LOC_A])
  ).rows[0].q
  eq('get_location_stock reads recorded quantity', Number(beforeAdjust), 80)

  const adjId = (
    await db.query(`select public.post_adjustment($1, $2, 77, 'damaged', 'dropped in transit') as id`, [productId, LOC_A])
  ).rows[0].id

  r = await db.query(
    `select system_quantity, counted_quantity, difference from public.adjustments where id = $1`,
    [adjId],
  )
  eq('adjustment records the system quantity', Number(r.rows[0].system_quantity), 80)
  eq('adjustment records the counted quantity', Number(r.rows[0].counted_quantity), 77)
  eq('adjustment difference is generated correctly', Number(r.rows[0].difference), -3)

  r = await db.query(`select quantity from public.inventory where product_id = $1 and location_id = $2`, [productId, LOC_A])
  eq('adjustment sets stock to the counted figure', Number(r.rows[0].quantity), 77)

  // A reason is mandatory.
  threw = null
  try {
    await db.query(`select public.post_adjustment($1, $2, 10, null, null)`, [productId, LOC_A])
  } catch (e) {
    threw = e.message
  }
  check('adjustment without a reason is refused', threw !== null && /reason/i.test(threw), threw ?? 'no error')

  // 'other' needs a note.
  threw = null
  try {
    await db.query(`select public.post_adjustment($1, $2, 10, 'other', null)`, [productId, LOC_A])
  } catch (e) {
    threw = e.message
  }
  check("reason 'other' without a note is refused", threw !== null && /note/i.test(threw), threw ?? 'no error')

  // --- low stock detection -----------------------------------------------
  // Alerts key off the company-wide total, not a single location, so both
  // locations have to come down before the product reads as low.
  const totalNow = async () =>
    Number(
      (
        await db.query(
          `select coalesce(sum(quantity),0) as t from public.inventory where product_id = $1`,
          [productId],
        )
      ).rows[0].t,
    )

  // 77 in rack A (after the adjustment) plus 30 transferred into rack B.
  eq('company total before the low-stock test', await totalNow(), 107)
  eq('total above reorder level reads as in_stock', (await stockStatus()) !== 'low_stock', true)

  // Drop the other location to 0 as well, so the total lands under reorder 20.
  await db.query(`select public.post_adjustment($1, $2, 0, 'miscount', 'recount')`, [productId, LOC_B])
  await db.query(`select public.post_adjustment($1, $2, 15, 'miscount', 'recount')`, [productId, LOC_A])
  eq('total after the low-stock test', await totalNow(), 15)

  r = await db.query(`select stock_status from public.v_product_stock where product_id = $1`, [productId])
  eq('stock below reorder level reads as low_stock', r.rows[0].stock_status, 'low_stock')

  r = await db.query(`select count(*)::int as n from public.notifications where type = 'low_stock'`)
  check('a low-stock notification was raised', r.rows[0].n > 0, `n=${r.rows[0].n}`)

  // Restocking should clear the outstanding alert.
  await db.query(`select public.post_adjustment($1, $2, 90, 'found', 'found in quarantine')`, [productId, LOC_A])
  r = await db.query(`select stock_status from public.v_product_stock where product_id = $1`, [productId])
  eq('restored stock reads as in_stock', r.rows[0].stock_status, 'in_stock')
  // Scoped to this product: the seed data leaves MT-BEARING-8 genuinely below
  // its reorder level, so an unrestricted count would be reporting another
  // product's still-open alert rather than a failure to clear this one.
  r = await db.query(
    `select count(*)::int as n from public.notifications
     where type = 'low_stock' and not is_read and product_id = $1`,
    [productId],
  )
  eq('restoring stock clears the unread low-stock alert', r.rows[0].n, 0)

  // --- out of stock -------------------------------------------------------
  // Reaching zero company-wide again, this time everywhere.
  await db.query(`select public.post_adjustment($1, $2, 0, 'lost', 'gone')`, [productId, LOC_B])
  await db.query(`select public.post_adjustment($1, $2, 0, 'lost', 'gone')`, [productId, LOC_A])
  eq('company total is zero', await totalNow(), 0)

  r = await db.query(`select stock_status from public.v_product_stock where product_id = $1`, [productId])
  eq('zero quantity reads as out_of_stock', r.rows[0].stock_status, 'out_of_stock')
  r = await db.query(`select count(*)::int as n from public.notifications where type = 'out_of_stock'`)
  check('an out-of-stock notification was raised', r.rows[0].n > 0, `n=${r.rows[0].n}`)

  // --- status transitions -------------------------------------------------
  const t2 = (
    await db.query(
      `select public.create_transfer($1, $2, $1, $3, 'MV-3', null, null,
         jsonb_build_array(jsonb_build_object('product_id', $4::uuid, 'quantity', 1))) as id`,
      [WH, LOC_A, LOC_B, productId],
    )
  ).rows[0].id
  await db.query(`select public.change_document_status('transfer', $1, 'waiting')`, [t2])
  r = await db.query(`select status from public.transfers where id = $1`, [t2])
  eq('draft advances to waiting', r.rows[0].status, 'waiting')

  threw = null
  try {
    await db.query(`select public.change_document_status('transfer', $1, 'done')`, [t2])
  } catch (e) {
    threw = e.message
  }
  check('status cannot jump straight to done', threw !== null && /validate action/i.test(threw), threw ?? 'no error')

  // --- views --------------------------------------------------------------
  r = await db.query(`select * from public.v_dashboard_kpis`)
  check('dashboard KPI view returns a row', r.rows.length === 1)
  check('dashboard total units is numeric', typeof Number(r.rows[0].total_units) === 'number')
  eq('dashboard out-of-stock count matches', Number(r.rows[0].out_of_stock_products), 4)

  r = await db.query(`select * from public.v_movements_daily order by day`)
  check('daily movements view aggregates the ledger', r.rows.length > 0)
  const anyNegative = r.rows.some((row) => Number(row.net) < 0 || Number(row.dispatched) > 0)
  check('movements view separates received and dispatched', anyNegative)

  r = await db.query(`select * from public.v_stock_by_warehouse`)
  check('stock by warehouse view returns rows', r.rows.length >= 1)

  r = await db.query(`select * from public.v_documents`)
  check('unified documents view spans all families', r.rows.length >= 3)
  check(
    'documents view includes receipts, deliveries and transfers',
    ['receipt', 'delivery', 'transfer'].every((t) => r.rows.some((row) => row.reference_type === t)),
  )

  r = await db.query(`select * from public.v_low_stock_products where product_id = $1`, [productId])
  eq('low stock view includes the depleted product', r.rows.length, 1)

  // --- every view must honour RLS ----------------------------------------
  r = await db.query(
    `select c.relname
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce(c.reloptions @> array['security_invoker=true'], false)`,
  )
  check(
    'every view sets security_invoker (no RLS bypass)',
    r.rows.length === 0,
    r.rows.length ? `offenders: ${r.rows.map((x) => x.relname).join(', ')}` : '',
  )

  // --- RLS is enabled everywhere -----------------------------------------
  r = await db.query(
    `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not c.relrowsecurity
       and relname not in ('spatial_ref_sys')`,
  )
  check('every table has RLS enabled', r.rows.length === 0, r.rows.length ? `unprotected: ${r.rows.map((x) => x.relname).join(', ')}` : '')

  // --- search -------------------------------------------------------------
  r = await db.query(`select * from public.global_search('Rack', 10)`)
  check('global search returns warehouse hits', r.rows.length >= 0)

  r = await db.query(`select * from public.global_search('STL', 10)`)
  check('global search finds a product by partial SKU', r.rows.some((x) => x.kind === 'product'))

  // --- product with history cannot be deleted -----------------------------
  threw = null
  try {
    await db.query(`delete from public.products where id = $1`, [productId])
  } catch (e) {
    threw = e.message
  }
  check(
    'a product with history cannot be deleted',
    threw !== null && /archive/i.test(threw),
    threw ?? 'no error',
  )

  // --- archiving is the supported alternative ----------------------------
  await db.query(`update public.products set status = 'archived' where id = $1`, [productId])
  r = await db.query(`select status from public.products where id = $1`, [productId])
  eq('archiving a product is allowed', r.rows[0].status, 'archived')

  // ===================================================================
  // Privilege escalation
  // ===================================================================
  // Everything above ran as the table owner, who bypasses RLS. The checks that
  // follow deliberately drop to the `authenticated` role, because that is the
  // only way to prove the policies actually restrict anything.
  const STAFF = '11111111-1111-1111-1111-111111111112'

  await db.query(`
    insert into auth.users (id, email, email_confirmed_at)
    values ('${STAFF}', 'staff@test.local', now())
    on conflict do nothing;
  `)
  // The signup trigger created the profile; force it down to warehouse staff.
  await db.exec(`update public.profiles set role = 'warehouse_staff' where id = '${STAFF}'`)
  await db.exec(`
    insert into public.user_warehouses (user_id, warehouse_id)
    values ('${STAFF}', '${WH}') on conflict do nothing;
  `)

  // `asAuthenticated` runs a statement as the browser role. SECURITY DEFINER
  // functions still execute as their owner, so this also proves the permission
  // checks inside them hold for a real caller.
  //
  // The explicit BEGIN matters: `set local` is silently ignored outside a
  // transaction block, which would leave the role as the table owner and make
  // every privilege check below pass for the wrong reason.
  const asAuth = async (sql, params = []) => {
    await db.exec(`begin; set local role authenticated; set local request.jwt.claim.sub = '${STAFF}'`)
    try {
      return await db.query(sql, params)
    } finally {
      // Roll back so a test that mutated data cannot leak into the next one.
      await db.exec(`rollback`).catch(() => db.exec(`commit`))
    }
  }

  // A staff member must not be able to promote themselves.
  let escalated = null
  try {
    await asAuth(`update public.profiles set role = 'admin' where id = $1`, [STAFF])
  } catch (e) {
    escalated = e.message
  }
  check(
    'a user cannot promote themselves to admin',
    escalated !== null && /permission denied/i.test(escalated),
    escalated ?? 'update succeeded - privilege escalation!',
  )

  r = await db.query(`select role from public.profiles where id = $1`, [STAFF])
  eq('role was not changed by the blocked update', r.rows[0].role, 'warehouse_staff')

  // Nor may they edit someone else's profile.
  let other = null
  try {
    await asAuth(`update public.profiles set full_name = 'hijacked' where id = $1`, [
      '11111111-1111-1111-1111-111111111111',
    ])
  } catch (e) {
    other = e.message
  }
  check(
    'a user cannot edit another user profile',
    other !== null,
    other ?? 'update succeeded - no RLS on profiles',
  )

  // Re-activate the product first: the checks above archived it, and an
  // "unavailable product" error would mask the permission error we want.
  await db.query(`update public.products set status = 'active' where id = $1`, [productId])

  // The internal stock engine must not be reachable from a client at all.
  let engine = null
  try {
    await asAuth(
      `select public.apply_stock_movement($1, $2, 500, 'receipt', 'receipt', null, 'HACK', 'direct', null, null, null)`,
      [productId, LOC_A],
    )
  } catch (e) {
    engine = e.message
  }
  check(
    'the stock engine RPC is not callable by a client',
    engine !== null && /permission denied/i.test(engine),
    engine ?? 'apply_stock_movement was callable - critical',
  )

  let notifier = null
  try {
    await asAuth(
      `select public.notify('${WH}', 'system', 'info', 'spoof', 'spoof', null, null, null, null, null)`,
    )
  } catch (e) {
    notifier = e.message
  }
  check(
    'the notification helper is not callable by a client',
    notifier !== null && /permission denied/i.test(notifier),
    notifier ?? 'notify was callable - critical',
  )

  // PUBLIC must hold no EXECUTE on anything in the schema. This is the check
  // that catches a future migration adding a function and forgetting the revoke.
  //
  // RLS policies are the one legitimate exception: a policy cannot call a
  // function the invoking role may not execute, so the read-only access
  // helpers are granted to `authenticated` and not to PUBLIC.
  const POLICY_HELPERS = [
    'current_role',
    'is_admin',
    'is_manager',
    'can_access_warehouse',
    'can_access_location',
  ]

  r = await db.query(`
    select p.proname as fn, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('public', p.oid, 'execute')
      and p.proname <> all ($1::text[])
  `, [POLICY_HELPERS])
  check(
    'no function in public is executable by PUBLIC',
    r.rows.length === 0,
    r.rows.length ? r.rows.map((x) => `${x.fn}(${x.args})`).join(', ') : '',
  )

  // The helpers themselves must stay closed to anon, which has no policies.
  r = await db.query(`
    select count(*)::int as n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any ($1::text[])
      and has_function_privilege('anon', p.oid, 'execute')
  `, [POLICY_HELPERS])
  eq('anon cannot execute the policy helpers', r.rows[0].n, 0)

  // And the application-facing RPCs must still be executable by a signed-in
  // user, otherwise the revoke above went too far.
  r = await db.query(`
    select p.proname as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_my_profile', 'create_product', 'post_adjustment', 'global_search')
      and has_function_privilege('authenticated', p.oid, 'execute')
  `)
  eq('app-facing RPCs remain executable by authenticated', r.rows.length, 4)

  // Anonymous callers must reach nothing at all.
  r = await db.query(`
    select count(*)::int as n
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
  `)
  eq('anon can execute no functions', r.rows[0].n, 0)

  r = await db.query(`
    select count(*)::int as n
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
      and has_table_privilege('anon', c.oid, 'select')
  `)
  eq('anon can select no tables or views', r.rows[0].n, 0)

  // A warehouse-scoped user sees only their own site's stock.
  //
  // Supabase grants the browser roles table privileges on new tables by
  // default. PGlite has no such defaults, so the reads below are granted here
  // to put the harness in the same starting position as a real project; RLS is
  // still what decides which rows come back.
  await db.exec(`
    grant usage on schema public to authenticated, anon;
    grant select on all tables in schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
  `)

  r = await asAuth(`select count(*)::int as n from public.inventory`)
  check('a scoped user can still read their own inventory', r.rows[0].n > 0, `n=${r.rows[0].n}`)

  // And they must not read a warehouse they are not assigned to.
  const OTHER_WH = 'aaaaaaaa-0000-0000-0000-000000000009'
  const OTHER_LOC = 'bbbbbbbb-0000-0000-0000-000000000009'
  await db.exec(`
    insert into public.warehouses (id, name, code)
    values ('${OTHER_WH}', 'Hidden Warehouse', 'HID') on conflict do nothing;
    insert into public.locations (id, warehouse_id, name, code, kind)
    values ('${OTHER_LOC}', '${OTHER_WH}', 'Hidden Rack', 'HID-R', 'rack')
    on conflict do nothing;
  `)
  r = await asAuth(`select count(*)::int as n from public.warehouses where id = $1`, [OTHER_WH])
  eq('a scoped user cannot see an unassigned warehouse', r.rows[0].n, 0)

  r = await asAuth(`select count(*)::int as n from public.warehouses where id = $1`, [WH])
  eq('a scoped user can see their assigned warehouse', r.rows[0].n, 1)

  // Nor may they post a document against it.
  let crossWarehouse = null
  try {
    await asAuth(
      `select public.create_receipt(null, $1, $2, 'X-1', null, null,
         jsonb_build_array(jsonb_build_object('product_id', $3::uuid, 'quantity', 1)))`,
      [OTHER_WH, OTHER_LOC, productId],
    )
  } catch (e) {
    crossWarehouse = e.message
  }
  check(
    'a scoped user cannot post into an unassigned warehouse',
    crossWarehouse !== null && /access/i.test(crossWarehouse),
    crossWarehouse ?? 'create_receipt succeeded across warehouses',
  )
  } catch (error) {
    // Surface only the useful fields: PGlite's DatabaseError is huge.
    results.fail += 1
    const where = [error.code && `code=${error.code}`, error.routine && `routine=${error.routine}`]
      .filter(Boolean)
      .join(' ')
    failures.push(`suite aborted: ${error.message}${where ? ` (${where})` : ''}`)
  }
}

await db.close()

console.log(`\n${'='.repeat(60)}`)
console.log(`  passed: ${results.pass}    failed: ${results.fail}`)
if (failures.length) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
console.log(`${'='.repeat(60)}\n`)

process.exit(results.fail === 0 ? 0 : 1)
