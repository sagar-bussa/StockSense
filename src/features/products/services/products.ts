import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type ProductStock = Database['public']['Views']['v_product_stock']['Row']
export type InventoryDetail = Database['public']['Views']['v_inventory_detail']['Row']
export type Category = Database['public']['Tables']['categories']['Row']
export type ProductRow = Database['public']['Tables']['products']['Row']

export async function fetchProducts(options?: {
  category?: string
  status?: string
  search?: string
}): Promise<ProductStock[]> {
  let query = supabase
    .from('v_product_stock')
    .select('*')
    .order('product_name', { ascending: true })

  if (options?.category && options.category !== 'all') {
    query = query.eq('category_id', options.category)
  }

  if (options?.status && options.status !== 'all') {
    if (options.status === 'active' || options.status === 'archived') {
      query = query.eq('product_status', options.status)
    } else {
      query = query.eq('stock_status', options.status)
    }
  }

  if (options?.search) {
    const s = options.search.trim()
    query = query.or(`sku.ilike.%${s}%,product_name.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function fetchProductById(productId: string): Promise<ProductStock | null> {
  const { data, error } = await supabase
    .from('v_product_stock')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function fetchProductInventoryLocations(productId: string): Promise<InventoryDetail[]> {
  const { data, error } = await supabase
    .from('v_inventory_detail')
    .select('*')
    .eq('product_id', productId)
    .order('warehouse_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('status', 'active')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createProductRPC(params: {
  name: string
  sku: string
  categoryId: string | null
  unitOfMeasure: string
  reorderLevel: number
  initialStock: number
  description: string | null
  locationId: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_product', {
    p_name: params.name,
    p_sku: params.sku,
    p_category_id: params.categoryId ?? undefined,
    p_unit_of_measure: params.unitOfMeasure as Database['public']['Enums']['unit_of_measure'],
    p_reorder_level: params.reorderLevel,
    p_initial_stock: params.initialStock,
    p_description: params.description ?? undefined,
    p_initial_location_id: params.locationId ?? undefined,
  })

  if (error) throw error
  return data as string
}

export async function updateProduct(
  productId: string,
  params: {
    name?: string
    sku?: string
    categoryId?: string | null
    unitOfMeasure?: string
    reorderLevel?: number
    description?: string | null
    status?: 'active' | 'archived'
  },
): Promise<void> {
  const updateData: Partial<Database['public']['Tables']['products']['Update']> = {}
  if (params.name !== undefined) updateData.name = params.name
  if (params.sku !== undefined) updateData.sku = params.sku
  if (params.categoryId !== undefined) updateData.category_id = params.categoryId
  if (params.unitOfMeasure !== undefined) {
    updateData.unit_of_measure = params.unitOfMeasure as Database['public']['Enums']['unit_of_measure']
  }
  if (params.reorderLevel !== undefined) updateData.reorder_level = params.reorderLevel
  if (params.description !== undefined) updateData.description = params.description
  if (params.status !== undefined) updateData.status = params.status

  const { error } = await supabase
    .from('products')
    .update(updateData)
    .eq('id', productId)

  if (error) throw error
}
