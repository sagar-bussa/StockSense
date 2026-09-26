import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Boxes,
  Mail,
  MapPin,
  Phone,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchWarehouseWithLocations } from '../services/locations'

export function WarehouseDetailPage() {
  const { warehouseId } = useParams<{ warehouseId: string }>()

  const warehouseQuery = useQuery({
    queryKey: ['warehouse-detail', warehouseId],
    queryFn: () => (warehouseId ? fetchWarehouseWithLocations(warehouseId) : null),
    enabled: !!warehouseId,
  })

  const wh = warehouseQuery.data

  if (warehouseQuery.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!wh) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold">Warehouse detail</h1>
        <p className="mt-2 text-sm text-muted-foreground">Warehouse not found or unavailable.</p>
        <Link to="/warehouses" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            Back to Warehouses
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/warehouses">
          <Button variant="outline" size="icon" className="size-8" title="Back to warehouses">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Warehouse detail
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              {wh.code}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Facility overview and designated internal storage zones.
          </p>
        </div>
      </div>

      {/* Main Info Card */}
      <Card className="border">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <Warehouse className="size-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">{wh.name}</h2>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5" />
                  <span>
                    {wh.address ? `${wh.address}, ${wh.city || ''}, ${wh.country || ''}` : wh.city || 'UK'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {wh.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 text-primary" /> {wh.phone}
                </span>
              )}
              {wh.email && (
                <span className="flex items-center gap-1.5">
                  <Mail className="size-3.5 text-primary" /> {wh.email}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Locations Table */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Boxes className="size-4 text-primary" />
            Storage Locations & Bins ({wh.locations.length})
          </CardTitle>
          <CardDescription className="text-xs">
            Internal storage areas for stock intake, rack storage, and dispatch staging
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">Location Name</th>
                  <th className="py-2.5 px-4">Code</th>
                  <th className="py-2.5 px-4">Kind / Type</th>
                  <th className="py-2.5 px-4">Notes / Purpose</th>
                  <th className="py-2.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {wh.locations.map((loc) => (
                  <tr key={loc.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3 px-4 font-semibold text-foreground">{loc.name}</td>
                    <td className="py-3 px-4 font-mono font-medium">{loc.code}</td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {loc.kind}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground">{loc.notes || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {loc.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
