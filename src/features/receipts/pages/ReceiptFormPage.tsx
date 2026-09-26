import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Plus, Save, Trash2, Truck } from 'lucide-react'
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
import { fetchSuppliers, createReceiptRPC } from '../services/receipts'
import { listAccessibleWarehouses } from '@/features/warehouses/services/warehouses'
import { fetchLocations } from '@/features/warehouses/services/locations'
import { fetchProducts } from '@/features/products/services/products'
import { friendlyError } from '@/lib/supabase/errors'
import { queryClient } from '@/app/query-client'
import { toast } from 'sonner'

export function ReceiptFormPage() {
  const navigate = useNavigate()

  const [supplierId, setSupplierId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [reference, setReference] = useState('')
  const [notes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [items, setItems] = useState<Array<{ productId: string; quantity: number; unitCost: number }>>([
    { productId: '', quantity: 10, unitCost: 0 },
  ])

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: fetchSuppliers,
  })

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
    queryKey: ['products-lookup'],
    queryFn: () => fetchProducts({ status: 'active' }),
  })

  const handleAddItem = () => {
    setItems((prev) => [...prev, { productId: '', quantity: 1, unitCost: 0 }])
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

    if (!supplierId) {
      toast.error('Please select a supplier')
      return
    }
    if (!warehouseId || !locationId) {
      toast.error('Please select a destination warehouse and location')
      return
    }

    const validItems = items.filter((i) => i.productId && i.quantity > 0)
    if (validItems.length === 0) {
      toast.error('Please add at least one product with positive quantity')
      return
    }

    setIsSubmitting(true)
    try {
      const receiptId = await createReceiptRPC({
        supplierId,
        warehouseId,
        locationId,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
        items: validItems,
      })

      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['receipts'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })

      toast.success('Receipt created in Draft status. Stock will update upon validation.')
      navigate(`/operations/receipts/${receiptId}`)
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
        <Link to="/operations/receipts">
          <Button variant="outline" size="icon" className="size-8" title="Back to receipts">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            New receipt
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Record incoming vendor shipment. Note: Saving creates a Draft; stock increases only after validation.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Document Header */}
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Truck className="size-4 text-primary" />
              Supplier & Intake Destination
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="supplier" className="text-xs font-semibold">
                  Supplier / Vendor <span className="text-rose-500">*</span>
                </Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="supplier" className="h-9 text-xs">
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliersQuery.data?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.contact_name || s.country || 'UK'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reference" className="text-xs font-semibold">
                  Supplier Reference / PO #
                </Label>
                <Input
                  id="reference"
                  placeholder="e.g. PO-88419"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-9 text-xs sm:text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="warehouse" className="text-xs font-semibold">
                  Destination Warehouse <span className="text-rose-500">*</span>
                </Label>
                <Select
                  value={warehouseId}
                  onValueChange={(val) => {
                    setWarehouseId(val)
                    setLocationId('')
                  }}
                >
                  <SelectTrigger id="warehouse" className="h-9 text-xs">
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
                <Label htmlFor="location" className="text-xs font-semibold">
                  Intake Zone / Location <span className="text-rose-500">*</span>
                </Label>
                <Select value={locationId} onValueChange={setLocationId} disabled={!warehouseId}>
                  <SelectTrigger id="location" className="h-9 text-xs">
                    <SelectValue placeholder={warehouseId ? 'Select Location' : 'Choose Warehouse First'} />
                  </SelectTrigger>
                  <SelectContent>
                    {locationsQuery.data?.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} ({l.code} - {l.kind})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items Card */}
        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Goods Received Items</CardTitle>
              <CardDescription className="text-xs">
                Select items from catalog and enter quantities being taken into inventory
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
                  <div className="col-span-12 sm:col-span-6 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Product</Label>
                    <Select
                      value={item.productId || undefined}
                      onValueChange={(val) => handleItemChange(index, 'productId', val)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Select Product SKU..." />
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

                  <div className="col-span-6 sm:col-span-3 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Quantity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                      className="h-9 text-xs font-mono"
                      required
                    />
                  </div>

                  <div className="col-span-5 sm:col-span-2 space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Unit Cost (£)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.unitCost}
                      onChange={(e) => handleItemChange(index, 'unitCost', Number(e.target.value))}
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  <div className="col-span-1 flex items-end justify-center pt-5">
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
              <Link to="/operations/receipts">
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" size="sm" disabled={isSubmitting} className="h-9 gap-1.5 text-xs font-semibold">
                <Save className="size-3.5" />
                {isSubmitting ? 'Creating Draft…' : 'Save as Draft'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
