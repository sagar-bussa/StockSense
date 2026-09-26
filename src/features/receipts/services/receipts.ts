import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type Receipt = Database['public']['Tables']['receipts']['Row']
export type ReceiptItem = Database['public']['Tables']['receipt_items']['Row']
export type Supplier = Database['public']['Tables']['suppliers']['Row']

export type ReceiptWithDetails = Receipt & {
  suppliers: Supplier | null
  warehouses: { name: string; code: string } | null
  locations: { name: string; code: string } | null
  profiles_created: { full_name: string | null; email: string } | null
  profiles_validated: { full_name: string | null; email: string } | null
}

export type ReceiptItemWithProduct = ReceiptItem & {
  products: { name: string; sku: string; unit_of_measure: string } | null
}

export async function fetchReceipts(options?: {
  status?: string
  warehouseId?: string | null
  search?: string
}): Promise<ReceiptWithDetails[]> {
  let query = supabase
    .from('receipts')
    .select(
      `
      *,
      suppliers (*),
      warehouses (name, code),
      locations (name, code),
      profiles_created:created_by (full_name, email),
      profiles_validated:validated_by (full_name, email)
    `,
    )
    .order('created_at', { ascending: false })

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status as Database['public']['Enums']['doc_status'])
  }

  if (options?.warehouseId) {
    query = query.eq('warehouse_id', options.warehouseId)
  }

  if (options?.search) {
    const s = options.search.trim()
    query = query.or(`receipt_number.ilike.%${s}%,reference.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as ReceiptWithDetails[]
}

export async function fetchReceiptById(receiptId: string): Promise<{
  receipt: ReceiptWithDetails
  items: ReceiptItemWithProduct[]
}> {
  const { data: receiptData, error: receiptError } = await supabase
    .from('receipts')
    .select(
      `
      *,
      suppliers (*),
      warehouses (name, code),
      locations (name, code),
      profiles_created:created_by (full_name, email),
      profiles_validated:validated_by (full_name, email)
    `,
    )
    .eq('id', receiptId)
    .single()

  if (receiptError) throw receiptError

  const { data: itemsData, error: itemsError } = await supabase
    .from('receipt_items')
    .select(
      `
      *,
      products (name, sku, unit_of_measure)
    `,
    )
    .eq('receipt_id', receiptId)

  if (itemsError) throw itemsError

  return {
    receipt: receiptData as unknown as ReceiptWithDetails,
    items: (itemsData ?? []) as unknown as ReceiptItemWithProduct[],
  }
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createReceiptRPC(params: {
  supplierId: string
  warehouseId: string
  locationId: string
  reference?: string | null
  expectedAt?: string | null
  notes?: string | null
  items: Array<{ productId: string; quantity: number; unitCost?: number }>
}): Promise<string> {
  const formattedItems = params.items.map((i) => ({
    product_id: i.productId,
    quantity: i.quantity,
    unit_cost: i.unitCost ?? 0,
  }))

  const { data, error } = await supabase.rpc('create_receipt', {
    p_supplier_id: params.supplierId,
    p_warehouse_id: params.warehouseId,
    p_location_id: params.locationId,
    p_reference: params.reference || undefined,
    p_expected_at: params.expectedAt || undefined,
    p_notes: params.notes || undefined,
    p_items: formattedItems,
  })

  if (error) throw error
  return data as string
}

export async function validateReceiptRPC(receiptId: string): Promise<void> {
  const { error } = await supabase.rpc('validate_receipt', {
    p_receipt_id: receiptId,
  })

  if (error) throw error
}

export async function cancelReceiptRPC(receiptId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_document', {
    p_reference_type: 'receipt',
    p_document_id: receiptId,
    p_reason: reason,
  })

  if (error) throw error
}
