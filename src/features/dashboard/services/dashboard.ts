import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type DashboardKPIs = Database['public']['Views']['v_dashboard_kpis']['Row']
export type DailyMovement = Database['public']['Views']['v_movements_daily']['Row']
export type StockByCategory = Database['public']['Views']['v_stock_by_category']['Row']
export type StockByWarehouse = Database['public']['Views']['v_stock_by_warehouse']['Row']
export type LowStockProduct = Database['public']['Views']['v_low_stock_products']['Row']
export type LedgerEntry = Database['public']['Tables']['stock_ledger']['Row']

export async function fetchDashboardKPIs(): Promise<DashboardKPIs> {
  const { data, error } = await supabase
    .from('v_dashboard_kpis')
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function fetchDailyMovements(limit = 14): Promise<DailyMovement[]> {
  const { data, error } = await supabase
    .from('v_movements_daily')
    .select('*')
    .order('day', { ascending: true })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function fetchStockByCategory(): Promise<StockByCategory[]> {
  const { data, error } = await supabase
    .from('v_stock_by_category')
    .select('*')
    .order('total_quantity', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchStockByWarehouse(): Promise<StockByWarehouse[]> {
  const { data, error } = await supabase
    .from('v_stock_by_warehouse')
    .select('*')
    .order('total_quantity', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function fetchLowStockAlerts(limit = 6): Promise<LowStockProduct[]> {
  const { data, error } = await supabase
    .from('v_low_stock_products')
    .select('*')
    .order('deficit', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

export async function fetchRecentLedger(limit = 8): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('stock_ledger')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}
