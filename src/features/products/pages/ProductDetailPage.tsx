import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Copy,
  Layers,
  Pencil,
  ScrollText,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { fetchProductById, fetchProductInventoryLocations } from '../services/products'
import { fetchStockLedger } from '@/features/ledger/services/ledger'
import { toast } from 'sonner'

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => (productId ? fetchProductById(productId) : null),
    enabled: !!productId,
  })

  const locationsQuery = useQuery({
    queryKey: ['product-locations', productId],
    queryFn: () => (productId ? fetchProductInventoryLocations(productId) : []),
    enabled: !!productId,
  })

  const historyQuery = useQuery({
    queryKey: ['product-ledger', productId],
    queryFn: () => (productId ? fetchStockLedger({ productId, limit: 10 }) : []),
    enabled: !!productId,
  })

  const product = productQuery.data
  const locations = locationsQuery.data ?? []
  const history = historyQuery.data ?? []

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text)
    toast.success('SKU copied to clipboard')
  }

  if (productQuery.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold">Product detail</h1>
        <p className="mt-2 text-sm text-muted-foreground">Product not found or has been removed.</p>
        <Link to="/products" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            Back to Products
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/products">
            <Button variant="outline" size="icon" className="size-8" title="Back to products">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Product detail
              </h1>
              <StatusBadge status={product.stock_status ?? 'in_stock'} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Overview of stock allocation, reorder point, and location balances.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to={`/ledger?product=${product.product_id}`}>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-medium">
              <ScrollText className="size-3.5" />
              View in Stock Ledger
            </Button>
          </Link>
          <Link to={`/products/${product.product_id}/edit`}>
            <Button size="sm" className="h-8 gap-1.5 text-xs font-medium">
              <Pencil className="size-3.5" />
              Edit Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Info Card */}
      <Card className="border">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold bg-muted px-2 py-0.5 rounded border">
                  {product.sku}
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(product.sku ?? '')}
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy SKU"
                >
                  <Copy className="size-3.5" />
                </button>
                {product.category_name && (
                  <Badge variant="secondary" className="text-xs">
                    {product.category_name}
                  </Badge>
                )}
              </div>
              <h2 className="mt-2 text-xl font-bold text-foreground">{product.product_name}</h2>
              {product.description && (
                <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{product.description}</p>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
              <div className="rounded-lg border bg-muted/30 p-3 text-center min-w-[100px]">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                  Total On Hand
                </span>
                <span className="text-lg font-bold font-mono tabular mt-1 block">
                  {product.total_quantity} {product.unit_of_measure}
                </span>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-center min-w-[100px]">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                  Reorder Level
                </span>
                <span className="text-lg font-bold font-mono tabular mt-1 block text-muted-foreground">
                  {product.reorder_level} {product.unit_of_measure}
                </span>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-center min-w-[100px] col-span-2 sm:col-span-1">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block">
                  Location Count
                </span>
                <span className="text-lg font-bold font-mono tabular mt-1 block">
                  {product.location_count ?? 0} sites
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stock by Warehouse & Location */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Warehouse className="size-4 text-primary" />
            Stock Availability by Location
          </CardTitle>
          <CardDescription className="text-xs">
            Physical quantity distribution across warehouse racks and storage areas
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Warehouse</th>
                  <th className="py-2.5 px-4">Location Name</th>
                  <th className="py-2.5 px-4">Location Code</th>
                  <th className="py-2.5 px-4">Kind</th>
                  <th className="py-2.5 px-4 text-right">Quantity</th>
                  <th className="py-2.5 px-4 text-right">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {locations.length > 0 ? (
                  locations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-medium">{loc.warehouse_name}</td>
                      <td className="py-3 px-4">{loc.location_name}</td>
                      <td className="py-3 px-4 font-mono font-medium">{loc.location_code}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {loc.location_kind}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm tabular">
                        {loc.quantity} {loc.unit_of_measure}
                      </td>
                      <td className="py-3 px-4 text-right text-muted-foreground font-mono text-[11px]">
                        {loc.updated_at ? new Date(loc.updated_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted-foreground">
                      No stock allocated to any location yet. Receive stock or perform a transfer.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Movement Activity Timeline */}
      <Card className="border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              Stock Movement History
            </CardTitle>
            <CardDescription className="text-xs">
              Chronological log of receipts, deliveries, and adjustments for this SKU
            </CardDescription>
          </div>
          <Link to={`/ledger?product=${product.product_id}`}>
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              View all in ledger →
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {history.length > 0 ? (
              history.map((entry) => {
                const isPositive = Number(entry.quantity_change) > 0
                return (
                  <div key={entry.id} className="flex items-center justify-between p-3.5 px-4 sm:px-6">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            entry.transaction_type === 'receipt'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : entry.transaction_type === 'delivery'
                                ? 'bg-indigo-500/10 text-indigo-600'
                                : entry.transaction_type === 'adjustment'
                                  ? 'bg-amber-500/10 text-amber-600'
                                  : 'bg-violet-500/10 text-violet-600'
                          }`}
                        >
                          {entry.transaction_type.replace('_', ' ')}
                        </span>
                        <span className="font-mono text-xs font-semibold">{entry.reference_number || 'Direct'}</span>
                        {entry.reason && (
                          <span className="text-xs text-muted-foreground">• {entry.reason}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        By {entry.created_by_name || 'System'} • {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="text-right">
                      <div
                        className={`font-mono font-bold text-sm tabular ${
                          isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isPositive ? `+${entry.quantity_change}` : entry.quantity_change}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Running Bal: {entry.running_balance}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="p-8 text-center text-xs text-muted-foreground">
                No transactions recorded yet for this product.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
