import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Download,
  ScrollText,
  Search,
  Sliders,
} from 'lucide-react'
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
import { fetchStockLedger } from '../services/ledger'
import { fetchProducts } from '@/features/products/services/products'
import { toast } from 'sonner'

const TXN_TYPES = [
  { label: 'All Operations', value: 'all' },
  { label: 'Receipts', value: 'receipt' },
  { label: 'Deliveries', value: 'delivery' },
  { label: 'Transfer Out', value: 'transfer_out' },
  { label: 'Transfer In', value: 'transfer_in' },
  { label: 'Adjustments', value: 'adjustment' },
]

export function LedgerPage() {
  const [searchParams] = useSearchParams()
  const initialProduct = searchParams.get('product') || 'all'

  const [selectedType, setSelectedType] = useState('all')
  const [selectedProduct, setSelectedProduct] = useState(initialProduct)
  const [searchTerm, setSearchTerm] = useState('')

  const ledgerQuery = useQuery({
    queryKey: ['ledger-full', selectedType, selectedProduct, searchTerm],
    queryFn: () =>
      fetchStockLedger({
        type: selectedType,
        productId: selectedProduct !== 'all' ? selectedProduct : undefined,
        search: searchTerm,
        limit: 150,
      }),
  })

  const productsQuery = useQuery({
    queryKey: ['products-ledger-filter'],
    queryFn: () => fetchProducts(),
  })

  const entries = ledgerQuery.data ?? []

  const exportCSV = () => {
    if (!entries.length) return
    const headers = [
      'Date',
      'Transaction Type',
      'Reference',
      'Product',
      'SKU',
      'Quantity Change',
      'Previous Qty',
      'New Qty',
      'Balance',
      'Warehouse',
      'Location',
      'Auditor',
      'Reason',
    ]
    const rows = entries.map((e) => [
      `"${new Date(e.created_at).toISOString()}"`,
      e.transaction_type,
      `"${(e.reference_number || '').replace(/"/g, '""')}"`,
      `"${(e.products?.name || '').replace(/"/g, '""')}"`,
      e.products?.sku || '',
      e.quantity_change,
      e.previous_quantity,
      e.new_quantity,
      e.running_balance,
      `"${(e.warehouses?.name || '').replace(/"/g, '""')}"`,
      `"${(e.locations?.name || '').replace(/"/g, '""')}"`,
      `"${(e.created_by_name || '').replace(/"/g, '""')}"`,
      `"${(e.reason || '').replace(/"/g, '""')}"`,
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `stocksense-ledger-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Stock ledger exported to CSV')
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Stock ledger
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {entries.length} transactions
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Immutable, audit-ready movement register tracking every unit intake, dispatch, transfer, and variance.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={exportCSV}
          disabled={!entries.length}
          className="h-9 gap-1.5 text-xs font-medium"
        >
          <Download className="size-3.5" />
          Export Ledger
        </Button>
      </div>

      {/* Filter and Search Card */}
      <Card className="border">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search reference # (PO/SO/TRF/ADJ), user or reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs sm:text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[150px] h-9 text-xs">
                  <SelectValue placeholder="Operation Type" />
                </SelectTrigger>
                <SelectContent>
                  {TXN_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="w-[180px] h-9 text-xs">
                  <SelectValue placeholder="Filter by Product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {productsQuery.data?.map((p) => (
                    <SelectItem key={p.product_id ?? ''} value={p.product_id ?? ''}>
                      {p.product_name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(searchTerm || selectedType !== 'all' || selectedProduct !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('')
                    setSelectedType('all')
                    setSelectedProduct('all')
                  }}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Immutable Ledger Table */}
      <Card className="border overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Operation</th>
                <th className="py-3 px-4">Document Ref</th>
                <th className="py-3 px-4">Product / SKU</th>
                <th className="py-3 px-4 text-right">Qty Change</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">User / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledgerQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="py-3 px-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : entries.length > 0 ? (
                entries.map((entry) => {
                  const change = Number(entry.quantity_change)
                  const isPositive = change > 0

                  return (
                    <tr key={entry.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 text-muted-foreground font-mono text-[11px] whitespace-nowrap">
                        <div>{new Date(entry.created_at).toLocaleDateString()}</div>
                        <div className="text-[10px] text-muted-foreground/70">
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            entry.transaction_type === 'receipt'
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : entry.transaction_type === 'delivery'
                                ? 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'
                                : entry.transaction_type === 'adjustment'
                                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                  : 'bg-violet-500/10 text-violet-600 border border-violet-500/20'
                          }`}
                        >
                          {entry.transaction_type === 'receipt' && <ArrowDownLeft className="size-2.5" />}
                          {entry.transaction_type === 'delivery' && <ArrowUpRight className="size-2.5" />}
                          {entry.transaction_type.startsWith('transfer') && <ArrowRightLeft className="size-2.5" />}
                          {entry.transaction_type === 'adjustment' && <Sliders className="size-2.5" />}
                          {entry.transaction_type.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono font-medium text-foreground">
                        {entry.reference_number || 'Direct'}
                      </td>

                      <td className="py-3 px-4">
                        <Link
                          to={`/products/${entry.product_id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {entry.products?.name}
                        </Link>
                        <span className="text-[11px] text-muted-foreground block font-mono">
                          {entry.products?.sku}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-sm tabular">
                        <span
                          className={
                            isPositive
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {isPositive ? `+${change}` : change} {entry.products?.unit_of_measure}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-muted-foreground tabular">
                        <span className="text-foreground font-semibold">{entry.running_balance}</span>
                        <span className="text-[10px] block text-muted-foreground">prev: {entry.previous_quantity}</span>
                      </td>

                      <td className="py-3 px-4 text-muted-foreground">
                        <span className="font-semibold text-foreground block">{entry.warehouses?.name}</span>
                        <span className="text-[11px] font-mono">
                          {entry.locations?.name || entry.dest_location?.name || entry.source_location?.name || '—'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-muted-foreground text-xs">
                        <span className="font-semibold text-foreground block">
                          {entry.created_by_name || 'System Actor'}
                        </span>
                        {entry.reason && (
                          <span className="text-[11px] text-muted-foreground/90 block truncate max-w-xs">
                            {entry.reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <ScrollText className="size-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No ledger records found matching query</p>
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
