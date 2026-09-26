import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase/client'
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Layers,
  Plus,
  RefreshCw,
  TrendingUp,
  Truck,
  Warehouse,
  XCircle,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  fetchDashboardKPIs,
  fetchDailyMovements,
  fetchStockByCategory,
  fetchStockByWarehouse,
  fetchLowStockAlerts,
  fetchRecentLedger,
} from '../services/dashboard'

export function DashboardPage() {
  const [timeRange, setTimeRange] = useState<'7' | '14' | '30' | '90'>('14')

  const kpisQuery = useQuery({
    queryKey: ['dashboard', 'kpis'],
    queryFn: fetchDashboardKPIs,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 5_000,
  })

  const movementsQuery = useQuery({
    queryKey: ['dashboard', 'movements', timeRange],
    queryFn: () => fetchDailyMovements(Number(timeRange)),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  })

  const categoryQuery = useQuery({
    queryKey: ['dashboard', 'categories'],
    queryFn: fetchStockByCategory,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  })

  const warehouseQuery = useQuery({
    queryKey: ['dashboard', 'warehouses'],
    queryFn: fetchStockByWarehouse,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  })

  const lowStockQuery = useQuery({
    queryKey: ['dashboard', 'low-stock'],
    queryFn: () => fetchLowStockAlerts(6),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 10_000,
  })

  const ledgerQuery = useQuery({
    queryKey: ['dashboard', 'recent-ledger'],
    queryFn: () => fetchRecentLedger(8),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 5_000,
  })

  const kpis = kpisQuery.data
  const isLoading = kpisQuery.isLoading

  const handleRefresh = () => {
    void kpisQuery.refetch()
    void movementsQuery.refetch()
    void categoryQuery.refetch()
    void warehouseQuery.refetch()
    void lowStockQuery.refetch()
    void ledgerQuery.refetch()
  }

  useEffect(() => {
    const channel = supabase
      .channel('stocksense-dashboard-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipts' },
        handleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliveries' },
        handleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transfers' },
        handleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'adjustments' },
        handleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        handleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_ledger' },
        handleRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        handleRefresh,
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Inventory Dashboard
            </h1>
            <Badge variant="outline" className="hidden sm:inline-flex border-primary/30 text-primary bg-primary/5">
              Live Operations
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Centralized control center for stock levels, movement velocity, and warehouse workflows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="h-9 gap-1.5 text-xs font-medium"
            disabled={kpisQuery.isFetching}
          >
            <RefreshCw className={`size-3.5 ${kpisQuery.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Link to="/operations/receipts/new">
            <Button size="sm" className="h-9 gap-1.5 text-xs font-medium">
              <Plus className="size-3.5" />
              New Receipt
            </Button>
          </Link>
          <Link to="/operations/deliveries/new">
            <Button variant="secondary" size="sm" className="h-9 gap-1.5 text-xs font-medium">
              <Truck className="size-3.5" />
              New Delivery
            </Button>
          </Link>
          <Link to="/operations/transfers/new">
            <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium">
              <ArrowRightLeft className="size-3.5" />
              Transfer
            </Button>
          </Link>
        </div>
      </div>

      {/* 6 Key Performance Indicator Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Total Stock */}
        <Link to="/products" className="group">
          <Card className="h-full border transition-all duration-200 hover:border-primary/50 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total Stock
              </span>
              <div className="rounded-md bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Boxes className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  <div className="text-2xl font-bold tracking-tight tabular">
                    {Number(kpis?.total_units ?? 0).toLocaleString()}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">
                    Across {kpis?.visible_warehouses ?? 2} warehouses
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Low Stock */}
        <Link to="/products?filter=low_stock" className="group">
          <Card className="h-full border transition-all duration-200 hover:border-amber-500/50 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                Low Stock
              </span>
              <div className="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                <AlertTriangle className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular">
                    {kpis?.low_stock_products ?? 0}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Items below reorder point
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Out of Stock */}
        <Link to="/products?filter=out_of_stock" className="group">
          <Card className="h-full border transition-all duration-200 hover:border-rose-500/50 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                Out of Stock
              </span>
              <div className="rounded-md bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                <XCircle className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400 tabular">
                    {kpis?.out_of_stock_products ?? 0}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Immediate action required
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Pending Receipts */}
        <Link to="/operations/receipts" className="group">
          <Card className="h-full border transition-all duration-200 hover:border-blue-500/50 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Receipts
              </span>
              <div className="rounded-md bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                <ArrowDownLeft className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold tracking-tight tabular">
                    {kpis?.pending_receipts ?? 0}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Awaiting warehouse intake
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Pending Deliveries */}
        <Link to="/operations/deliveries" className="group">
          <Card className="h-full border transition-all duration-200 hover:border-indigo-500/50 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Deliveries
              </span>
              <div className="rounded-md bg-indigo-500/10 p-2 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                <ArrowUpRight className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold tracking-tight tabular">
                    {kpis?.pending_deliveries ?? 0}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Ready for pick & pack
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>

        {/* Internal Transfers */}
        <Link to="/operations/transfers" className="group">
          <Card className="h-full border transition-all duration-200 hover:border-violet-500/50 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Transfers
              </span>
              <div className="rounded-md bg-violet-500/10 p-2 text-violet-600 dark:text-violet-400 group-hover:bg-violet-500 group-hover:text-white transition-colors">
                <ArrowRightLeft className="size-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold tracking-tight tabular">
                    {kpis?.pending_transfers ?? 0}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Internal movements active
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Analytics Charts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Inbound vs Outbound Trend Chart */}
        <Card className="lg:col-span-2 border">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Stock Movement Velocity</CardTitle>
              <CardDescription className="text-xs">
                Inbound receipts vs outbound customer dispatches over time
              </CardDescription>
            </div>
            <div className="flex items-center gap-1 rounded-md border p-1 bg-muted/40">
              {(['7', '14', '30'] as const).map((days) => (
                <button
                  key={days}
                  onClick={() => setTimeRange(days)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                    timeRange === days
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {days}D
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-72 w-full">
              {movementsQuery.isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Skeleton className="h-60 w-full" />
                </div>
              ) : movementsQuery.data && movementsQuery.data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={movementsQuery.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="colorDispatched" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" opacity={0.6} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(val) => {
                        const d = new Date(val)
                        return `${d.getDate()}/${d.getMonth() + 1}`
                      }}
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="received"
                      name="Received (Inbound)"
                      stroke="#10b981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorReceived)"
                    />
                    <Area
                      type="monotone"
                      dataKey="dispatched"
                      name="Dispatched (Outbound)"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorDispatched)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
                  <TrendingUp className="size-8 opacity-40 mb-2" />
                  <p className="text-sm">No movement data recorded in this range.</p>
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-emerald-500 inline-block" />
                Inbound Intake
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-indigo-500 inline-block" />
                Outbound Shipments
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Inventory by Category Bar Chart */}
        <Card className="border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Inventory by Category</CardTitle>
            <CardDescription className="text-xs">
              Stock concentration across active categories
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-72 w-full">
              {categoryQuery.isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Skeleton className="h-60 w-full" />
                </div>
              ) : categoryQuery.data && categoryQuery.data.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryQuery.data} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border)" opacity={0.6} />
                    <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} />
                    <YAxis
                      dataKey="category_name"
                      type="category"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--color-card)',
                        borderColor: 'var(--color-border)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="total_quantity" name="Total Units" radius={[0, 4, 4, 0]}>
                      {categoryQuery.data.map((_, index) => {
                        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <p className="text-sm">No category distribution data.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warehouse Distribution Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {warehouseQuery.data?.map((wh) => (
          <Card key={wh.warehouse_id} className="border">
            <CardContent className="p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="rounded-lg bg-primary/10 p-3 text-primary">
                  <Warehouse className="size-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">{wh.warehouse_name}</h3>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{wh.warehouse_code}</span>
                    <span>•</span>
                    <span>{wh.product_count} product lines</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold tracking-tight tabular font-mono">
                  {Number(wh.total_quantity).toLocaleString()}
                </div>
                <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                  <span>{wh.location_count ?? 0} storage zones</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action Tables: Low Stock Attention & Recent Movements */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Low Stock Items Attention */}
        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-500" />
                Low & Out of Stock Attention
              </CardTitle>
              <CardDescription className="text-xs">
                Items requiring restock or purchase order creation
              </CardDescription>
            </div>
            <Link to="/products?filter=low_stock">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
                View all <ChevronRight className="size-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {lowStockQuery.isLoading ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : lowStockQuery.data && lowStockQuery.data.length > 0 ? (
                lowStockQuery.data.map((item) => (
                  <div
                    key={item.product_id}
                    className="flex items-center justify-between p-3.5 sm:px-5 hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0 pr-3">
                      <Link
                        to={`/products/${item.product_id}`}
                        className="text-xs sm:text-sm font-semibold hover:underline truncate block"
                      >
                        {item.product_name}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{item.sku}</span>
                        <span>•</span>
                        <span>{item.category_name}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-xs font-semibold tabular">
                          {item.total_quantity} / {item.reorder_level} {item.unit_of_measure}
                        </div>
                        <span
                          className={`text-[11px] font-medium ${
                            Number(item.total_quantity) === 0 ? 'text-rose-600 font-semibold' : 'text-amber-600'
                          }`}
                        >
                          {Number(item.total_quantity) === 0 ? 'Out of stock' : `Deficit: ${item.shortfall ?? 0}`}
                        </span>
                      </div>
                      <Link to="/operations/receipts/new">
                        <Button size="sm" variant="outline" className="h-7 text-xs px-2.5">
                          Order
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  <CheckCircle2 className="size-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  All stock lines are comfortably above reorder points!
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Ledger Activity */}
        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="size-4 text-primary" />
                Live Stock Movement Ledger
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time chronological audit trail of inventory transactions
              </CardDescription>
            </div>
            <Link to="/ledger">
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground hover:text-foreground">
                Full ledger <ChevronRight className="size-3.5" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {ledgerQuery.isLoading ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : ledgerQuery.data && ledgerQuery.data.length > 0 ? (
                ledgerQuery.data.map((entry) => {
                  const isPositive = Number(entry.quantity_change) > 0
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between p-3.5 sm:px-5 hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
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
                          <span className="font-mono text-xs text-muted-foreground font-medium">
                            {entry.reference_number || 'Direct'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          By {entry.created_by_name || 'System'} •{' '}
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono text-sm font-bold tabular ${
                            isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isPositive ? `+${entry.quantity_change}` : entry.quantity_change}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Bal: {entry.running_balance}
                        </div>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No stock movements recorded yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
