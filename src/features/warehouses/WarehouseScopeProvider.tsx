import { createContext, use, useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthProvider'
import { listAccessibleWarehouses, scopeIsRedundant, type Warehouse } from './services/warehouses'

const STORAGE_KEY = 'stocksense.warehouseScope'

type WarehouseScopeValue = {
  warehouses: Warehouse[]
  /** `null` means "every warehouse I can see". */
  selectedId: string | null
  selected: Warehouse | null
  setSelectedId: (id: string | null) => void
  isLoading: boolean
  error: string | null
  /** False when the user sees all warehouses and the selector adds nothing. */
  isScopeMeaningful: boolean
}

const WarehouseScopeContext = createContext<WarehouseScopeValue | null>(null)

/** Read the persisted scope, tolerating a stale id from another account. */
function readStoredScope(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredScope(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Private browsing modes reject writes. The scope just will not persist.
  }
}

/**
 * Holds the warehouse the user is currently looking at.
 *
 * This is presentation state, not security: Row Level Security decides what the
 * database will actually return. Scoping a view here keeps a manager from
 * mentally mixing figures from two sites, and it means every list view reads the
 * same selection instead of each keeping its own copy.
 */
export function WarehouseScopeProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  const [selectedId, setSelectedIdState] = useState<string | null>(readStoredScope)

  const query = useQuery({
    queryKey: ['warehouses'],
    queryFn: listAccessibleWarehouses,
    staleTime: 5 * 60_000,
  })

  const warehouses = useMemo(() => query.data ?? [], [query.data])

  /**
   * A stored id can outlive its usefulness - the warehouse may be archived, or
   * this user may have lost access. Rather than storing it and correcting it
   * with an effect, resolve the selection during render: the raw value stays in
   * state, and what the app actually uses is the nearest thing that exists.
   */
  const effectiveId = useMemo(() => {
    if (selectedId === null) return null
    if (warehouses.length === 0) return null
    return warehouses.some((warehouse) => warehouse.id === selectedId) ? selectedId : null
  }, [selectedId, warehouses])

  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdState(id)
    writeStoredScope(id)
  }, [])

  const grantedCount = profile?.warehouse_ids.length ?? 0

  const value = useMemo<WarehouseScopeValue>(
    () => ({
      warehouses,
      selectedId: effectiveId,
      selected: warehouses.find((warehouse) => warehouse.id === effectiveId) ?? null,
      setSelectedId,
      isLoading: query.isLoading,
      error: query.error instanceof Error ? query.error.message : null,
      isScopeMeaningful: !scopeIsRedundant(warehouses.length, grantedCount),
    }),
    [warehouses, effectiveId, setSelectedId, query.isLoading, query.error, grantedCount],
  )

  return <WarehouseScopeContext value={value}>{children}</WarehouseScopeContext>
}

export function useWarehouseScope(): WarehouseScopeValue {
  const context = use(WarehouseScopeContext)
  if (!context) throw new Error('useWarehouseScope must be used inside <WarehouseScopeProvider>.')
  return context
}
