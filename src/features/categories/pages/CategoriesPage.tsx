import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { fetchStockByCategory } from '@/features/dashboard/services/dashboard'
import { supabase } from '@/lib/supabase/client'
import { friendlyError } from '@/lib/supabase/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { queryClient } from '@/app/query-client'
import { toast } from 'sonner'

export function CategoriesPage() {
  const { profile } = useAuth()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const categoriesQuery = useQuery({
    queryKey: ['categories-with-stock'],
    queryFn: fetchStockByCategory,
  })

  const categories = categoriesQuery.data ?? []

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setIsSubmitting(true)
    try {
      const { error } = await supabase.from('categories').insert({
        name: name.trim(),
        description: description.trim() || null,
        color,
        created_by: profile?.id ?? null,
      })

      if (error) throw error

      toast.success('Category created successfully')
      setName('')
      setDescription('')
      setDialogOpen(false)
      void categoriesQuery.refetch()
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['categories'] })
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Categories
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize products into functional catalog groups for stock classification and reporting.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9 gap-1.5 text-xs font-medium">
              <Plus className="size-3.5" />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreateCategory}>
              <DialogHeader>
                <DialogTitle className="text-base font-semibold">Create Category</DialogTitle>
                <DialogDescription className="text-xs">
                  Add a new inventory category for products.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cat-name" className="text-xs font-semibold">
                    Category Name <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    id="cat-name"
                    placeholder="e.g. Raw Materials"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-9 text-xs sm:text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cat-desc" className="text-xs font-semibold">
                    Description
                  </Label>
                  <Input
                    id="cat-desc"
                    placeholder="Brief description of items included"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="h-9 text-xs sm:text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cat-color" className="text-xs font-semibold">
                    Accent Color
                  </Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="cat-color"
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="size-8 rounded border cursor-pointer"
                    />
                    <span className="font-mono text-xs text-muted-foreground uppercase">{color}</span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogOpen(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs font-semibold">
                  {isSubmitting ? 'Creating…' : 'Create Category'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat, index) => {
          const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4']
          const badgeColor = colors[index % colors.length]
          return (
            <Card key={cat.category_id} className="border hover:border-primary/40 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3.5 rounded-full inline-block shrink-0 shadow-xs"
                    style={{ backgroundColor: badgeColor }}
                  />
                  <CardTitle className="text-base font-semibold">{cat.category_name}</CardTitle>
                </div>
              <span className="font-mono text-xs font-bold bg-muted px-2 py-0.5 rounded text-muted-foreground">
                {cat.product_count} items
              </span>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between mt-2 pt-2 border-t text-xs">
                <span className="text-muted-foreground">Total Stock:</span>
                <span className="font-mono font-bold text-sm tabular">
                  {Number(cat.total_quantity).toLocaleString()} units
                </span>
              </div>
            </CardContent>
          </Card>
        )})}
      </div>
    </div>
  )
}
