import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Sliders } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fetchAdjustments } from '../services/adjustments'

const REASONS = [
  { label: 'All Reasons', value: 'all' },
  { label: 'Miscount', value: 'miscount' },
  { label: 'Damaged', value: 'damaged' },
  { label: 'Lost / Stolen', value: 'lost' },
  { label: 'Expired', value: 'expired' },
  { label: 'Found Stock', value: 'found' },
  { label: 'Other', value: 'other' },
]

export function AdjustmentsPage() {
  const [selectedReason, setSelectedReason] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const adjustmentsQuery = useQuery({
    queryKey: ['adjustments', selectedReason, searchTerm],
    queryFn: () =>
      fetchAdjustments({
        reason: selectedReason,
        search: searchTerm,
      }),
  })

  const adjustments = adjustmentsQuery.data ?? []

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Stock adjustments
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {adjustments.length} recorded
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Audit inventory variances between recorded system stock and physical cycle counts with mandatory rationale.
          </p>
        </div>

        <Link to="/operations/adjustments/new">
          <Button size="sm" className="h-9 gap-1.5 text-xs font-semibold">
            <Plus className="size-3.5" />
            New Adjustment
          </Button>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search adjustment # (ADJ-...) or explanation notes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs sm:text-sm"
              />
            </div>

            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger className="w-[180px] h-9 text-xs">
                <SelectValue placeholder="Reason Filter" />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(searchTerm || selectedReason !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchTerm('')
                  setSelectedReason('all')
                }}
                className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Adjustments Table */}
      <Card className="border overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Adjustment #</th>
                <th className="py-3 px-4">Product / SKU</th>
                <th className="py-3 px-4">Warehouse & Zone</th>
                <th className="py-3 px-4 text-right">System Qty</th>
                <th className="py-3 px-4 text-right">Physical Count</th>
                <th className="py-3 px-4 text-right">Variance</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Auditor & Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {adjustmentsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="py-3 px-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : adjustments.length > 0 ? (
                adjustments.map((adj) => {
                  const diff = Number(adj.difference ?? 0)
                  const isPositive = diff > 0
                  const isNegative = diff < 0
                  return (
                    <tr key={adj.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-foreground">
                        {adj.adjustment_number}
                      </td>
                      <td className="py-3.5 px-4">
                        <Link
                          to={`/products/${adj.product_id}`}
                          className="font-semibold text-foreground hover:underline"
                        >
                          {adj.products?.name}
                        </Link>
                        <span className="text-[11px] text-muted-foreground block font-mono">
                          {adj.products?.sku}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground">
                        <span className="font-semibold text-foreground">{adj.warehouses?.name}</span>
                        <span className="text-[11px] block font-mono">Zone: {adj.locations?.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular text-muted-foreground">
                        {adj.system_quantity} {adj.products?.unit_of_measure}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground tabular">
                        {adj.counted_quantity} {adj.products?.unit_of_measure}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold tabular">
                        <span
                          className={
                            isPositive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isNegative
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-muted-foreground'
                          }
                        >
                          {isPositive ? `+${diff}` : diff}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-semibold uppercase ${
                            adj.reason === 'damaged'
                              ? 'bg-rose-500/10 text-rose-600'
                              : adj.reason === 'found'
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : adj.reason === 'lost'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {adj.reason}
                        </Badge>
                        {adj.notes && (
                          <p className="text-[11px] text-muted-foreground truncate max-w-xs mt-0.5">
                            {adj.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-muted-foreground text-[11px]">
                        <span className="font-medium text-foreground block">
                          {adj.profiles_created?.full_name || adj.profiles_created?.email || 'Staff'}
                        </span>
                        <span className="font-mono">{new Date(adj.created_at).toLocaleDateString()}</span>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Sliders className="size-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No stock adjustments recorded</p>
                    <p className="text-xs mt-1 text-muted-foreground">Log physical cycle counts to resolve stock discrepancies</p>
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
