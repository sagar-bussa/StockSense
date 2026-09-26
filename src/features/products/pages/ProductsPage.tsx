import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Package,
  Pencil,
  Plus,
  Search,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import { fetchProducts, fetchCategories } from '../services/products'
import { toast } from 'sonner'

export function ProductsPage() {
  const [searchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') || 'all'

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>(initialFilter)

  const productsQuery = useQuery({
    queryKey: ['products', selectedCategory, selectedStatus, searchTerm],
    queryFn: () =>
      fetchProducts({
        category: selectedCategory,
        status: selectedStatus,
        search: searchTerm,
      }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data])

  // Quick stats
  const stats = useMemo(() => {
    const list = productsQuery.data ?? []
    const total = list.length
    const low = list.filter((p) => p.stock_status === 'low_stock').length
    const out = list.filter((p) => p.stock_status === 'out_of_stock').length
    const healthy = list.filter((p) => p.stock_status === 'in_stock').length
    return { total, low, out, healthy }
  }, [productsQuery.data])

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  const exportCSV = () => {
    if (!products.length) return
    const headers = ['SKU', 'Name', 'Category', 'Unit', 'Total Stock', 'Reorder Level', 'Status']
    const rows = products.map((p) => [
      p.sku,
      `"${(p.product_name ?? '').replace(/"/g, '""')}"`,
      `"${(p.category_name || '').replace(/"/g, '""')}"`,
      p.unit_of_measure,
      p.total_quantity,
      p.reorder_level,
      p.stock_status,
    ])
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `stocksense-products-${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Products exported to CSV')
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Products
            </h1>
            <Badge variant="outline" className="border-muted text-muted-foreground font-mono">
              {products.length} items
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete inventory catalog with SKU tracking, reorder thresholds, and multi-location availability.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="h-9 gap-1.5 text-xs font-medium"
            disabled={!products.length}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>

          <Link to="/products/new">
            <Button size="sm" className="h-9 gap-1.5 text-xs font-medium">
              <Plus className="size-3.5" />
              Add Product
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Status Metric Pills */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => setSelectedStatus('all')}
          className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
            selectedStatus === 'all'
              ? 'bg-primary/5 border-primary shadow-xs'
              : 'bg-card border-border hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            <span className="text-xs font-medium">All Products</span>
          </div>
          <span className="font-mono text-sm font-bold">{stats.total}</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('in_stock')}
          className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
            selectedStatus === 'in_stock'
              ? 'bg-emerald-500/10 border-emerald-500 shadow-xs'
              : 'bg-card border-border hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span className="text-xs font-medium">In Stock</span>
          </div>
          <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
            {stats.healthy}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('low_stock')}
          className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
            selectedStatus === 'low_stock'
              ? 'bg-amber-500/10 border-amber-500 shadow-xs'
              : 'bg-card border-border hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <span className="text-xs font-medium">Low Stock</span>
          </div>
          <span className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400">
            {stats.low}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedStatus('out_of_stock')}
          className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
            selectedStatus === 'out_of_stock'
              ? 'bg-rose-500/10 border-rose-500 shadow-xs'
              : 'bg-card border-border hover:bg-muted/40'
          }`}
        >
          <div className="flex items-center gap-2">
            <XCircle className="size-4 text-rose-500" />
            <span className="text-xs font-medium">Out of Stock</span>
          </div>
          <span className="font-mono text-sm font-bold text-rose-600 dark:text-rose-400">
            {stats.out}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search products by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs sm:text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoriesQuery.data?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[140px] h-9 text-xs">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                </SelectContent>
              </Select>

              {(searchTerm || selectedCategory !== 'all' || selectedStatus !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('')
                    setSelectedCategory('all')
                    setSelectedStatus('all')
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

      {/* Products Table */}
      <Card className="border overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">SKU / Code</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-right">On Hand</th>
                <th className="py-3 px-4 text-right">Reorder Level</th>
                <th className="py-3 px-4">Stock Status</th>
                <th className="py-3 px-4 text-center">Locations</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {productsQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="py-3 px-4">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : products.length > 0 ? (
                products.map((product) => (
                  <tr key={product.product_id} className="hover:bg-muted/40 transition-colors group">
                    <td className="py-3.5 px-4 font-mono font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{product.sku}</span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(product.sku ?? '', 'SKU')}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-opacity"
                          title="Copy SKU"
                        >
                          <Copy className="size-3" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-foreground">
                      <Link
                        to={`/products/${product.product_id}`}
                        className="hover:underline hover:text-primary transition-colors"
                      >
                        {product.product_name}
                      </Link>
                      {product.description && (
                        <p className="text-[11px] text-muted-foreground truncate max-w-xs font-normal">
                          {product.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {product.category_name ? (
                        <Badge variant="secondary" className="font-normal text-[11px]">
                          {product.category_name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-sm tabular">
                      {product.total_quantity} <span className="text-xs font-normal text-muted-foreground">{product.unit_of_measure}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-muted-foreground tabular">
                      {product.reorder_level} {product.unit_of_measure}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={product.stock_status ?? 'in_stock'} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-muted-foreground">
                      {product.location_count ?? 0} sites
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/products/${product.product_id}`}>
                          <Button variant="ghost" size="icon" className="size-8" title="View details">
                            <Eye className="size-3.5" />
                          </Button>
                        </Link>
                        <Link to={`/products/${product.product_id}/edit`}>
                          <Button variant="ghost" size="icon" className="size-8" title="Edit product">
                            <Pencil className="size-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    <Package className="size-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">No products found matching your filter</p>
                    <p className="text-xs mt-1 text-muted-foreground">Try clearing search filters or add a new product</p>
                    <Link to="/products/new" className="mt-4 inline-block">
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                        <Plus className="size-3.5" /> Add Product
                      </Button>
                    </Link>
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
