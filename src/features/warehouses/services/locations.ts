import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type Location = Database['public']['Tables']['locations']['Row']
export type WarehouseWithDetails = Database['public']['Tables']['warehouses']['Row'] & {
  locations: Location[]
}

export async function fetchLocations(warehouseId?: string | null): Promise<Location[]> {
  let query = supabase
    .from('locations')
    .select('*')
    .eq('status', 'active')
    .order('name', { ascending: true })

  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchWarehouseWithLocations(warehouseId: string): Promise<WarehouseWithDetails | null> {
  const { data: warehouse, error: whError } = await supabase
    .from('warehouses')
    .select('*')
    .eq('id', warehouseId)
    .single()

  if (whError) throw whError

  const { data: locations, error: locError } = await supabase
    .from('locations')
    .select('*')
    .eq('warehouse_id', warehouseId)
    .order('name', { ascending: true })

  if (locError) throw locError

  return {
    ...warehouse,
    locations: locations ?? [],
  }
}
