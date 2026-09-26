import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createTransferRPC } from '../services/transfers'
import { listAccessibleWarehouses } from '@/features/warehouses/services/warehouses'
import { fetchLocations } from '@/features/warehouses/services/locations'
import { fetchProducts } from '@/features/products/services/products'
import { friendlyError } from '@/lib/supabase/errors'
import { queryClient } from '@/app/query-client'
import { toast } from 'sonner'

export function TransferFormPage() {
  const navigate = useNavigate()

  const [srcWarehouseId, setSrcWarehouseId] = useState('')
  const [srcLocationId, setSrcLocationId] = useState('')
  const [destWarehouseId, setDestWarehouseId] = useState('')
  const [destLocationId, setDestLocationId] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [items, setItems] = useState<Array<{ productId: string; quantity: number }>>([
    { productId: '', quantity: 10 },
  ])

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listAccessibleWarehouses,
  })

  const srcLocationsQuery = useQuery({
    queryKey: ['locations', srcWarehouseId],
    queryFn: () => fetchLocations(srcWarehouseId || null),
    enabled: !!srcWarehouseId,
  })

  const destLocationsQuery = useQuery({
    queryKey: ['locations', destWarehouseId],
    queryFn: () => fetchLocations(destWarehouseId || null),
    enabled: !!destWarehouseId,
  })

  const productsQuery = useQuery({
    queryKey: ['products-available'],
    queryFn: () => fetchProducts({ status: 'active' }),
  })

  const handleAddItem = () => {
    setItems((prev) => [...prev, { productId: '', quantity: 1 }])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: string, value: any) => {
    setItems((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index]!, [field]: value }
      return copy
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!srcWarehouseId || !srcLocationId) {
      toast.error('Please select source warehouse and location')
      return
    }
    if (!destWarehouseId || !destLocationId) {
      toast.error('Please select destination warehouse and location')
      return
    }
    if (srcLocationId === destLocationId) {
      toast.error('Source and destination locations cannot be identical')
      return
    }

    const validItems = items.filter((i) => i.productId && i.quantity > 0)
    if (validItems.length === 0) {
      toast.error('Please add at least one product with positive quantity')
      return
    }

    setIsSubmitting(true)
    try {
      const transferId = await createTransferRPC({
        sourceWarehouseId: srcWarehouseId,
        sourceLocationId: srcLocationId,
        destWarehouseId: destWarehouseId,
        destLocationId: destLocationId,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        items: validItems,
      })

      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['transfers'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })

      toast.success('Internal transfer created as Draft.')
      navigate(`/operations/transfers/${transferId}`)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/operations/transfers">
          <Button variant="outline" size="icon" className="size-8" title="Back to transfers">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            New transfer
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Shift inventory between warehouse sites or internal zones without affecting company total stock.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Source Location */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <span className="size-2 rounded-full bg-rose-500" />
                Source (Origin)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Warehouse</Label>
                <Select
                  value={srcWarehouseId}
                  onValueChange={(val) => {
                    setSrcWarehouseId(val)
                    setSrcLocationId('')
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Origin Warehouse" />
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
                <Label className="text-xs font-semibold">Storage Location / Rack</Label>
                <Select
                  value={srcLocationId}
                  onValueChange={setSrcLocationId}
                  disabled={!srcWarehouseId}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={srcWarehouseId ? 'Select Location' : 'Choose Warehouse First'} />
                  </SelectTrigger>
                  <SelectContent>
                    {srcLocationsQuery.data?.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Destination Location */}
          <Card className="border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500" />
                Destination (Target)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Warehouse</Label>
                <Select
                  value={destWarehouseId}
                  onValueChange={(val) => {
                    setDestWarehouseId(val)
                    setDestLocationId('')
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Target Warehouse" />
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
                <Label className="text-xs font-semibold">Storage Location / Rack</Label>
                <Select
                  value={destLocationId}
                  onValueChange={setDestLocationId}
                  disabled={!destWarehouseId}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={destWarehouseId ? 'Select Location' : 'Choose Warehouse First'} />
                  </SelectTrigger>
                  <SelectContent>
                    {destLocationsQuery.data?.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transfer Reference */}
        <Card className="border">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="transfer-ref" className="text-xs font-semibold">
                  Transfer Reference
                </Label>
                <Input
                  id="transfer-ref"
                  placeholder="e.g. MCR-BHX-022"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-9 text-xs font-mono uppercase"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="transfer-notes" className="text-xs font-semibold">
                  Reason / Operational Notes
                </Label>
                <Input
                  id="transfer-notes"
                  placeholder="e.g. Stock rebalance for Birmingham fulfilment"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Transfer Items</CardTitle>
              <CardDescription className="text-xs">
                Select items and quantities being moved
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleAddItem} className="h-8 gap-1 text-xs">
              <Plus className="size-3.5" /> Add Line
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="divide-y divide-border">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-3 py-3 items-center">
                  <div className="col-span-12 sm:col-span-8 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Product</Label>
                    <Select
                      value={item.productId || undefined}
                      onValueChange={(val) => handleItemChange(index, 'productId', val)}
                    >
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

                  <div className="col-span-10 sm:col-span-3 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Transfer Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-1 flex items-end justify-center pt-5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveItem(index)}
                      disabled={items.length === 1}
                      className="size-8 text-muted-foreground hover:text-rose-500"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 flex items-center justify-end gap-2 border-t">
              <Link to="/operations/transfers">
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" size="sm" disabled={isSubmitting} className="h-9 gap-1.5 text-xs font-semibold">
                <Save className="size-3.5" />
                {isSubmitting ? 'Creating…' : 'Save as Draft'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
