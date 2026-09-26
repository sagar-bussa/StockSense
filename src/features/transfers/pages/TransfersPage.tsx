import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ArrowRightLeft, Eye, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { fetchTransfers } from '../services/transfers'

const STATUS_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Waiting', value: 'waiting' },
  { label: 'Ready', value: 'ready' },
  { label: 'Done', value: 'done' },
  { label: 'Canceled', value: 'canceled' },
]

export function TransfersPage() {
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const transfersQuery = useQuery({
    queryKey: ['transfers', selectedStatus, searchTerm],
    queryFn: () =>
      fetchTransfers({
        status: selectedStatus,
        search: searchTerm,
      }),
  })

  const transfers = transfersQuery.data ?? []

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Internal transfers
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {transfers.length} orders
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Rebalance inventory between warehouses or move goods across racks and storage zones without altering company totals.
          </p>
        </div>

        <Link to="/operations/transfers/new">
          <Button size="sm" className="h-9 gap-1.5 text-xs font-semibold">
            <Plus className="size-3.5" />
            New Transfer
          </Button>
        </Link>
      </div>

      {/* Filter Tabs & Search Bar */}
      <Card className="border">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSelectedStatus(tab.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  selectedStatus === tab.value
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by transfer number (TRF-...) or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs sm:text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Transfers Table */}
      <Card className="border overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Transfer #</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Source Location</th>
                <th className="py-3 px-4 text-center">Movement</th>
                <th className="py-3 px-4">Destination Location</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transfersQuery.isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="py-3 px-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : transfers.length > 0 ? (
                transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                      <Link
                        to={`/operations/transfers/${transfer.id}`}
                        className="hover:underline hover:text-primary transition-colors"
                      >
                        {transfer.transfer_number}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-muted-foreground">
                      {transfer.reference || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-foreground">{transfer.source_warehouse?.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{transfer.source_location?.name}</div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex items-center justify-center p-1 rounded bg-muted text-muted-foreground">
                        <ArrowRight className="size-3.5 text-primary" />
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-foreground">{transfer.dest_warehouse?.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{transfer.dest_location?.name}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={transfer.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-muted-foreground font-mono text-[11px]">
                      {new Date(transfer.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link to={`/operations/transfers/${transfer.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                          <Eye className="size-3.5" /> Details
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <ArrowRightLeft className="size-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No transfer orders found</p>
                    <p className="text-xs mt-1 text-muted-foreground">Create a transfer to shift stock between warehouses or racks</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
