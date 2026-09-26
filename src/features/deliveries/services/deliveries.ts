import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type Delivery = Database['public']['Tables']['deliveries']['Row']
export type DeliveryItem = Database['public']['Tables']['delivery_items']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']

export type DeliveryWithDetails = Delivery & {
  customers: Customer | null
  warehouses: { name: string; code: string } | null
  locations: { name: string; code: string } | null
  profiles_created: { full_name: string | null; email: string } | null
  profiles_validated: { full_name: string | null; email: string } | null
}

export type DeliveryItemWithProduct = DeliveryItem & {
  products: { name: string; sku: string; unit_of_measure: string } | null
}

export type DeliveryAvailabilityItem = {
  product_id: string
  product_name: string
  sku: string
  requested: number
  available: number
  is_sufficient: boolean
}

export async function fetchDeliveries(options?: {
  status?: string
  warehouseId?: string | null
  search?: string
}): Promise<DeliveryWithDetails[]> {
  let query = supabase
    .from('deliveries')
    .select(
      `
      *,
      customers (*),
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
    query = query.or(`delivery_number.ilike.%${s}%,reference.ilike.%${s}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as DeliveryWithDetails[]
}

export async function fetchDeliveryById(deliveryId: string): Promise<{
  delivery: DeliveryWithDetails
  items: DeliveryItemWithProduct[]
}> {
  const { data: deliveryData, error: deliveryError } = await supabase
    .from('deliveries')
    .select(
      `
      *,
      customers (*),
      warehouses (name, code),
      locations (name, code),
      profiles_created:created_by (full_name, email),
      profiles_validated:validated_by (full_name, email)
    `,
    )
    .eq('id', deliveryId)
    .single()

  if (deliveryError) throw deliveryError

  const { data: itemsData, error: itemsError } = await supabase
    .from('delivery_items')
    .select(
      `
      *,
      products (name, sku, unit_of_measure)
    `,
    )
    .eq('delivery_id', deliveryId)

  if (itemsError) throw itemsError

  return {
    delivery: deliveryData as unknown as DeliveryWithDetails,
    items: (itemsData ?? []) as unknown as DeliveryItemWithProduct[],
  }
}

export async function checkDeliveryAvailabilityRPC(deliveryId: string): Promise<DeliveryAvailabilityItem[]> {
  const { data, error } = await supabase.rpc('check_delivery_availability', {
    p_delivery_id: deliveryId,
  })

  if (error) throw error
  return (data ?? []) as DeliveryAvailabilityItem[]
}

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createDeliveryRPC(params: {
  customerId: string
  warehouseId: string
  locationId: string
  reference?: string | null
  expectedAt?: string | null
  notes?: string | null
  items: Array<{ productId: string; quantity: number; unitPrice?: number }>
}): Promise<string> {
  const formattedItems = params.items.map((i) => ({
    product_id: i.productId,
    quantity: i.quantity,
    unit_price: i.unitPrice ?? 0,
  }))

  const { data, error } = await supabase.rpc('create_delivery', {
    p_customer_id: params.customerId,
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

export async function validateDeliveryRPC(deliveryId: string): Promise<void> {
  const { error } = await supabase.rpc('validate_delivery', {
    p_delivery_id: deliveryId,
  })

  if (error) throw error
}

export async function cancelDeliveryRPC(deliveryId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_document', {
    p_reference_type: 'delivery',
    p_document_id: deliveryId,
    p_reason: reason,
  })

  if (error) throw error
}
