import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type Adjustment = Database['public']['Tables']['adjustments']['Row']
export type AdjustmentReason = Database['public']['Enums']['adjustment_reason']

export type AdjustmentWithDetails = Adjustment & {
  products: { name: string; sku: string; unit_of_measure: string } | null
  warehouses: { name: string; code: string } | null
  locations: { name: string; code: string } | null
  profiles_created: { full_name: string | null; email: string } | null
}

export async function fetchAdjustments(options?: {
  reason?: string
  warehouseId?: string | null
  search?: string
}): Promise<AdjustmentWithDetails[]> {
  let query = supabase
    .from('adjustments')
    .select(
      `
      *,
      products (name, sku, unit_of_measure),
      warehouses (name, code),
      locations (name, code),
      profiles_created:created_by (full_name, email)
    `,
    )
    .order('created_at', { ascending: false })

  if (options?.reason && options.reason !== 'all') {
    query = query.eq('reason', options.reason as AdjustmentReason)
  }

  if (options?.warehouseId) {
    query = query.eq('warehouse_id', options.warehouseId)
  }

  if (options?.search) {
    const s = options.search.trim()
    query = query.or(`adjustment_number.ilike.%${s}%,notes.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as AdjustmentWithDetails[]
}

export async function getLocationStock(productId: string, locationId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_location_stock', {
    p_product_id: productId,
    p_location_id: locationId,
  })

  if (error) throw error
  return Number(data ?? 0)
}

export async function postAdjustmentRPC(params: {
  productId: string
  locationId: string
  countedQuantity: number
  reason: AdjustmentReason
  notes?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('post_adjustment', {
    p_product_id: params.productId,
    p_location_id: params.locationId,
    p_counted_quantity: params.countedQuantity,
    p_reason: params.reason,
    p_notes: params.notes || undefined,
  })

  if (error) throw error
  return data as string
}
