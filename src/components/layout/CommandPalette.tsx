import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Boxes, LayoutDashboard, Package, ScrollText, Search, Truck, Warehouse } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { ALL_NAV_ITEMS } from './nav-config'
import { supabase } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/supabase/errors'

/** One row from the `global_search` RPC. */
type SearchHit = {
  kind: string
  id: string
  title: string
  subtitle: string
  href: string
  sort_weight: number
}

async function searchCatalog(query: string): Promise<SearchHit[]> {
  const { data, error } = await supabase.rpc('global_search', {
    p_query: query,
    p_limit: 8,
  })
  if (error) throw error
  return (data ?? []) as SearchHit[]
}

/** An icon per searchable entity, so results are scannable. */
const KIND_ICON: Record<string, typeof Package> = {
  product: Package,
  warehouse: Warehouse,
  receipt: Truck,
  ledger: ScrollText,
}

const QUICK_JUMP = ALL_NAV_ITEMS.filter((item) => item.icon !== undefined)

/**
 * Cmd/Ctrl+K search across the catalogue and the app's own pages.
 *
 * Page jumps are local and instant; entity hits come from the database and only
 * run once the user has typed enough to be worth a round-trip. Results are
 * scoped by Row Level Security, so a warehouse worker never sees another site's
 * stock here either.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const trimmed = query.trim()

  // Debounced so typing does not fire a request per keystroke.
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(trimmed), 250)
    return () => window.clearTimeout(timer)
  }, [trimmed])

  const results = useQuery({
    queryKey: ['global-search', debounced],
    queryFn: () => searchCatalog(debounced),
    enabled: debounced.length >= 2,
  })

  const go = (href: string) => {
    onClose()
    navigate(href)
  }

  const hits = results.data ?? []

  return (
    <CommandDialog open onOpenChange={(open) => !open && onClose()}>
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Search products, SKUs, warehouses, documents…"
      />
      <CommandList>
        {trimmed.length < 2 ? (
          <>
            <CommandEmpty>Keep typing to search.</CommandEmpty>
            <CommandGroup heading="Go to">
              {QUICK_JUMP.map((item) => (
                <CommandItem
                  key={item.to}
                  value={`go ${item.label} ${item.to}`}
                  onSelect={() => go(item.to)}
                >
                  <item.icon aria-hidden />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : (
          <>
            <CommandEmpty>
              {results.isLoading ? 'Searching…' : 'No matches.'}
            </CommandEmpty>

            {hits.length > 0 && (
              <CommandGroup heading="Results">
                {hits.map((hit) => {
                  const Icon = KIND_ICON[hit.kind] ?? Search
                  return (
                    <CommandItem
                      key={`${hit.kind}-${hit.id}`}
                      value={`${hit.kind} ${hit.id} ${hit.title}`}
                      onSelect={() => go(hit.href)}
                    >
                      <Icon aria-hidden />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{hit.title}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {hit.subtitle}
                        </span>
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            <CommandSeparator />

            <CommandGroup heading="Go to">
              {QUICK_JUMP.filter((item) =>
                item.label.toLowerCase().includes(trimmed.toLowerCase()),
              )
                .slice(0, 4)
                .map((item) => (
                  <CommandItem
                    key={item.to}
                    value={`go ${item.label} ${item.to}`}
                    onSelect={() => go(item.to)}
                  >
                    {item.to === '/' ? <LayoutDashboard aria-hidden /> : <Boxes aria-hidden />}
                    {item.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          </>
        )}

        {results.error && (
          <p className="px-3 py-2 text-xs text-destructive">
            {friendlyError(results.error, 'Search is unavailable right now.')}
          </p>
        )}
      </CommandList>
    </CommandDialog>
  )
}
