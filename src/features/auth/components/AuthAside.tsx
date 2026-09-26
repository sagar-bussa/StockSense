import { Boxes, PackageCheck, ShieldCheck, TrendingUp } from 'lucide-react'

const HIGHLIGHTS = [
  {
    icon: PackageCheck,
    title: 'Every movement, accounted for',
    body: 'Receipts, deliveries, transfers and adjustments all write an immutable ledger entry.',
  },
  {
    icon: TrendingUp,
    title: 'Low stock before it bites',
    body: 'Reorder levels are watched continuously, so you know what needs attention first.',
  },
  {
    icon: ShieldCheck,
    title: 'Correct by construction',
    body: 'Stock changes happen inside atomic database transactions, never in the browser.',
  },
]

/**
 * Left-hand brand panel for the authentication screens. Deliberately hidden
 * below `lg` where the form needs the full width.
 */
export function AuthAside() {
  return (
    <aside className="relative hidden w-[46%] shrink-0 flex-col justify-between border-r bg-card p-10 lg:flex xl:p-14">
      <div className="flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
          <Boxes className="size-5 text-primary-foreground" aria-hidden />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">StockSense</span>
      </div>

      <div className="max-w-md">
        <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-balance xl:text-[32px]">
          Inventory control that answers instantly.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          One place for products, warehouses, stock levels and the complete history of every unit that
          moved.
        </p>

        <ul className="mt-9 space-y-5">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-primary">
                <Icon className="size-4" aria-hidden />
              </div>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        Stock operations are validated server-side and logged for audit.
      </p>
    </aside>
  )
}
