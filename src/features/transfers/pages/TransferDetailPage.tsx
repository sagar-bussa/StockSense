import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  ExternalLink,
  Package,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { fetchTransferById, validateTransferRPC, cancelTransferRPC } from '../services/transfers'
import { friendlyError } from '@/lib/supabase/errors'
import { toast } from 'sonner'

export function TransferDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const queryClient = useQueryClient()

  const [confirmValidateOpen, setConfirmValidateOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  const transferQuery = useQuery({
    queryKey: ['transfer-detail', documentId],
    queryFn: () => (documentId ? fetchTransferById(documentId) : null),
    enabled: !!documentId,
  })

  const data = transferQuery.data
  const transfer = data?.transfer
  const items = data?.items ?? []

  const isDone = transfer?.status === 'done'
  const isCanceled = transfer?.status === 'canceled'
  const canValidate = !isDone && !isCanceled

  const handleValidate = async () => {
    if (!documentId) return
    setIsProcessing(true)
    try {
      await validateTransferRPC(documentId)
      toast.success('Internal transfer completed! Stock relocated across zones.')
      setConfirmValidateOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['transfer-detail', documentId] })
      void queryClient.invalidateQueries({ queryKey: ['transfers'] })
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
      await cancelTransferRPC(documentId, cancelReason.trim())
      toast.success('Transfer order canceled')
      setCancelOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['transfer-detail', documentId] })
      void queryClient.invalidateQueries({ queryKey: ['transfers'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setIsProcessing(false)
    }
  }

  if (transferQuery.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!transfer) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold">Transfer detail</h1>
        <p className="mt-2 text-sm text-muted-foreground">Transfer order not found.</p>
        <Link to="/operations/transfers" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            Back to Transfers
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
          <Link to="/operations/transfers">
            <Button variant="outline" size="icon" className="size-8" title="Back to transfers">
              <ArrowLeft className="size-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                Transfer detail
              </h1>
              <span className="font-mono text-sm font-semibold">{transfer.transfer_number}</span>
              <StatusBadge status={transfer.status} size="sm" />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Move inventory between warehouse facilities or designated storage bays.
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
                <CheckCircle2 className="size-3.5" /> Validate Transfer
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

      {/* Movement Flow Visual Banner */}
      <Card className="border bg-gradient-to-r from-card to-muted/30">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            {/* Origin Zone */}
            <div className="flex items-center gap-3.5">
              <div className="rounded-lg bg-rose-500/10 p-3 text-rose-600 dark:text-rose-400">
                <Warehouse className="size-6" />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider block">
                  Origin (Source)
                </span>
                <h3 className="text-base font-bold text-foreground mt-0.5">
                  {transfer.source_warehouse?.name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  Zone: {transfer.source_location?.name} ({transfer.source_location?.code})
                </p>
              </div>
            </div>

            {/* Direction Arrow */}
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-background/80 shadow-xs">
                <ArrowRightLeft className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Relocating</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </div>
            </div>

            {/* Target Zone */}
            <div className="flex items-center gap-3.5">
              <div className="rounded-lg bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
                <Warehouse className="size-6" />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                  Target (Destination)
                </span>
                <h3 className="text-base font-bold text-foreground mt-0.5">
                  {transfer.dest_warehouse?.name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">
                  Zone: {transfer.dest_location?.name} ({transfer.dest_location?.code})
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmValidateOpen} onOpenChange={setConfirmValidateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              Confirm Internal Stock Transfer
            </DialogTitle>
            <DialogDescription className="text-xs pt-2">
              You are validating transfer <strong className="font-mono">{transfer.transfer_number}</strong>.
              <br />
              <br />
              <strong>Transfer Integrity Rules:</strong>
              <ul className="list-disc pl-5 mt-2 space-y-1 text-foreground">
                <li>Quantity will be deducted from <strong>{transfer.source_warehouse?.name} / {transfer.source_location?.name}</strong></li>
                <li>Quantity will be added to <strong>{transfer.dest_warehouse?.name} / {transfer.dest_location?.name}</strong></li>
                <li><strong>Total company stock remains unchanged.</strong></li>
                <li>Two immutable audit records (Transfer Out & Transfer In) will be written into the ledger.</li>
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
              {isProcessing ? 'Relocating…' : 'Confirm & Move Stock'}
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
                Cancel Transfer Order
              </DialogTitle>
              <DialogDescription className="text-xs">
                Provide a reason for canceling this internal transfer.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-2">
              <Label htmlFor="trf-cancel-reason" className="text-xs font-semibold">
                Cancellation Reason <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="trf-cancel-reason"
                placeholder="e.g. Raised against wrong location"
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
              <strong>Transfer Completed:</strong> Goods were relocated successfully on{' '}
              {transfer.validated_at ? new Date(transfer.validated_at).toLocaleString() : 'Done'}.
            </span>
          </div>
        </div>
      )}

      {isCanceled && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-800 dark:text-rose-300">
          <strong>Canceled:</strong> {transfer.cancel_reason || 'Order canceled.'}
        </div>
      )}

      {/* Line Items Table */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Package className="size-4 text-primary" />
            Transfer Product Lines ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/60 border-b text-muted-foreground font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4">SKU</th>
                  <th className="py-2.5 px-4">Product Name</th>
                  <th className="py-2.5 px-4 text-right">Transfer Quantity</th>
                  <th className="py-2.5 px-4 text-right">Unit of Measure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium">{item.products?.sku}</td>
                    <td className="py-3 px-4 font-medium text-foreground">{item.products?.name}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-sm tabular">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-muted-foreground">
                      {item.products?.unit_of_measure}
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
