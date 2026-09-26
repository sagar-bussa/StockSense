/**
 * Shared PGlite bootstrap.
 *
 * Both the migration verifier and the type generator need "the schema, exactly
 * as Supabase would present it": the same roles, the same `auth` tables GoTrue
 * owns, and the same extension functions PGlite does not ship. Keeping that
 * setup in one place means a type can never be generated from a schema that
 * differs from the one the verifier tests.
 */
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

/**
 * Start a PGlite instance with Supabase's non-Postgres prerequisites in place.
 * Migrations still have to be applied by the caller.
 */
export async function bootstrapPGlite() {
  const db = new PGlite({ extensions: { pg_trgm } })

  // Roles, schemas and the auth tables the migrations reference.
  await db.exec(`
    create schema if not exists extensions;
    create schema if not exists auth;

    -- Supabase provisions these roles; PGlite has a single superuser. Recreating
    -- them as no-login roles lets the migrations' GRANT/REVOKE statements - and
    -- the RLS policies keyed on them - apply unchanged.
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
      end if;
    end
    $$;

    -- Stand-in for the table Supabase's GoTrue owns. Only the columns the
    -- migrations touch are needed to type-check them.
    create table if not exists auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb default '{}'::jsonb,
      email_confirmed_at timestamptz
    );

    -- GoTrue records one row per linked identity (here, just the email
    -- provider) and reads it when it resolves a session. A user inserted
    -- straight into auth.users has no identity row, which is why the seed has
    -- to create these too or login fails.
    create table if not exists auth.identities (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users (id) on delete cascade,
      provider text not null,
      provider_id text not null,
      identity_data jsonb not null default '{}'::jsonb,
      last_sign_in_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    -- Supabase wires these up in PostgREST; PGlite has no GoTrue, so replicate
    -- the exact upstream definitions (they read the JWT claim settings).
    -- auth.uid() upstream checks the flattened claim first and then falls back
    -- to the raw JSON, which is what PostgREST actually sets. Matching both
    -- matters: a stub that only read the flattened key would report an
    -- unrelated permission error for anything that sets request.jwt.claims.
    create or replace function auth.uid() returns uuid
      language sql stable
      as $$
        select coalesce(
          nullif(current_setting('request.jwt.claim.sub', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
        )::uuid
      $$;

    create or replace function auth.role() returns text
      language sql stable
      as $$
        select coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
        )
      $$;
  `)

  // PGlite has no pgcrypto, so gen_random_uuid() is stubbed. pg_trgm is a real
  // PGlite contrib extension; install it into the `extensions` schema so the
  // schema-qualified opclass the migrations reference (extensions.gin_trgm_ops)
  // resolves exactly as it does on Supabase. The migrations' own
  // `create extension if not exists` then no-ops.
  const needsTrgmStrip = await (async () => {
    try {
      await db.exec(`create extension if not exists pg_trgm with schema extensions;`)
      return false
    } catch {
      return true
    }
  })()

  function stripUnsupported(sql) {
    let out = sql.replace(/^\s*create extension .*$/gim, '')
    if (needsTrgmStrip) {
      out = out.replace(
        /create\s+(?:unique\s+)?index\b[^;]*?extensions\.gin_trgm_ops\s*\)?\s*;/gi,
        '',
      )
    }
    // PGlite has no logical replication, so it rejects REPLICA IDENTITY FULL on a
    // table that has no replica identity columns, failing later writes with
    // 42P10. Supabase supports it, so it is only stripped for the harness.
    out = out.replace(/^\s*alter table .*replica identity full\s*;$/gim, '')
    return out
  }

  // gen_random_uuid() is referenced unqualified by table defaults, so it must be
  // reachable from the default search_path.
  await db.exec(`
    create or replace function extensions.gen_random_uuid() returns uuid
      language sql volatile
      as $$ select md5(random()::text || clock_timestamp()::text)::uuid $$;

    create or replace function gen_random_uuid() returns uuid
      language sql volatile
      as $$ select extensions.gen_random_uuid() $$;
  `)

  // The seed writes auth.users the way GoTrue does, which uses pgcrypto's
  // crypt/gen_salt for the password hash. PGlite has no pgcrypto, so provide
  // equivalents: crypt() returns a fixed-shape bcrypt string and gen_salt()
  // returns a placeholder salt. Only the call signatures matter for testing
  // that the seed SQL is valid; Supabase uses the real implementations.
  await db.exec(`
    alter table auth.users add column if not exists instance_id uuid;
    alter table auth.users add column if not exists aud text;
    alter table auth.users add column if not exists role text;
    alter table auth.users add column if not exists encrypted_password text;
    alter table auth.users add column if not exists raw_app_meta_data jsonb;
    alter table auth.users add column if not exists is_sso_user boolean;
    alter table auth.users add column if not exists is_anonymous boolean;
    -- GoTrue scans these into non-nullable strings, so a null value makes the
    -- user lookup fail with a database error. The stub therefore carries them
    -- with a non-null default, matching the real schema.
    alter table auth.users add column if not exists confirmation_token text not null default '';
    alter table auth.users add column if not exists email_change text not null default '';
    alter table auth.users add column if not exists email_change_token_new text not null default '';
    alter table auth.users add column if not exists recovery_token text not null default '';
    alter table auth.users add column if not exists created_at timestamptz;
    alter table auth.users add column if not exists updated_at timestamptz;
    create unique index if not exists auth_identities_provider_provider_id_key
      on auth.identities (provider, provider_id);

    create or replace function extensions.gen_salt(text) returns text
      language sql immutable
      as $$ select '$2a$10$harnesssaltharnesssalt' $$;

    create or replace function gen_salt(text) returns text
      language sql immutable
      as $$ select extensions.gen_salt($1) $$;

    create or replace function extensions.crypt(text, text) returns text
      language sql immutable
      as $$ select '$2a$10$harness' || substr(md5($1), 1, 22) $$;

    create or replace function crypt(text, text) returns text
      language sql immutable
      as $$ select extensions.crypt($1, $2) $$;
  `)
  await db.exec(`alter database postgres set search_path = public, extensions;`)

  return { db, stripUnsupported }
}
