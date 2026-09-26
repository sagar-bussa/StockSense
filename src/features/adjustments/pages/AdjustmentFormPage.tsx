import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Save, Sliders } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { listAccessibleWarehouses } from '@/features/warehouses/services/warehouses'
import { fetchLocations } from '@/features/warehouses/services/locations'
import { fetchProducts } from '@/features/products/services/products'
import { getLocationStock, postAdjustmentRPC, type AdjustmentReason } from '../services/adjustments'
import { friendlyError } from '@/lib/supabase/errors'
import { queryClient } from '@/app/query-client'
import { toast } from 'sonner'

export function AdjustmentFormPage() {
  const navigate = useNavigate()

  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [productId, setProductId] = useState('')
  const [countedQty, setCountedQty] = useState<number>(0)
  const [systemQty, setSystemQty] = useState<number | null>(null)
  const [reason, setReason] = useState<AdjustmentReason>('miscount')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingStock, setIsLoadingStock] = useState(false)

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listAccessibleWarehouses,
  })

  const locationsQuery = useQuery({
    queryKey: ['locations', warehouseId],
    queryFn: () => fetchLocations(warehouseId || null),
    enabled: !!warehouseId,
  })

  const productsQuery = useQuery({
    queryKey: ['products-available'],
    queryFn: () => fetchProducts({ status: 'active' }),
  })

  // Whenever product and location are both selected, fetch the recorded system stock
  useEffect(() => {
    if (productId && locationId) {
      let isCurrent = true
      // oxlint-disable-next-line react/set-state-in-effect
      setIsLoadingStock(true)
      getLocationStock(productId, locationId)
        .then((qty) => {
          if (isCurrent) {
            setSystemQty(qty)
            setCountedQty(qty) // default counted to current system qty
          }
        })
        .catch((err) => {
          if (isCurrent) toast.error(friendlyError(err))
        })
        .finally(() => {
          if (isCurrent) setIsLoadingStock(false)
        })

      return () => {
        isCurrent = false
      }
    } else {
      setSystemQty(null)
    }
  }, [productId, locationId])

  const difference = systemQty !== null ? countedQty - systemQty : 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!warehouseId || !locationId) {
      toast.error('Please select warehouse and location')
      return
    }
    if (!productId) {
      toast.error('Please select a product')
      return
    }
    if (reason === 'other' && !notes.trim()) {
      toast.error("Please provide an explanatory note when selecting reason 'Other'")
      return
    }

    setIsSubmitting(true)
    try {
      await postAdjustmentRPC({
        productId,
        locationId,
        countedQuantity: Number(countedQty),
        reason,
        notes: notes.trim() || null,
      })

      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['adjustments'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['ledger'] })

      toast.success('Inventory adjustment recorded and stock updated!')
      navigate('/operations/adjustments')
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/operations/adjustments">
          <Button variant="outline" size="icon" className="size-8" title="Back to adjustments">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            New adjustment
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit physical stock against recorded balance. Never change stock silently without justification.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Sliders className="size-4 text-primary" />
              Stock Count Details
            </CardTitle>
            <CardDescription className="text-xs">
              Select the zone and product to compare recorded inventory vs physical floor count
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Warehouse <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={warehouseId}
                  onValueChange={(val) => {
                    setWarehouseId(val)
                    setLocationId('')
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Warehouse" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehousesQuery.data?.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} ({w.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Location / Bay <span className="text-rose-500">*</span>
                </Label>
                <Select value={locationId} onValueChange={setLocationId} disabled={!warehouseId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={warehouseId ? 'Select Location' : 'Choose Warehouse First'} />
                  </SelectTrigger>
                  <SelectContent>
                    {locationsQuery.data?.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Product SKU <span className="text-rose-500">*</span>
              </Label>
              <Select value={productId || undefined} onValueChange={setProductId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select Product..." />
                </SelectTrigger>
                <SelectContent>
                  {productsQuery.isLoading ? (
                    <SelectItem value="__loading" disabled>
                      Loading active products...
                    </SelectItem>
                  ) : !productsQuery.data || productsQuery.data.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No active products found
                    </SelectItem>
                  ) : (
                    productsQuery.data
                      .filter((p): p is typeof p & { product_id: string } => Boolean(p.product_id))
                      .map((p) => (
                        <SelectItem key={p.product_id} value={p.product_id}>
                          {p.product_name} ({p.sku})
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Comparison Metrics */}
            {systemQty !== null && (
              <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-muted/40 border">
                <div className="text-center">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider block">
                    Recorded System Stock
                  </span>
                  <span className="text-lg font-bold font-mono tabular block mt-1">
                    {isLoadingStock ? '…' : systemQty}
                  </span>
                </div>

                <div className="text-center border-x">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider block">
                    Physical Count
                  </span>
                  <span className="text-lg font-bold font-mono tabular block mt-1 text-primary">
                    {countedQty}
                  </span>
                </div>

                <div className="text-center">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider block">
                    Calculated Variance
                  </span>
                  <span
                    className={`text-lg font-bold font-mono tabular block mt-1 ${
                      difference > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : difference < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {difference > 0 ? `+${difference}` : difference}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="counted-qty" className="text-xs font-semibold">
                  Physical Counted Quantity <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="counted-qty"
                  type="number"
                  min="0"
                  value={countedQty}
                  onChange={(e) => setCountedQty(Number(e.target.value))}
                  disabled={systemQty === null}
                  className="h-9 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="adj-reason" className="text-xs font-semibold">
                  Adjustment Reason <span className="text-rose-500">*</span>
                </Label>
                <Select value={reason} onValueChange={(val: AdjustmentReason) => setReason(val)}>
                  <SelectTrigger id="adj-reason" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="miscount">Miscount (Sheet recount)</SelectItem>
                    <SelectItem value="damaged">Damaged Goods</SelectItem>
                    <SelectItem value="lost">Lost / Unaccounted</SelectItem>
                    <SelectItem value="expired">Expired Stock</SelectItem>
                    <SelectItem value="found">Found Stock (Unopened)</SelectItem>
                    <SelectItem value="other">Other (Explain in notes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-notes" className="text-xs font-semibold">
                Reason Notes {reason === 'other' && <span className="text-rose-500">*</span>}
              </Label>
              <Textarea
                id="adj-notes"
                placeholder={reason === 'other' ? 'Mandatory explanation for reason Other...' : 'Additional cycle count audit notes...'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required={reason === 'other'}
                rows={2}
                className="text-xs sm:text-sm"
              />
            </div>

            <div className="pt-4 flex items-center justify-end gap-2 border-t">
              <Link to="/operations/adjustments">
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || systemQty === null}
                className="h-9 gap-1.5 text-xs font-semibold"
              >
                <Save className="size-3.5" />
                {isSubmitting ? 'Recording…' : 'Confirm & Update Stock'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
