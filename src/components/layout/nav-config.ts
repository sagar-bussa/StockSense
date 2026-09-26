import {
  ArrowLeftRight,
  Boxes,
  LayoutDashboard,
  Package,
  ScrollText,
  SlidersHorizontal,
  Truck,
  UserRound,
  Warehouse,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Role } from '@/features/auth/types'

export type NavItem = {
  label: string
  to: string
  icon: LucideIcon
  /** Also active on nested routes unless `end` is set. */
  end?: boolean
  /** Hidden from users whose role cannot use it. */
  hidden?: (role: Role | undefined) => boolean
}

export type NavGroup = {
  label?: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard, end: true },
      { label: 'Products', to: '/products', icon: Package },
      { label: 'Categories', to: '/categories', icon: Boxes },
      { label: 'Warehouses', to: '/warehouses', icon: Warehouse },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Receipts', to: '/operations/receipts', icon: Truck },
      { label: 'Deliveries', to: '/operations/deliveries', icon: Package },
      { label: 'Internal Transfers', to: '/operations/transfers', icon: ArrowLeftRight },
      { label: 'Adjustments', to: '/operations/adjustments', icon: SlidersHorizontal },
      { label: 'Stock Ledger', to: '/ledger', icon: ScrollText },
    ],
  },
  {
    label: 'Settings',
    items: [{ label: 'Profile', to: '/settings/profile', icon: UserRound }],
  },
]

/** Short labels for the mobile bottom bar, where horizontal space is tight. */
export const MOBILE_NAV: NavItem[] = [
  { label: 'Home', to: '/', icon: LayoutDashboard, end: true },
  { label: 'Products', to: '/products', icon: Package },
  { label: 'Receipts', to: '/operations/receipts', icon: Truck },
  { label: 'Stock', to: '/ledger', icon: ScrollText },
  { label: 'Profile', to: '/settings/profile', icon: UserRound },
]

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)
