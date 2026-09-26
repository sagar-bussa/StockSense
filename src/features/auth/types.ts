import type { Session, User } from '@supabase/supabase-js'

/**
 * Roles mirror the Postgres `app_role` enum exactly. This is a const object
 * rather than a TS `enum` because `erasableSyntaxOnly` is on, and because
 * narrowing works better on plain string-literal unions.
 */
export const ROLES = ['admin', 'inventory_manager', 'warehouse_staff'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  inventory_manager: 'Inventory Manager',
  warehouse_staff: 'Warehouse Staff',
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: 'Full system access including warehouses, users and roles.',
  inventory_manager: 'Manages products and every inventory operation.',
  warehouse_staff: 'Processes receipts, deliveries, transfers and stock counts.',
}

/** The `profiles` row for the signed-in user, joined with its warehouse grants. */
export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  role: Role
  avatar_url: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  /** Warehouses this user may read stock for. Managers and admins get all. */
  warehouse_ids: string[]
}

/**
 * Mirrors the database's role checks. These gate the UI only - the real
 * enforcement is Row Level Security plus the `SECURITY DEFINER` RPCs, which
 * decide regardless of what the client sends. Never treat these as a security
 * boundary; they exist so users do not get buttons that will fail.
 */
export const can = {
  manageCatalog: (role: Role | undefined) => role === 'admin' || role === 'inventory_manager',
  manageWarehouses: (role: Role | undefined) => role === 'admin',
  viewLedger: (_role: Role | undefined) => true,
  postOperations: (_role: Role | undefined) => true,
  manageUsers: (role: Role | undefined) => role === 'admin',
}

export type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True until the initial session + profile load settles. Avoids auth flash. */
  isLoading: boolean
  /** Set when the session exists but the profile could not be loaded. */
  profileError: string | null
}

export type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsEmailConfirmation: boolean }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AUTH_STORAGE_KEY = 'stocksense.lastEmail'
