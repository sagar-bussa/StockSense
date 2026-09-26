import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Inline form-level feedback. Used for submit failures so the message sits
 * next to the form rather than only in a toast, which is easy to miss.
 */
export function FormAlert({
  variant = 'error',
  children,
  className,
}: {
  variant?: 'error' | 'success' | 'info'
  children: React.ReactNode
  className?: string
}) {
  const Icon = variant === 'error' ? AlertCircle : variant === 'success' ? CheckCircle2 : AlertCircle

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] leading-relaxed',
        variant === 'error' && 'border-destructive/25 bg-destructive-soft text-destructive',
        variant === 'success' && 'border-success/25 bg-success-soft text-success',
        variant === 'info' && 'border-info/25 bg-info-soft text-info',
        className,
      )}
    >
      <Icon className="mt-px size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  )
}

/** Consistent submit button that shows progress and blocks double submission. */
export function SubmitButton({
  pending,
  children,
  pendingLabel = 'Please wait',
  className,
  ...props
}: {
  pending: boolean
  children: React.ReactNode
  pendingLabel?: string
} & React.ComponentProps<'button'>) {
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending}
      className={cn(
        'inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60',
        className,
      )}
      {...props}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {pending ? pendingLabel : children}
    </button>
  )
}
