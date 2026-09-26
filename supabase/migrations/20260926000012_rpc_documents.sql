-- ===================================================================
-- 012 · Document status and cancellation
-- ===================================================================
-- Shared by all four document families, so the rules cannot drift apart.

-- ===================================================================
-- change_document_status
-- ===================================================================
-- Moves a document between the pre-validation states only. Reaching 'done' is
-- refused here on purpose: that is what the validate_* functions are for, and
-- routing it through one place is what guarantees no document can become Done
-- without its stock movement and ledger entries.

create or replace function public.change_document_status(
  p_reference_type public.ref_type,
  p_document_id    uuid,
  p_new_status     public.doc_status
)
returns public.doc_status
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current public.doc_status;
  v_warehouse uuid;
begin
  if p_new_status = 'done' then
    raise exception
      'STOCKSENSE:Use the validate action to complete this document so stock and history stay in step.'
      using errcode = 'P0001';
  end if;

  case p_reference_type
    when 'receipt' then
      select status, warehouse_id into v_current, v_warehouse
      from public.receipts where id = p_document_id for update;
    when 'delivery' then
      select status, warehouse_id into v_current, v_warehouse
      from public.deliveries where id = p_document_id for update;
    when 'transfer' then
      select status, source_warehouse_id into v_current, v_warehouse
      from public.transfers where id = p_document_id for update;
    else
      raise exception 'STOCKSENSE:Unknown document type.' using errcode = 'P0001';
  end case;

  if v_current is null then
    raise exception 'STOCKSENSE:This document no longer exists.' using errcode = 'P0001';
  end if;

  if not public.can_access_warehouse(v_warehouse) then
    raise exception 'STOCKSENSE:You do not have access to this document.' using errcode = 'P0001';
  end if;

  perform public.assert_valid_transition(v_current, p_new_status);

  case p_reference_type
    when 'receipt' then
      update public.receipts set status = p_new_status where id = p_document_id;
    when 'delivery' then
      update public.deliveries set status = p_new_status where id = p_document_id;
    when 'transfer' then
      update public.transfers set status = p_new_status where id = p_document_id;
  end case;

  return p_new_status;
end;
$$;

-- ===================================================================
-- cancel_document
-- ===================================================================
-- Cancellation is free of stock consequences *only because* it is refused for
-- anything already Done. A completed document has ledger entries behind it, so
-- the only way to reverse it is an adjustment - which leaves both records
-- visible instead of quietly deleting history.

create or replace function public.cancel_document(
  p_reference_type public.ref_type,
  p_document_id    uuid,
  p_reason         text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status   public.doc_status;
  v_warehouse uuid;
  v_number   text;
  v_actor    uuid := auth.uid();
  v_reason   text := nullif(trim(p_reason), '');
begin
  if v_reason is null then
    raise exception 'STOCKSENSE:Give a reason for cancelling this document.'
      using errcode = 'P0001';
  end if;

  case p_reference_type
    when 'receipt' then
      select status, warehouse_id, receipt_number into v_status, v_warehouse, v_number
      from public.receipts where id = p_document_id for update;
    when 'delivery' then
      select status, warehouse_id, delivery_number into v_status, v_warehouse, v_number
      from public.deliveries where id = p_document_id for update;
    when 'transfer' then
      select status, source_warehouse_id, transfer_number into v_status, v_warehouse, v_number
      from public.transfers where id = p_document_id for update;
    when 'adjustment' then
      select status, warehouse_id, adjustment_number into v_status, v_warehouse, v_number
      from public.adjustments where id = p_document_id for update;
    else
      raise exception 'STOCKSENSE:Unknown document type.' using errcode = 'P0001';
  end case;

  if v_status is null then
    raise exception 'STOCKSENSE:This document no longer exists.' using errcode = 'P0001';
  end if;

  if v_status = 'done' then
    raise exception
      'STOCKSENSE:% is already completed, so it cannot be cancelled. Post a reversing adjustment instead.',
      v_number
      using errcode = 'P0001';
  end if;

  if v_status = 'canceled' then
    raise exception 'STOCKSENSE:This document is already cancelled.' using errcode = 'P0001';
  end if;

  if not public.can_access_warehouse(v_warehouse) then
    raise exception 'STOCKSENSE:You do not have access to this document.' using errcode = 'P0001';
  end if;

  case p_reference_type
    when 'receipt' then
      update public.receipts
      set status = 'canceled', canceled_by = v_actor, canceled_at = now(), cancel_reason = v_reason
      where id = p_document_id;
    when 'delivery' then
      update public.deliveries
      set status = 'canceled', canceled_by = v_actor, canceled_at = now(), cancel_reason = v_reason
      where id = p_document_id;
    when 'transfer' then
      update public.transfers
      set status = 'canceled', canceled_by = v_actor, canceled_at = now(), cancel_reason = v_reason
      where id = p_document_id;
  end case;
end;
$$;

comment on function public.cancel_document is
  'Cancel an unvalidated document. Refused once Done, because a completed document has ledger history.';
