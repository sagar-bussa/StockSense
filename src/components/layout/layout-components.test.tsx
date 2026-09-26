import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { Profile } from '@/features/auth/types'
import { NotificationBell } from './NotificationBell'
import { WarehouseSelector } from './WarehouseSelector'
import { WarehouseScopeProvider } from '@/features/warehouses/WarehouseScopeProvider'

/**
 * `vi.mock` is hoisted above the imports, so the factory cannot close over a
 * top-level variable - it would run before initialisation. `vi.hoisted` gives
 * the mock a home that is created first.
 */
const { supabase } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import('../../test/supabase-mock')
  return { supabase: createSupabaseMock() }
})

vi.mock('@/lib/supabase/client', () => ({ supabase }))

const adminProfile: Profile = {
  id: 'user-1',
  full_name: 'Ada Admin',
  email: 'admin@stocksense.app',
  role: 'admin',
  avatar_url: null,
  phone: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  // An admin is granted every warehouse by role, so warehouse_ids is empty.
  warehouse_ids: [],
}

/**
 * The mock reads this at call time rather than capturing it, so a test can
 * change the signed-in user without re-importing the component under test.
 */
let currentProfile: Profile = adminProfile

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { id: currentProfile.id },
    profile: currentProfile,
    isLoading: false,
    profileError: null,
  }),
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <WarehouseScopeProvider>{children}</WarehouseScopeProvider>
      </QueryClientProvider>
    </MemoryRouter>
  )
}

const warehouse = (id: string, name: string, code: string) => ({
  id,
  name,
  code,
  address: null,
  city: null,
  country: null,
  phone: null,
  email: null,
  manager_id: null,
  notes: null,
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
})

const notification = (overrides: Record<string, unknown> = {}) => ({
  id: 'n-1',
  user_id: 'user-1',
  type: 'low_stock',
  severity: 'warning',
  title: 'Bearing low',
  message: 'MT-BEARING-8 is below its reorder level.',
  product_id: null,
  warehouse_id: null,
  reference_type: null,
  reference_id: null,
  link: '/products',
  dedupe_key: null,
  is_read: false,
  read_at: null,
  created_at: new Date().toISOString(),
  ...overrides,
})

beforeEach(() => {
  currentProfile = adminProfile
  supabase.setRows('warehouses', [])
  supabase.setRows('notifications', [])
  supabase.setRpc('unread_notification_count', 0)
  vi.clearAllMocks()
})

describe('NotificationBell', () => {
  it('shows no badge when there is nothing unread', async () => {
    render(<NotificationBell />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/notifications, none unread/i)).toBeInTheDocument()
    })
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('badges the unread count returned by the database', async () => {
    supabase.setRpc('unread_notification_count', 7)
    render(<NotificationBell />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByLabelText(/notifications, 7 unread/i)).toBeInTheDocument()
    })
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('caps a very large count so the badge cannot stretch the topbar', async () => {
    supabase.setRpc('unread_notification_count', 250)
    render(<NotificationBell />, { wrapper: Wrapper })

    await waitFor(() => expect(screen.getByText('99+')).toBeInTheDocument())
  })

  it('marks a notification read through the RPC, never a table write', async () => {
    const user = userEvent.setup()
    supabase.setRpc('unread_notification_count', 1)
    supabase.setRows('notifications', [notification()])

    render(<NotificationBell />, { wrapper: Wrapper })

    await user.click(await screen.findByLabelText(/notifications, 1 unread/i))
    await user.click(await screen.findByText('Bearing low'))

    await waitFor(() => {
      expect(supabase.rpcCalls('mark_notification_read')).toEqual([{ p_notification_id: 'n-1' }])
    })
    // The RLS model mutates notifications only through a definer function, so
    // a direct table write here would fail in production. Listing is still a
    // plain select, so assert on the mutation, not on the table.
    for (const result of supabase.from.mock.results) {
      const builder = result.value as { update: ReturnType<typeof vi.fn> }
      expect(builder.update).not.toHaveBeenCalled()
    }
  })

  it('offers no "mark all read" when everything is already read', async () => {
    const user = userEvent.setup()
    render(<NotificationBell />, { wrapper: Wrapper })

    await user.click(await screen.findByLabelText(/notifications, none unread/i))
    expect(screen.queryByText(/mark all read/i)).not.toBeInTheDocument()
  })

  it('subscribes to realtime filtered to this user', async () => {
    render(<NotificationBell />, { wrapper: Wrapper })

    await waitFor(() => expect(supabase.channel).toHaveBeenCalledWith('notifications:user-1'))

    const builder = supabase.channel.mock.results[0]?.value as {
      on: ReturnType<typeof vi.fn>
    }
    const [, config] = builder.on.mock.calls[0] as unknown as [string, { filter: string }]
    expect(config.filter).toBe('user_id=eq.user-1')
  })
})

describe('WarehouseSelector', () => {
  it('is hidden for a user who can already see every warehouse', async () => {
    supabase.setRows('warehouses', [warehouse('w1', 'Manchester', 'MCR')])

    render(<WarehouseSelector />, { wrapper: Wrapper })

    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('warehouses'))
    expect(screen.queryByRole('button', { name: /warehouse:/i })).not.toBeInTheDocument()
  })

  it('is hidden while the warehouse list is still loading, to avoid a reflow', () => {
    supabase.setRows('warehouses', [])
    const { container } = render(<WarehouseSelector />, { wrapper: Wrapper })
    // A placeholder keeps the topbar from shifting once the list arrives.
    expect(container.querySelector('.w-40')).not.toBeNull()
  })

  it('defaults to "All warehouses" for a user scoped to one of two sites', async () => {
    // The seeded staff account sees Manchester only, while the organisation runs
    // two warehouses, so the scope selector is meaningful and starts unfiltered.
    currentProfile = { ...adminProfile, role: 'warehouse_staff', warehouse_ids: ['w1'] }
    supabase.setRows('warehouses', [
      warehouse('w1', 'Manchester', 'MCR'),
      warehouse('w2', 'Leeds', 'LDS'),
    ])

    render(<WarehouseSelector />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all warehouses/i })).toBeInTheDocument()
    })
  })

  it('is hidden when the only warehouse the user can see is the one they are scoped to', async () => {
    // A filter over a single row cannot change the answer, so it is noise.
    currentProfile = { ...adminProfile, role: 'warehouse_staff', warehouse_ids: ['w1'] }
    supabase.setRows('warehouses', [warehouse('w1', 'Manchester', 'MCR')])

    const { container } = render(<WarehouseSelector />, { wrapper: Wrapper })

    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('warehouses'))
    expect(container.querySelector('button[aria-label^="Warehouse:"]')).toBeNull()
  })

  it('only ever requests active warehouses', async () => {
    currentProfile = { ...adminProfile, role: 'warehouse_staff', warehouse_ids: ['w1'] }
    supabase.setRows('warehouses', [warehouse('w1', 'Manchester', 'MCR')])

    render(<WarehouseSelector />, { wrapper: Wrapper })

    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('warehouses'))
    const builder = supabase.from.mock.results[0]?.value as Record<string, ReturnType<typeof vi.fn>>
    expect(builder.eq).toHaveBeenCalledWith('status', 'active')
  })
})
