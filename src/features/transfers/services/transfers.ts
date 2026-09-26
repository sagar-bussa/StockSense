import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type Transfer = Database['public']['Tables']['transfers']['Row']
export type TransferItem = Database['public']['Tables']['transfer_items']['Row']

export type TransferWithDetails = Transfer & {
  source_warehouse: { name: string; code: string } | null
  source_location: { name: string; code: string } | null
  dest_warehouse: { name: string; code: string } | null
  dest_location: { name: string; code: string } | null
  profiles_created: { full_name: string | null; email: string } | null
  profiles_validated: { full_name: string | null; email: string } | null
}

export type TransferItemWithProduct = TransferItem & {
  products: { name: string; sku: string; unit_of_measure: string } | null
}

export async function fetchTransfers(options?: {
  status?: string
  warehouseId?: string | null
  search?: string
}): Promise<TransferWithDetails[]> {
  let query = supabase
    .from('transfers')
    .select(
      `
      *,
      source_warehouse:source_warehouse_id (name, code),
      source_location:source_location_id (name, code),
      dest_warehouse:destination_warehouse_id (name, code),
      dest_location:destination_location_id (name, code),
      profiles_created:created_by (full_name, email),
      profiles_validated:validated_by (full_name, email)
    `,
    )
    .order('created_at', { ascending: false })

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status as Database['public']['Enums']['doc_status'])
  }

  if (options?.warehouseId) {
    query = query.or(
      `source_warehouse_id.eq.${options.warehouseId},destination_warehouse_id.eq.${options.warehouseId}`,
    )
  }

  if (options?.search) {
    const s = options.search.trim()
    query = query.or(`transfer_number.ilike.%${s}%,reference.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as TransferWithDetails[]
}

export async function fetchTransferById(transferId: string): Promise<{
  transfer: TransferWithDetails
  items: TransferItemWithProduct[]
}> {
  const { data: transferData, error: transferError } = await supabase
    .from('transfers')
    .select(
      `
      *,
      source_warehouse:source_warehouse_id (name, code),
      source_location:source_location_id (name, code),
      dest_warehouse:destination_warehouse_id (name, code),
      dest_location:destination_location_id (name, code),
      profiles_created:created_by (full_name, email),
      profiles_validated:validated_by (full_name, email)
    `,
    )
    .eq('id', transferId)
    .single()

  if (transferError) throw transferError

  const { data: itemsData, error: itemsError } = await supabase
    .from('transfer_items')
    .select(
      `
      *,
      products (name, sku, unit_of_measure)
    `,
    )
    .eq('transfer_id', transferId)

  if (itemsError) throw itemsError

  return {
    transfer: transferData as unknown as TransferWithDetails,
    items: (itemsData ?? []) as unknown as TransferItemWithProduct[],
  }
}

export async function createTransferRPC(params: {
  sourceWarehouseId: string
  sourceLocationId: string
  destWarehouseId: string
  destLocationId: string
  reference?: string | null
  expectedAt?: string | null
  notes?: string | null
  items: Array<{ productId: string; quantity: number }>
}): Promise<string> {
  const formattedItems = params.items.map((i) => ({
    product_id: i.productId,
    quantity: i.quantity,
  }))

  const { data, error } = await supabase.rpc('create_transfer', {
    p_source_warehouse_id: params.sourceWarehouseId,
    p_source_location_id: params.sourceLocationId,
    p_destination_warehouse_id: params.destWarehouseId,
    p_destination_location_id: params.destLocationId,
    p_reference: params.reference || undefined,
    p_notes: params.notes || undefined,
    p_expected_at: params.expectedAt || undefined,
    p_items: formattedItems,
  })

  if (error) throw error
  return data as string
}

export async function validateTransferRPC(transferId: string): Promise<void> {
  const { error } = await supabase.rpc('validate_transfer', {
    p_transfer_id: transferId,
  })

  if (error) throw error
}

export async function cancelTransferRPC(transferId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_document', {
    p_reference_type: 'transfer',
    p_document_id: transferId,
    p_reason: reason,
  })

  if (error) throw error
}
