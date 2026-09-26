-- ===================================================================
-- 001 · Foundations: extensions, enums, shared helpers
-- ===================================================================
-- Every later migration depends on this file. Run migrations in order.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- gen_random_uuid() lives in pgcrypto; in Supabase it is also available from
-- the `extensions` schema, so make it reachable unqualified everywhere.
create schema if not exists extensions;

-- ===================================================================
-- Enums
-- ===================================================================

-- Roles. Kept minimal and extensible: adding a role is a single ALTER TYPE
-- plus one branch in the `is_manager()` style helpers.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'inventory_manager', 'warehouse_staff');
  end if;

  if not exists (select 1 from pg_type where typname = 'doc_status') then
    -- The full lifecycle, plus Canceled at any point before Done.
    create type public.doc_status as enum ('draft', 'waiting', 'ready', 'done', 'canceled');
  end if;

  if not exists (select 1 from pg_type where typname = 'entity_status') then
    -- Products and partners are archived rather than deleted, because the
    -- ledger references them forever.
    create type public.entity_status as enum ('active', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'tx_type') then
    create type public.tx_type as enum (
      'receipt',
      'delivery',
      'transfer_in',
      'transfer_out',
      'adjustment'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ref_type') then
    create type public.ref_type as enum ('receipt', 'delivery', 'transfer', 'adjustment', 'initial');
  end if;

  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum (
      'low_stock',
      'out_of_stock',
      'receipt_validated',
      'delivery_validated',
      'transfer_completed',
      'adjustment_completed',
      'system'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'severity') then
    create type public.severity as enum ('info', 'warning', 'critical');
  end if;

  if not exists (select 1 from pg_type where typname = 'location_kind') then
    create type public.location_kind as enum (
      'rack',
      'floor',
      'store',
      'dock',
      'quarantine',
      'staging'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'unit_of_measure') then
    create type public.unit_of_measure as enum (
      'pcs', 'kg', 'g', 'l', 'ml', 'm', 'm2', 'm3',
      'box', 'pack', 'set', 'roll', 'bag', 'pair', 'carton', 'drum'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'adjustment_reason') then
    -- A controlled vocabulary keeps the audit trail searchable. `other` is
    -- always available and always requires a note.
    create type public.adjustment_reason as enum (
      'damaged',
      'expired',
      'lost',
      'found',
      'miscount',
      'returned',
      'theft',
      'production_consumption',
      'quality_reject',
      'other'
    );
  end if;
end
$$;

-- ===================================================================
-- Updated-at maintenance
-- ===================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Generic BEFORE UPDATE trigger that stamps updated_at.';

-- ===================================================================
-- Document numbering
-- =================================================================--
-- Sequences rather than count(*)+1: two concurrent validations would
-- otherwise read the same max and collide on the unique constraint.

create sequence if not exists public.receipt_seq start 1001;
create sequence if not exists public.delivery_seq start 1001;
create sequence if not exists public.transfer_seq start 1001;
create sequence if not exists public.adjustment_seq start 1001;

create or replace function public.next_receipt_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'RCV-' || to_char(nextval('public.receipt_seq'), 'FM000000');
$$;

create or replace function public.next_delivery_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'DLV-' || to_char(nextval('public.delivery_seq'), 'FM000000');
$$;

create or replace function public.next_transfer_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'TRF-' || to_char(nextval('public.transfer_seq'), 'FM000000');
$$;

create or replace function public.next_adjustment_number()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'ADJ-' || to_char(nextval('public.adjustment_seq'), 'FM000000');
$$;

-- ===================================================================
-- Status transition guard
-- ===================================================================
-- The Draft -> Waiting -> Ready -> Done pipeline, plus Canceled, and Done is
-- terminal. This is enforced in one place so a bug in any RPC cannot invent a
-- new transition.
--
-- Done is deliberately absorbing: a validated document can never be reopened,
-- because its ledger entries already exist. Correcting a mistake is done with
-- an adjustment, which keeps the history intact.
--
-- This guard decides which transitions are structurally legal. It does not
-- decide who may complete a document: reaching Done is gated by the caller,
-- so only the validate_* RPCs - which post the matching ledger entries in the
-- same transaction - can pass Done through here. change_document_status()
-- rejects Done up front for exactly that reason.

create or replace function public.assert_valid_transition(
  p_from public.doc_status,
  p_to public.doc_status
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from = p_to then
    return;
  end if;

  if p_from = 'done' then
    raise exception 'STOCKSENSE:This document is already done and cannot be changed. Post an adjustment instead.'
      using errcode = 'P0001';
  end if;

  if p_from = 'canceled' then
    raise exception 'STOCKSENSE:This document is canceled and cannot be changed.'
      using errcode = 'P0001';
  end if;

  if p_to = 'canceled' then
    return; -- cancellation is always allowed before completion
  end if;

  if not (
    (p_from = 'draft' and p_to in ('waiting', 'ready', 'done')) or
    (p_from = 'waiting' and p_to in ('ready', 'done')) or
    (p_from = 'ready' and p_to in ('draft', 'done'))
  ) then
    raise exception 'STOCKSENSE:Cannot move this document from % to %.', p_from, p_to
      using errcode = 'P0001';
  end if;
end;
$$;
