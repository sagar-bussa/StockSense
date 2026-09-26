import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type Warehouse = Database['public']['Tables']['warehouses']['Row']

/**
 * Warehouses the signed-in user may read.
 *
 * RLS already filters this query, so the result is authoritative - there is no
 * need to intersect it with the profile's warehouse grants in the client. That
 * matters because a `warehouse_staff` user is granted access through
 * `user_warehouses` and a manager through their role, and the policy is what
 * knows the difference.
 */
export async function listAccessibleWarehouses(): Promise<Warehouse[]> {
  const { data, error } = await supabase
    .from('warehouses')
    .select('*')
    .eq('status', 'active')
    .order('name')

  if (error) throw error
  return data
}

/**
 * True when a warehouse scope selector would be pointless: either the user can
 * already see every warehouse, or they cannot see any.
 */
export function scopeIsRedundant(accessibleCount: number, grantedCount: number): boolean {
  return grantedCount === 0 || grantedCount >= accessibleCount
}
