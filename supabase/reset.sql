-- ===================================================================
-- StockSense full database reset
-- ===================================================================
-- Drops everything the 18 migrations created so they can be re-run from
-- scratch in a clean state. Useful when a migration failed part way
-- through, or when experimenting with schema changes on a live project.
--
-- What is preserved, and why:
--   * the auth schema - GoTrue owns it. Only the demo and probe accounts
--     created during testing are removed.
--   * the extensions schema - pg_trgm and pgcrypto live there, and
--     migration 001 expects the schema to already exist.
--
-- After running this, re-run the migrations in filename order, then
-- supabase/seed.sql.
-- ===================================================================

-- The signup trigger lives on auth.users but points at a function in public.
-- Drop it first so the function can go without taking the auth schema with
-- it.
drop trigger if exists on_auth_user_created on auth.users;

-- Remove all application objects. CASCADE takes the dependent functions,
-- views, policies and triggers with it. Dropping the tables also removes
-- them from the supabase_realtime publication, which migration 018 re-adds.
drop schema if exists public cascade;
create schema public;

-- Supabase grants these on a new project. They are lost with the schema and
-- must be restored, otherwise the anon and authenticated roles have no access
-- to public at all and every API call fails regardless of table grants.
grant usage on schema public to postgres, anon, authenticated, service_role;

-- Default privileges for anything the migrations create next. Migrations 017
-- and 018 revoke these from anon again, so the net result matches a fresh
-- Supabase project rather than leaving anon with blanket access.
alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;

-- Remove the demo and test accounts. Safe to do now: the public schema that
-- held their profiles, warehouse access and ledger references is already
-- gone, so nothing cascades.
delete from auth.identities
where user_id in (
  select id from auth.users
  where email like '%@stocksense.app'
     or email like 'probe.check%@stocksense.app'
);
delete from auth.users
where email like '%@stocksense.app'
   or email like 'probe.check%@stocksense.app';

-- PostgREST caches the schema, so it keeps serving the dropped tables until
-- told to re-read. Without this every endpoint keeps 404ing after a reset.
notify pgrst, 'reload schema';

-- Confirm the slate is clean. Both should report 0.
select count(*) as remaining_public_tables
from information_schema.tables
where table_schema = 'public';

select count(*) as remaining_demo_users
from auth.users
where email like '%@stocksense.app'
   or email like 'probe.check%@stocksense.app';
