import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ExternalLink,
  Package,
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
import { fetchReceiptById, validateReceiptRPC, cancelReceiptRPC } from '../services/receipts'
import { friendlyError } from '@/lib/supabase/errors'
import { toast } from 'sonner'

export function ReceiptDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const queryClient = useQueryClient()

  const [confirmValidateOpen, setConfirmValidateOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const receiptQuery = useQuery({
    queryKey: ['receipt-detail', documentId],
    queryFn: () => (documentId ? fetchReceiptById(documentId) : null),
    enabled: !!documentId,
  })

  const data = receiptQuery.data
  const receipt = data?.receipt
  const items = data?.items ?? []

  const isDone = receipt?.status === 'done'
  const isCanceled = receipt?.status === 'canceled'
  const canValidate = !isDone && !isCanceled

  const handleValidate = async () => {
    if (!documentId) return
    setIsProcessing(true)
    try {
      await validateReceiptRPC(documentId)
      toast.success('Receipt validated successfully! Inventory has been increased.')
      setConfirmValidateOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['receipt-detail', documentId] })
      void queryClient.invalidateQueries({ queryKey: ['receipts'] })
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
      await cancelReceiptRPC(documentId, cancelReason.trim())
      toast.success('Receipt canceled')
      setCancelOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['receipt-detail', documentId] })
      void queryClient.invalidateQueries({ queryKey: ['receipts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setIsProcessing(false)
    }
  }

  if (receiptQuery.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!receipt) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold">Receipt detail</h1>
        <p className="mt-2 text-sm text-muted-foreground">Receipt order not found.</p>
        <Link to="/operations/receipts" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            Back to Receipts
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
          <Link to="/operations/receipts">
            <Button variant="outline" size="icon" className="size-8" title="Back to receipts">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Receipt detail
              </h1>
              <span className="font-mono text-sm font-semibold">{receipt.receipt_number}</span>
              <StatusBadge status={receipt.status} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vendor delivery order and stock intake verification.
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
                className="h-8 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="size-3.5" /> Validate Receipt
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

      {/* Confirmation Dialog for Validation */}
      <Dialog open={confirmValidateOpen} onOpenChange={setConfirmValidateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              Confirm Goods Receipt Validation
            </DialogTitle>
            <DialogDescription className="text-xs pt-2">
              You are about to validate receipt <strong className="font-mono">{receipt.receipt_number}</strong>.
              <br />
              <br />
              This will automatically:
              <ul className="list-disc pl-5 mt-2 space-y-1 text-foreground">
                <li>Increase inventory quantities in <strong>{receipt.warehouses?.name} / {receipt.locations?.name}</strong></li>
                <li>Write immutable entries into the <strong>Stock Ledger</strong></li>
                <li>Update inventory KPIs and stock alerts across the system</li>
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
              {isProcessing ? 'Validating…' : 'Confirm & Increase Stock'}
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
                Cancel Receipt
              </DialogTitle>
              <DialogDescription className="text-xs">
                Provide a reason for canceling this receipt order. Canceled orders are kept for audit history.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-2">
              <Label htmlFor="cancel-reason" className="text-xs font-semibold">
                Cancellation Reason <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="cancel-reason"
                placeholder="e.g. Duplicate order raised in error"
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

      {/* Status Banner */}
      {isDone && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <span>
              <strong>Receipt Completed:</strong> Stock was posted to inventory on{' '}
              {receipt.validated_at ? new Date(receipt.validated_at).toLocaleString() : 'Done'}.
            </span>
          </div>
        </div>
      )}

      {isCanceled && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-800 dark:text-rose-300">
          <strong>Canceled:</strong> {receipt.cancel_reason || 'Order canceled.'}
        </div>
      )}

      {/* Metadata Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Supplier Information</CardDescription>
            <CardTitle className="text-base font-semibold">{receipt.suppliers?.name || '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Contact: {receipt.suppliers?.contact_name || '—'}</p>
            <p>Email: {receipt.suppliers?.email || '—'}</p>
            <p>PO Reference: <strong className="font-mono text-foreground">{receipt.reference || '—'}</strong></p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Destination Zone</CardDescription>
            <CardTitle className="text-base font-semibold">{receipt.warehouses?.name || '—'}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Location: <strong className="text-foreground">{receipt.locations?.name || '—'}</strong></p>
            <p>Location Code: <span className="font-mono">{receipt.locations?.code || '—'}</span></p>
            <p>Intake Date: {new Date(receipt.created_at).toLocaleDateString()}</p>
          </CardContent>
        </Card>

        <Card className="border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">Audit Information</CardDescription>
            <CardTitle className="text-base font-semibold">
              {receipt.profiles_created?.full_name || receipt.profiles_created?.email || 'System'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>Created by: {receipt.profiles_created?.email || '—'}</p>
            {receipt.validated_at && (
              <p>Validated by: {receipt.profiles_validated?.full_name || receipt.profiles_validated?.email || 'Staff'}</p>
            )}
            <p>Order Status: <span className="font-semibold capitalize text-foreground">{receipt.status}</span></p>
          </CardContent>
        </Card>
      </div>

      {/* Items Table */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="size-4 text-primary" />
            Received Product Lines ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Product Name</th>
                  <th className="py-2.5 px-4 text-right">Quantity</th>
                  <th className="py-2.5 px-4 text-right">Unit Cost</th>
                  <th className="py-2.5 px-4 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const lineTotal = Number(item.quantity) * Number(item.unit_cost || 0)
                  return (
                    <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium">{item.products?.sku}</td>
                      <td className="py-3 px-4 font-medium text-foreground">{item.products?.name}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-sm tabular">
                        {item.quantity} {item.products?.unit_of_measure}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                        £{Number(item.unit_cost || 0).toFixed(2)}
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
