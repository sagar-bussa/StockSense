import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { listAccessibleWarehouses } from '../services/warehouses'
import { fetchStockByWarehouse } from '@/features/dashboard/services/dashboard'

export function WarehousesPage() {
  const warehousesQuery = useQuery({
    queryKey: ['warehouses-list'],
    queryFn: listAccessibleWarehouses,
  })

  const stockQuery = useQuery({
    queryKey: ['warehouse-stock'],
    queryFn: fetchStockByWarehouse,
  })

  const warehouses = warehousesQuery.data ?? []
  const stockData = stockQuery.data ?? []

  const stockMap = new Map(stockData.map((s) => [s.warehouse_id, s]))

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Warehouses
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage distribution centers, physical warehouse hubs, and internal storage locations.
          </p>
        </div>
      </div>

      {/* Warehouses Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {warehousesQuery.isLoading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="border">
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-60" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : warehouses.length > 0 ? (
          warehouses.map((wh) => {
            const stock = stockMap.get(wh.id)
            return (
              <Card key={wh.id} className="border hover:border-primary/40 transition-colors">
                <CardHeader className="flex flex-row items-start justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-3 text-primary">
                      <Warehouse className="size-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-semibold">{wh.name}</CardTitle>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {wh.code}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-1.5 text-xs mt-1">
                        <MapPin className="size-3 shrink-0" />
                        {wh.address ? `${wh.address}, ${wh.city || ''}` : wh.city || 'United Kingdom'}
                      </CardDescription>
                    </div>
                  </div>

                  <Link to={`/warehouses/${wh.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                      View <ChevronRight className="size-3.5" />
                    </Button>
                  </Link>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    <div className="rounded-md bg-muted/40 p-2.5">
                      <span className="text-[11px] text-muted-foreground block">Stock On Hand</span>
                      <span className="font-mono font-bold text-base tabular">
                        {Number(stock?.total_quantity ?? 0).toLocaleString()} units
                      </span>
                    </div>

                    <div className="rounded-md bg-muted/40 p-2.5">
                      <span className="text-[11px] text-muted-foreground block">Active Product Lines</span>
                      <span className="font-mono font-bold text-base tabular">
                        {stock?.product_count ?? 0} SKUs
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                    {wh.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" /> {wh.phone}
                      </span>
                    )}
                    {wh.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="size-3" /> {wh.email}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <div className="col-span-2 text-center p-8 text-muted-foreground">
            No warehouses assigned or accessible.
          </div>
        )}
      </div>
    </div>
  )
}
