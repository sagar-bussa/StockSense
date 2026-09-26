import { CheckCircle2, Clock, AlertTriangle, XCircle, PlayCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DocumentStatus = 'draft' | 'waiting' | 'ready' | 'done' | 'canceled'
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

const DOC_CONFIG: Record<
  DocumentStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  draft: {
    label: 'Draft',
    icon: Clock,
    className: 'bg-muted text-muted-foreground border-border/80',
  },
  waiting: {
    label: 'Waiting',
    icon: Clock,
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  ready: {
    label: 'Ready',
    icon: PlayCircle,
    className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
  done: {
    label: 'Done',
    icon: CheckCircle2,
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  canceled: {
    label: 'Canceled',
    icon: XCircle,
    className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
}

const STOCK_CONFIG: Record<
  StockStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  in_stock: {
    label: 'In Stock',
    icon: CheckCircle2,
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  low_stock: {
    label: 'Low Stock',
    icon: AlertTriangle,
    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  out_of_stock: {
    label: 'Out of Stock',
    icon: XCircle,
    className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  },
}

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: DocumentStatus | StockStatus | string
  size?: 'sm' | 'md'
}) {
  const isDoc = status in DOC_CONFIG
  const isStock = status in STOCK_CONFIG

  const config = isDoc
    ? DOC_CONFIG[status as DocumentStatus]
    : isStock
      ? STOCK_CONFIG[status as StockStatus]
      : {
          label: String(status),
          icon: Clock,
          className: 'bg-muted text-muted-foreground border-border',
        }

  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
        config.className,
      )}
    >
      <Icon className={cn(size === 'sm' ? 'size-3' : 'size-3.5')} aria-hidden />
      <span>{config.label}</span>
    </span>
  )
}
