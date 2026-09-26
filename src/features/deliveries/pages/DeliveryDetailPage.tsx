import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ExternalLink,
  Package,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/data-display/StatusBadge'
import {
  fetchDeliveryById,
  checkDeliveryAvailabilityRPC,
  validateDeliveryRPC,
  cancelDeliveryRPC,
} from '../services/deliveries'
import { friendlyError } from '@/lib/supabase/errors'
import { toast } from 'sonner'

export function DeliveryDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const queryClient = useQueryClient()

  const [confirmValidateOpen, setConfirmValidateOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const deliveryQuery = useQuery({
    queryKey: ['delivery-detail', documentId],
    queryFn: () => (documentId ? fetchDeliveryById(documentId) : null),
    enabled: !!documentId,
  })

  const availabilityQuery = useQuery({
    queryKey: ['delivery-availability', documentId],
    queryFn: () => (documentId ? checkDeliveryAvailabilityRPC(documentId) : []),
    enabled: !!documentId && deliveryQuery.data?.delivery.status !== 'done',
  })

  const data = deliveryQuery.data
  const delivery = data?.delivery
  const items = data?.items ?? []
  const availability = availabilityQuery.data ?? []

  const isDone = delivery?.status === 'done'
  const isCanceled = delivery?.status === 'canceled'
  const canValidate = !isDone && !isCanceled

  const hasInsufficientStock = availability.some((a) => !a.is_sufficient)

  const handleValidate = async () => {
    if (!documentId) return
    setIsProcessing(true)
    try {
      await validateDeliveryRPC(documentId)
      toast.success('Delivery validated successfully! Stock has been deducted and ledger recorded.')
      setConfirmValidateOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['delivery-detail', documentId] })
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['ledger'] })
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!documentId || !cancelReason.trim()) return

    setIsProcessing(true)
    try {
      await cancelDeliveryRPC(documentId, cancelReason.trim())
      toast.success('Delivery order canceled')
      setCancelOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['delivery-detail', documentId] })
      void queryClient.invalidateQueries({ queryKey: ['deliveries'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setIsProcessing(false)
    }
  }

  if (deliveryQuery.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!delivery) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold">Delivery detail</h1>
        <p className="mt-2 text-sm text-muted-foreground">Delivery order not found.</p>
        <Link to="/operations/deliveries" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            Back to Deliveries
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/operations/deliveries">
            <Button variant="outline" size="icon" className="size-8" title="Back to deliveries">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Delivery detail
              </h1>
              <span className="font-mono text-sm font-semibold">{delivery.delivery_number}</span>
              <StatusBadge status={delivery.status} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Customer sales dispatch verification and stock deduction.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canValidate && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(true)}
                className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950"
              >
                <Ban className="size-3.5" /> Cancel
              </Button>

              <Button
                size="sm"
                onClick={() => setConfirmValidateOpen(true)}
                disabled={hasInsufficientStock}
                className="h-8 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                <CheckCircle2 className="size-3.5" /> Validate Delivery
              </Button>
            </>
          )}

          {isDone && (
            <Link to="/ledger">
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                View Ledger Entry <ExternalLink className="size-3" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Insufficient Stock Warning Alert */}
      {hasInsufficientStock && canValidate && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-3">
          <AlertTriangle className="size-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Insufficient Stock Detected</h3>
            <p className="mt-1">
              One or more line items requested in this delivery exceed physical quantities available in the origin warehouse zone.
              Validation is prevented by the system to maintain strict inventory integrity.
            </p>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmValidateOpen} onOpenChange={setConfirmValidateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              Confirm Delivery Order Validation
            </DialogTitle>
            <DialogDescription className="text-xs pt-2">
              You are about to validate delivery <strong className="font-mono">{delivery.delivery_number}</strong> for customer{' '}
              <strong>{delivery.customers?.name}</strong>.
              <br />
              <br />
              This will automatically:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-foreground">
                <li>Deduct inventory quantities from <strong>{delivery.warehouses?.name} / {delivery.locations?.name}</strong></li>
                <li>Write immutable outgoing movement rows into the <strong>Stock Ledger</strong></li>
                <li>Update dashboard KPIs and trigger reorder alerts if stock drops below threshold</li>
              </ul>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmValidateOpen(false)}
              disabled={isProcessing}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleValidate}
              disabled={isProcessing}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isProcessing ? 'Validating…' : 'Confirm & Deduct Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancellation Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <form onSubmit={handleCancel}>
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-rose-600 flex items-center gap-2">
                <Ban className="size-5" />
                Cancel Delivery Order
              </DialogTitle>
              <DialogDescription className="text-xs">
                Provide a reason for canceling this delivery order.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-2">
              <Label htmlFor="del-cancel-reason" className="text-xs font-semibold">
                Cancellation Reason <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="del-cancel-reason"
                placeholder="e.g. Customer cancelled order"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                required
                className="h-9 text-xs sm:text-sm"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(false)}
                disabled={isProcessing}
                className="text-xs"
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={isProcessing || !cancelReason.trim()}
                className="text-xs font-semibold"
              >
                {isProcessing ? 'Canceling…' : 'Confirm Cancellation'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Status Banners */}
      {isDone && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>
              <strong>Delivery Dispatched:</strong> Stock was deducted from warehouse on{' '}
              {delivery.validated_at ? new Date(delivery.validated_at).toLocaleString() : 'Done'}.
            </span>
          </div>
        </div>
      )}

      {isCanceled && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-800 dark:text-rose-300">
          <strong>Canceled:</strong> {delivery.cancel_reason || 'Order canceled.'}
        </div>
      )}

      {/* Metadata Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Customer Details</CardDescription>
            <CardTitle className="text-base font-semibold">{delivery.customers?.name || '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Contact: {delivery.customers?.contact_name || '—'}</p>
            <p>Email: {delivery.customers?.email || '—'}</p>
            <p>Order Reference: <strong className="font-mono text-foreground">{delivery.reference || '—'}</strong></p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Origin Zone</CardDescription>
            <CardTitle className="text-base font-semibold">{delivery.warehouses?.name || '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Pick Location: <strong className="text-foreground">{delivery.locations?.name || '—'}</strong></p>
            <p>Code: <span className="font-mono">{delivery.locations?.code || '—'}</span></p>
            <p>Order Created: {new Date(delivery.created_at).toLocaleDateString()}</p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Audit & Attribution</CardDescription>
            <CardTitle className="text-base font-semibold">
              {delivery.profiles_created?.full_name || delivery.profiles_created?.email || 'System'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Created by: {delivery.profiles_created?.email || '—'}</p>
            {delivery.validated_at && (
              <p>Dispatched by: {delivery.profiles_validated?.full_name || delivery.profiles_validated?.email || 'Staff'}</p>
            )}
            <p>Order Status: <span className="font-semibold capitalize text-foreground">{delivery.status}</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Items Table with Live Stock Availability */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="size-4 text-primary" />
            Pick & Pack Line Items ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Product Name</th>
                  <th className="py-2.5 px-4 text-right">Requested Qty</th>
                  {canValidate && <th className="py-2.5 px-4 text-right">Available in Zone</th>}
                  {canValidate && <th className="py-2.5 px-4 text-center">Availability Status</th>}
                  <th className="py-2.5 px-4 text-right">Unit Price</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const avail = availability.find((a) => a.product_id === item.product_id)
                  const lineTotal = Number(item.quantity) * Number(item.unit_price || 0)
                  return (
                    <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium">{item.products?.sku}</td>
                      <td className="py-3 px-4 font-medium text-foreground">{item.products?.name}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm tabular">
                        {item.quantity} {item.products?.unit_of_measure}
                      </td>

                      {canValidate && (
                        <td className="py-3 px-4 text-right font-mono tabular">
                          {avail ? `${avail.available} ${item.products?.unit_of_measure}` : '—'}
                        </td>
                      )}

                      {canValidate && (
                        <td className="py-3 px-4 text-center">
                          {avail ? (
                            avail.is_sufficient ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="size-3" /> In Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                                <XCircle className="size-3" /> Insufficient ({avail.available} left)
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      )}

                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                        £{Number(item.unit_price || 0).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        £{lineTotal.toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
