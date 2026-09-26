import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type LedgerRow = Database['public']['Tables']['stock_ledger']['Row']

export type LedgerRowWithDetails = LedgerRow & {
  products: { name: string; sku: string; unit_of_measure: string } | null
  warehouses: { name: string; code: string } | null
  locations: { name: string; code: string } | null
  source_location: { name: string; code: string } | null
  dest_location: { name: string; code: string } | null
}

export async function fetchStockLedger(options?: {
  type?: string
  productId?: string
  warehouseId?: string | null
  search?: string
  limit?: number
}): Promise<LedgerRowWithDetails[]> {
  let query = supabase
    .from('stock_ledger')
    .select(
      `
      *,
      products (name, sku, unit_of_measure),
      warehouses (name, code),
      locations:location_id (name, code),
      source_location:source_location_id (name, code),
      dest_location:destination_location_id (name, code)
    `,
    )
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? 100)

  if (options?.type && options.type !== 'all') {
    query = query.eq('transaction_type', options.type as Database['public']['Enums']['tx_type'])
  }

  if (options?.productId) {
    query = query.eq('product_id', options.productId)
  }

  if (options?.warehouseId) {
    query = query.eq('warehouse_id', options.warehouseId)
  }

  if (options?.search) {
    const s = options.search.trim()
    query = query.or(`reference_number.ilike.%${s}%,reason.ilike.%${s}%,created_by_name.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as LedgerRowWithDetails[]
}
