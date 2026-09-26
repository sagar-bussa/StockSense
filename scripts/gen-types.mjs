#!/usr/bin/env node
/**
 * Generate `src/lib/supabase/types.ts` from the schema.
 *
 * The schema is built by applying the real migrations to PGlite - the same
 * bootstrap the migration verifier uses - and then reading the Postgres system
 * catalogs. That means the emitted `Database` type describes the schema the
 * migrations actually produce, and it needs no network access, no service-role
 * key and no linked CLI project.
 *
 *   node scripts/gen-types.mjs          # rewrite src/lib/supabase/types.ts
 *   node scripts/gen-types.mjs --check  # fail if the file is out of date
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootstrapPGlite } from './lib/pglite-preamble.mjs'

const MIGRATIONS_DIR = resolve('supabase/migrations')
const OUT_FILE = resolve('src/lib/supabase/types.ts')

/**
 * Postgres type -> TypeScript, keyed on the names `format_type()` renders.
 *
 * Those are display names, not catalog names: a `bool` column prints as
 * `boolean` and a `timestamptz` prints as `timestamp with time zone`. Matching
 * on the internal name instead silently yields `Json`.
 */
const SCALARS = {
  boolean: 'boolean',
  smallint: 'number',
  integer: 'number',
  bigint: 'number',
  real: 'number',
  'double precision': 'number',
  numeric: 'number',
  decimal: 'number',
  money: 'number',
  uuid: 'string',
  text: 'string',
  'character varying': 'string',
  'character': 'string',
  varchar: 'string',
  bpchar: 'string',
  name: 'string',
  citext: 'string',
  date: 'string',
  time: 'string',
  'time with time zone': 'string',
  'time without time zone': 'string',
  'timestamp with time zone': 'string',
  'timestamp without time zone': 'string',
  interval: 'string',
  json: 'Json',
  jsonb: 'Json',
  bytea: 'string',
  inet: 'string',
  cidr: 'string',
  void: 'undefined',
  // Trigger functions are never callable over PostgREST; `undefined` keeps them
  // out of the client's RPC surface.
  trigger: 'undefined',
  // A tsvector is only ever consumed by the database's own search functions,
  // so the client sees it as an opaque string.
  tsvector: 'string',
}

/** Type names this generator could not map, reported after the run. */
const unmapped = new Set()

/**
 * Turn `format_type()` output into a TypeScript type expression.
 *
 * `format_type` already does the hard part: it renders the *resolved* type, so
 * a `varchar(120)` arrives as `character varying(120)` and an enum arrives as
 * its name. All that is left is stripping the modifier and unwrapping arrays.
 *
 * `ctx.tables` resolves a table's row type, which matters because several
 * functions return one (`apply_stock_movement` returns `public.stock_ledger`).
 */
function tsTypeFor(postgresType, ctx) {
  let base = postgresType.trim()
  let depth = 0

  while (base.endsWith('[]')) {
    depth += 1
    base = base.slice(0, -2).trim()
  }
  base = base.replace(/\s*\([^)]*\)\s*$/, '').trim()

  let scalar
  if (ctx.enums.has(base)) {
    scalar = `Database['public']['Enums']['${base}']`
  } else if (ctx.tables.has(base)) {
    scalar = `Database['public']['Tables']['${base}']['Row']`
  } else if (SCALARS[base]) {
    scalar = SCALARS[base]
  } else {
    // An unrecognised type is a gap in this generator, not in the schema.
    // `Json` keeps the client compiling; the warning makes it visible.
    unmapped.add(base)
    scalar = 'Json'
  }

  return depth === 0 ? scalar : `${scalar}[]`
}

/** Property keys that are not valid bare identifiers must be quoted. */
function propKey(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

function indent(text, spaces) {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n')
}

/**
 * Render `{ a: string; b: number }` from a list of [name, type, optional]
 * triples. `Update` rows are all optional, because `.update()` patches only the
 * columns it is given - required fields there would reject a one-column patch.
 */
function objectType(pairs) {
  if (pairs.length === 0) return 'Record<string, never>'
  return `{\n${pairs.map(([n, t, optional]) => `${propKey(n)}${optional ? '?' : ''}: ${t}`).join(';\n')}\n}`
}

/**
 * Emit `key: { ... }` with braces aligned at `column`.
 *
 * `column` is the absolute column the key starts in, so callers prefix the
 * result themselves rather than re-indenting an already-formatted block (which
 * would indent the closing brace a second time).
 */
function member(key, objectString, column) {
  if (!objectString.startsWith('{')) return `${key}: ${objectString}`
  const body = objectString.slice(1, -1).replace(/^\n/, '').replace(/\n$/, '')
  if (body.trim().length === 0) return `${key}: {${' '.repeat(column + 2)}}`
  return `${key}: {\n${indent(body, column + 2)}\n${' '.repeat(column)}}`
}

async function main() {
  const checkOnly = process.argv.includes('--check')

  console.log('Bootstrapping PGlite...')
  const { db, stripUnsupported } = await bootstrapPGlite()

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()
  console.log(`Applying ${files.length} migrations...`)
  for (const file of files) {
    const sql = stripUnsupported(await readFile(join(MIGRATIONS_DIR, file), 'utf8'))
    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(`${file} failed to apply: ${error.message}`)
    }
  }

  // -- enums ---------------------------------------------------------------
  const enumRows = await db.query(`
    select t.typname as name, e.enumlabel as value
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
    order by t.typname, e.enumsortorder
  `)
  const enums = new Map()
  for (const row of enumRows.rows) {
    if (!enums.has(row.name)) enums.set(row.name, [])
    enums.get(row.name).push(row.value)
  }

  // -- tables and views ----------------------------------------------------
  const columnRows = await db.query(`
    select
      c.relname as table_name,
      c.relkind,
      a.attname as column_name,
      format_type(a.atttypid, a.atttypmod) as data_type,
      a.attnotnull as not_null,
      pg_get_expr(d.adbin, d.adrelid) as column_default,
      a.attidentity <> '' as is_identity,
      a.attgenerated <> '' as is_generated
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm')
      and a.attnum > 0
      and not a.attisdropped
    order by c.relname, a.attnum
  `)

  const tables = new Map()
  for (const row of columnRows.rows) {
    if (!tables.has(row.table_name)) {
      tables.set(row.table_name, { kind: row.relkind, columns: [] })
    }
    tables.get(row.table_name).columns.push(row)
  }

  /**
   * Views are read-only, so their Insert/Update are `never` - which also makes
   * an accidental write a compile error rather than a runtime RLS rejection.
   */
  function nullable(column, ts) {
    return column.not_null ? ts : `${ts} | null`
  }

  const typeOf = (column) => nullable(column, tsTypeFor(column.data_type, ctx))

  /** A value the database can supply itself may be omitted on insert. */
  const hasDefault = (column) =>
    Boolean(column.not_null && (column.column_default || column.is_generated || column.is_identity))

  const tableNames = [...tables.entries()].filter(([, t]) => t.kind === 'r' || t.kind === 'p')
  const viewNames = [...tables.entries()].filter(([, t]) => t.kind === 'v' || t.kind === 'm')

  /** Everything `tsTypeFor` needs to resolve a Postgres type name. */
  const ctx = { enums, tables: new Set(tableNames.map(([name]) => name)) }

  // -- functions -----------------------------------------------------------
  const functionRows = await db.query(`
    select
      p.proname as name,
      pg_get_function_arguments(p.oid) as args_text,
      pg_get_function_result(p.oid) as result_text,
      pg_get_function_identity_arguments(p.oid) as identity_text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
    order by p.proname, p.oid
  `)

  /**
   * Split a `pg_get_function_arguments` string into [name, type, hasDefault]
   * triples. Argument text is comma separated, but a type can itself contain a
   * comma (`numeric(12, 3)`), so track parenthesis depth while splitting.
   */
  function parseArgs(argsText) {
    const out = []
    let depth = 0
    let current = ''
    const parts = []
    for (const char of argsText) {
      if (char === '(' || char === '[') depth += 1
      if (char === ')' || char === ']') depth -= 1
      if (char === ',' && depth === 0) {
        parts.push(current)
        current = ''
      } else {
        current += char
      }
    }
    if (current.trim()) parts.push(current)

    for (const part of parts) {
      const text = part.trim()
      if (!text) continue
      const match = text.match(/^(\S+)\s+(.*)$/s)
      if (!match) continue
      const hasDefault = /\bdefault\b/i.test(match[2])
      const typeText = match[2].replace(/\s+default\s+[\s\S]*$/i, '').trim()
      out.push({ name: match[1], typeText, hasDefault })
    }
    return out
  }

  /** Map a `pg_get_function_result` string onto a TypeScript return type. */
  function returnType(resultText) {
    const text = resultText.trim()
    const table = text.match(/^TABLE\s*\(([\s\S]*)\)$/i)
    if (table) {
      const columns = parseArgs(table[1]).map(({ name, typeText }) => [
        name,
        nullable({ not_null: true }, tsTypeFor(typeText, ctx)),
      ])
      return `${objectType(columns)}[]`
    }
    const setof = text.match(/^SETOF\s+([\s\S]+)$/i)
    if (setof) {
      const inner = setof[1].trim()
      if (/^record$/i.test(inner)) return 'Json[]'
      return `${tsTypeFor(inner, ctx)}[]`
    }
    if (/\brecord\b/i.test(text)) return 'Json'
    return tsTypeFor(text, ctx)
  }

  const functions = new Map()
  for (const row of functionRows.rows) {
    const args = parseArgs(row.args_text)
    const pairs = args.map((arg) => [
      arg.name,
      tsTypeFor(arg.typeText, ctx) + (arg.hasDefault ? ' | undefined' : ''),
    ])
    const entry = {
      Args: objectType(pairs),
      Returns: returnType(row.result_text),
      /** Used to merge overloads onto a single entry. */
      identity: row.identity_text,
      argNames: args.map((a) => a.name),
    }
    if (!functions.has(row.name)) functions.set(row.name, [])
    functions.get(row.name).push(entry)
  }

  // -- emit ----------------------------------------------------------------
  const out = []
  out.push(`/**
 * GENERATED FILE - DO NOT EDIT BY HAND.
 *
 * Regenerate with:
 *
 *   node scripts/gen-types.mjs
 *
 * Built by applying supabase/migrations to PGlite and reading the Postgres
 * system catalogs, so these types always match the schema the migrations
 * produce. \`npm run db:types:check\` fails if this file drifts.
 */
`)

  out.push(
    'export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]',
  )
  out.push('')
  out.push('export type Database = {')
  out.push('  public: {')

  out.push('    Tables: {')
  for (const [name, table] of tableNames.sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`      ${name}: {`)
    out.push(`        ${member('Row', objectType(table.columns.map((c) => [c.column_name, typeOf(c)])), 8)}`)
    out.push(
      `        ${member(
        'Insert',
        objectType(
          table.columns.filter((c) => !hasDefault(c)).map((c) => [c.column_name, typeOf(c)]),
        ),
        8,
      )}`,
    )
    out.push(
      `        ${member(
        'Update',
        objectType(table.columns.map((c) => [c.column_name, typeOf(c), true])),
        8,
      )}`,
    )
    out.push('        Relationships: []')
    out.push('      }')
  }
  out.push('    }')

  out.push('    Views: {')
  for (const [name, table] of viewNames.sort(([a], [b]) => a.localeCompare(b))) {
    out.push(`      ${name}: {`)
    out.push(`        ${member('Row', objectType(table.columns.map((c) => [c.column_name, typeOf(c)])), 8)}`)
    out.push('        Insert: never')
    out.push('        Update: never')
    out.push('        Relationships: []')
    out.push('      }')
  }
  out.push('    }')

  out.push('    Functions: {')
  for (const name of [...functions.keys()].sort()) {
    for (const fn of functions.get(name)) {
      out.push(`      ${name}: {`)
      out.push(`        ${member('Args', fn.Args, 8)}`)
      out.push(`        Returns: ${fn.Returns}`)
      out.push('      }')
    }
  }
  out.push('    }')

  out.push('    Enums: {')
  for (const name of [...enums.keys()].sort()) {
    const values = enums
      .get(name)
      .map((v) => JSON.stringify(v))
      .join(' | ')
    out.push(`      ${name}: ${values}`)
  }
  out.push('    }')

  out.push('    CompositeTypes: {')
  for (const name of [...enums.keys()].sort()) void name
  out.push('      [_ in never]: never')
  out.push('    }')
  out.push('  }')
  out.push('}')
  out.push('')

  const output = out.join('\n')

  if (unmapped.size > 0) {
    console.warn(
      `\nWARNING: unmapped Postgres types fell back to Json: ${[...unmapped].sort().join(', ')}`,
    )
  }

  if (checkOnly) {
    const current = await readFile(OUT_FILE, 'utf8').catch(() => '')
    if (current !== output) {
      console.error('FAIL: src/lib/supabase/types.ts is out of date.')
      console.error('      Run: node scripts/gen-types.mjs')
      process.exitCode = 1
    } else {
      console.log('OK: src/lib/supabase/types.ts matches the migrations.')
    }
  } else {
    await writeFile(OUT_FILE, output, 'utf8')
    console.log(
      `\nWrote src/lib/supabase/types.ts\n  ${tableNames.length} tables, ${viewNames.length} views, ${functions.size} functions (${functionRows.rows.length} signatures), ${enums.size} enums.`,
    )
  }

  await db.close()
}

await main()
