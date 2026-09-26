import { useState } from 'react'
import { ChevronDown, UserRound } from 'lucide-react'

/**
 * Seeded demo accounts. Rendered only when the environment is flagged as a
 * demo so this never appears in a real deployment.
 *
 * Enabled by setting `VITE_SHOW_DEMO_ACCOUNTS=true`.
 */
const DEMO_PASSWORD = 'StockSense123!'

const ACCOUNTS = [
  {
    email: 'admin@stocksense.app',
    role: 'Admin',
    blurb: 'Full access, including warehouses and roles.',
  },
  {
    email: 'manager@stocksense.app',
    role: 'Inventory Manager',
    blurb: 'Products plus every inventory operation.',
  },
  {
    email: 'staff@stocksense.app',
    role: 'Warehouse Staff',
    blurb: 'Scoped to Main Warehouse operations only.',
  },
]

const showDemo = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'

export function DemoAccounts({ onPick }: { onPick: (email: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!showDemo) return null

  return (
    <div className="mt-6 rounded-md border border-dashed bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[13px] font-medium"
      >
        <span className="flex items-center gap-2">
          <UserRound className="size-3.5 text-muted-foreground" aria-hidden />
          Demo accounts
        </span>
        <ChevronDown
          className={`size-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <ul className="border-t">
          {ACCOUNTS.map((account) => (
            <li key={account.email} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(account.email)}
                className="w-full px-3.5 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">{account.role}</span>
                  <code className="text-[11px] text-muted-foreground">{account.email}</code>
                </span>
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                  {account.blurb} · password {DEMO_PASSWORD}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
