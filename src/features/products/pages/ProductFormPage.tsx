import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Package, Save } from 'lucide-react'
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
import { fetchCategories, fetchProductById, createProductRPC, updateProduct } from '../services/products'
import { fetchLocations } from '@/features/warehouses/services/locations'
import { friendlyError } from '@/lib/supabase/errors'
import { queryClient } from '@/app/query-client'
import { toast } from 'sonner'

export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>()
  const isEditing = !!productId && productId !== 'new'
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [unitOfMeasure, setUnitOfMeasure] = useState('pcs')
  const [reorderLevel, setReorderLevel] = useState<number>(10)
  const [initialStock, setInitialStock] = useState<number>(0)
  const [locationId, setLocationId] = useState<string>('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'active' | 'archived'>('active')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
  })

  const locationsQuery = useQuery({
    queryKey: ['locations'],
    queryFn: () => fetchLocations(),
  })

  const productQuery = useQuery({
    queryKey: ['product', productId],
    queryFn: () => (productId ? fetchProductById(productId) : null),
    enabled: isEditing,
  })

  useEffect(() => {
    if (productQuery.data) {
      // oxlint-disable-next-line react/set-state-in-effect
      setName(productQuery.data.product_name ?? '')
      setSku(productQuery.data.sku ?? '')
      setCategoryId(productQuery.data.category_id || '')
      setUnitOfMeasure(productQuery.data.unit_of_measure ?? 'pcs')
      setReorderLevel(productQuery.data.reorder_level ?? 0)
      setDescription(productQuery.data.description || '')
      setStatus((productQuery.data.product_status as 'active' | 'archived') ?? 'active')
    }
  }, [productQuery.data])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Product name is required')
      return
    }
    if (!sku.trim()) {
      toast.error('SKU / Code is required')
      return
    }
    if (initialStock > 0 && !locationId) {
      toast.error('Please select an intake location for opening initial stock')
      return
    }

    setIsSubmitting(true)
    try {
      if (isEditing) {
        await updateProduct(productId!, {
          name: name.trim(),
          sku: sku.trim(),
          categoryId: categoryId || null,
          unitOfMeasure: unitOfMeasure.trim(),
          reorderLevel: Number(reorderLevel),
          description: description.trim() || null,
          status,
        })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        void queryClient.invalidateQueries({ queryKey: ['products'] })
        void queryClient.invalidateQueries({ queryKey: ['ledger'] })
        toast.success('Product updated successfully')
        navigate(`/products/${productId}`)
      } else {
        const newId = await createProductRPC({
          name: name.trim(),
          sku: sku.trim(),
          categoryId: categoryId || null,
          unitOfMeasure: unitOfMeasure.trim(),
          reorderLevel: Number(reorderLevel),
          initialStock: Number(initialStock),
          locationId: initialStock > 0 ? locationId : null,
          description: description.trim() || null,
        })
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
        void queryClient.invalidateQueries({ queryKey: ['products'] })
        void queryClient.invalidateQueries({ queryKey: ['ledger'] })
        toast.success('Product created successfully')
        navigate(`/products/${newId}`)
      }
    } catch (error) {
      toast.error(friendlyError(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/products">
          <Button variant="outline" size="icon" className="size-8" title="Back to products">
            <ArrowLeft className="size-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Product form
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isEditing ? 'Update existing product metadata and reorder threshold.' : 'Register a new item in the centralized inventory catalog.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="border">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Package className="size-4 text-primary" />
              General Information
            </CardTitle>
            <CardDescription className="text-xs">
              Basic identification, categorization, and units of measure
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="product-name" className="text-xs font-semibold">
                  Product Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="product-name"
                  placeholder="e.g. Mild Steel Sheet 2mm"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-9 text-xs sm:text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="product-sku" className="text-xs font-semibold">
                  SKU / Item Code <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="product-sku"
                  placeholder="e.g. RM-STEEL-001"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  required
                  className="h-9 font-mono text-xs sm:text-sm uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="product-category" className="text-xs font-semibold">
                  Category
                </Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="product-category" className="h-9 text-xs">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesQuery.data?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="product-uom" className="text-xs font-semibold">
                  Unit of Measure <span className="text-rose-500">*</span>
                </Label>
                <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
                  <SelectTrigger id="product-uom" className="h-9 text-xs">
                    <SelectValue placeholder="Select UOM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pcs">Pieces (pcs)</SelectItem>
                    <SelectItem value="kg">Kilograms (kg)</SelectItem>
                    <SelectItem value="m">Meters (m)</SelectItem>
                    <SelectItem value="m2">Square Meters (m²)</SelectItem>
                    <SelectItem value="l">Liters (L)</SelectItem>
                    <SelectItem value="roll">Rolls (roll)</SelectItem>
                    <SelectItem value="box">Boxes (box)</SelectItem>
                    <SelectItem value="set">Sets (set)</SelectItem>
                    <SelectItem value="pair">Pairs (pair)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="product-reorder" className="text-xs font-semibold">
                  Reorder Level <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="product-reorder"
                  type="number"
                  min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(Number(e.target.value))}
                  required
                  className="h-9 text-xs sm:text-sm font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-desc" className="text-xs font-semibold">
                Description / Notes
              </Label>
              <Textarea
                id="product-desc"
                placeholder="Specifications, dimensions, or supplier references..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="text-xs sm:text-sm"
              />
            </div>

            {/* Opening Initial Stock - Only on Create */}
            {!isEditing && (
              <div className="pt-2 border-t mt-4 space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Opening Stock (Optional)
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    If products are already physically on the shelf, an opening receipt ledger row will be recorded.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="initial-stock" className="text-xs font-semibold">
                      Initial Quantity
                    </Label>
                    <Input
                      id="initial-stock"
                      type="number"
                      min="0"
                      value={initialStock}
                      onChange={(e) => setInitialStock(Number(e.target.value))}
                      className="h-9 text-xs sm:text-sm font-mono"
                    />
                  </div>

                  {initialStock > 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="initial-location" className="text-xs font-semibold">
                        Intake Storage Location <span className="text-rose-500">*</span>
                      </Label>
                      <Select value={locationId} onValueChange={setLocationId}>
                        <SelectTrigger id="initial-location" className="h-9 text-xs">
                          <SelectValue placeholder="Select Location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locationsQuery.data?.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name} ({loc.code})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}

            {isEditing && (
              <div className="pt-2 border-t mt-4 space-y-2">
                <Label htmlFor="product-status" className="text-xs font-semibold">
                  Catalog Status
                </Label>
                <Select value={status} onValueChange={(val: 'active' | 'archived') => setStatus(val)}>
                  <SelectTrigger id="product-status" className="w-[180px] h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Available)</SelectItem>
                    <SelectItem value="archived">Archived (Inactive)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Archiving hides the product from new orders while preserving historical ledger accuracy.
                </p>
              </div>
            )}

            <div className="pt-4 flex items-center justify-end gap-2">
              <Link to="/products">
                <Button type="button" variant="outline" size="sm" className="h-9 text-xs">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" size="sm" disabled={isSubmitting} className="h-9 gap-1.5 text-xs font-semibold">
                <Save className="size-3.5" />
                {isSubmitting ? 'Saving…' : isEditing ? 'Update Product' : 'Create Product'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
