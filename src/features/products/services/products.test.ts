import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseMock } from '@/test/supabase-mock'

const mock = createSupabaseMock()
vi.mock('@/lib/supabase/client', () => ({ supabase: mock }))

// Import after mocking
const { fetchProducts } = await import('./products')

describe('fetchProducts', () => {
  beforeEach(() => {
    mock.reset()
  })

  it('filters by product_status when status is active or archived', async () => {
    const fromSpy = vi.spyOn(mock, 'from')
    mock.setRows('v_product_stock', [
      { product_id: 'p-1', product_name: 'Test Product', product_status: 'active', sku: 'SKU-1' },
    ])

    const result = await fetchProducts({ status: 'active' })
    expect(result).toHaveLength(1)
    expect(fromSpy).toHaveBeenCalledWith('v_product_stock')
  })

  it('handles general product fetching without status filter', async () => {
    mock.setRows('v_product_stock', [
      { product_id: 'p-1', product_name: 'Item A', product_status: 'active', sku: 'A1' },
      { product_id: 'p-2', product_name: 'Item B', product_status: 'archived', sku: 'B1' },
    ])

    const result = await fetchProducts()
    expect(result).toHaveLength(2)
  })
})
