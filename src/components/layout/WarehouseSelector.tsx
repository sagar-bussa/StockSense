import { Check, ChevronsUpDown, MapPin } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWarehouseScope } from '@/features/warehouses/WarehouseScopeProvider'
import { cn } from '@/lib/utils'

/**
 * Switches which warehouse the current view is scoped to.
 *
 * Hidden entirely when the user already sees every warehouse, because offering
 * a filter that cannot change anything is worse than not offering it. The
 * selection is presentation only - RLS still decides what rows come back.
 */
export function WarehouseSelector() {
  const { warehouses, selectedId, selected, setSelectedId, isLoading, isScopeMeaningful } =
    useWarehouseScope()

  if (isLoading) {
    // Reserve the space so the topbar does not reflow once the list arrives.
    return <div className="hidden h-9 w-40 sm:block" aria-hidden />
  }

  if (!isScopeMeaningful || warehouses.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hidden h-9 max-w-[13rem] items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex"
          aria-label={`Warehouse: ${selected?.name ?? 'All warehouses'}. Change`}
        >
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">{selected?.name ?? 'All warehouses'}</span>
          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-[11px] tracking-wide text-muted-foreground uppercase">
          Warehouse
        </DropdownMenuLabel>

        <DropdownMenuItem onSelect={() => setSelectedId(null)}>
          <span className="flex flex-1 items-center gap-2">
            <Check
              className={cn('size-4 shrink-0', selectedId === null ? 'opacity-100' : 'opacity-0')}
              aria-hidden
            />
            All warehouses
          </span>
        </DropdownMenuItem>

        {warehouses.length > 1 && <DropdownMenuSeparator />}

        {warehouses.map((warehouse) => (
          <DropdownMenuItem
            key={warehouse.id}
            onSelect={() => setSelectedId(warehouse.id)}
            className="flex items-center gap-2"
          >
            <Check
              className={cn(
                'size-4 shrink-0',
                selectedId === warehouse.id ? 'opacity-100' : 'opacity-0',
              )}
              aria-hidden
            />
            <span className="truncate">{warehouse.name}</span>
            {warehouse.code && (
              <span className="ml-auto text-[11px] text-muted-foreground">{warehouse.code}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
