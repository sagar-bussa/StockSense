import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Shield,
  Warehouse,
  KeyRound,
  Mail,
  CheckCircle2,
  Lock,
  LogOut,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useAuth } from '@/features/auth/AuthProvider'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, can } from '@/features/auth/types'
import { listAccessibleWarehouses } from '@/features/warehouses/services/warehouses'

function initials(name: string | null | undefined, fallback: string): string {
  const source = name?.trim() || fallback
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

export function ProfilePage() {
  const { profile, user, signOut, updatePassword } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const { data: warehouses = [], isLoading: isLoadingWarehouses } = useQuery({
    queryKey: ['warehouses', 'accessible'],
    queryFn: listAccessibleWarehouses,
  })

  const role = profile?.role ?? 'warehouse_staff'
  const roleLabel = profile ? ROLE_LABELS[profile.role] : 'User'
  const roleDesc = profile ? ROLE_DESCRIPTIONS[profile.role] : ''
  const displayName = profile?.full_name?.trim() || user?.email || 'Signed in User'

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.')
      return
    }

    try {
      setPasswordStatus('saving')
      setPasswordError(null)
      await updatePassword(newPassword)
      setPasswordStatus('success')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordStatus('idle'), 4000)
    } catch (err: unknown) {
      setPasswordStatus('error')
      setPasswordError(err instanceof Error ? err.message : 'Failed to update password')
    }
  }

  const permissions = [
    { label: 'Manage Product Catalog & Categories', allowed: can.manageCatalog(role) },
    { label: 'Manage Warehouse & Zone Configuration', allowed: can.manageWarehouses(role) },
    { label: 'Post Receipts, Deliveries & Transfers', allowed: can.postOperations(role) },
    { label: 'Audit Trail & Immutable Stock Ledger', allowed: can.viewLedger(role) },
    { label: 'User Provisioning & Role Assignments', allowed: can.manageUsers(role) },
  ]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Profile settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your account credentials, role permissions, and assigned warehouse locations.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void signOut()}
          className="h-9 gap-1.5 self-start text-xs text-destructive hover:bg-destructive/10 hover:text-destructive sm:self-center"
        >
          <LogOut className="size-3.5" />
          Sign out
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Left Column: Account Details & Permissions */}
        <div className="space-y-6 md:col-span-2">
          {/* Identity Card */}
          <Card className="shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Account Identity</CardTitle>
              <CardDescription className="text-xs">
                Your authenticated profile and assigned organizational role.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar className="size-16 border-2 border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-base font-bold text-primary">
                    {initials(profile?.full_name, user?.email ?? 'US')}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-bold tracking-tight text-foreground">
                      {displayName}
                    </h3>
                    <Badge variant="secondary" className="font-semibold text-xs bg-primary/10 text-primary border-primary/20">
                      {roleLabel}
                    </Badge>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Mail className="size-3.5" />
                    {user?.email}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2 text-xs">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-muted-foreground font-medium">Role Responsibility</p>
                  <p className="mt-1 font-semibold text-foreground">{roleDesc || 'Standard inventory staff access'}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-muted-foreground font-medium">Account Status</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-foreground">
                      {profile?.is_active ? 'Active & Authorized' : 'Active'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Role Permissions Card */}
          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <CardTitle className="text-base font-semibold">System Permissions & RBAC</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Authorizations enforced through PostgreSQL Row Level Security (RLS) policies.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y rounded-lg border text-xs">
                {permissions.map((perm, index) => (
                  <div key={index} className="flex items-center justify-between p-3">
                    <span className="font-medium text-foreground">{perm.label}</span>
                    {perm.allowed ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />
                        Granted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        Restricted
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Assigned Warehouses Card */}
          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="size-4 text-primary" />
                <CardTitle className="text-base font-semibold">Accessible Warehouses</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Facilities where your account has authorization to view or perform operations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingWarehouses ? (
                <div className="py-6 text-center text-xs text-muted-foreground">Loading facilities...</div>
              ) : warehouses.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No warehouse assignments found.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {warehouses.map((wh) => (
                    <div
                      key={wh.id}
                      className="flex items-start justify-between rounded-lg border bg-card p-3.5 transition-colors hover:border-primary/30"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-foreground">
                            {wh.code}
                          </span>
                          <h4 className="truncate text-xs font-semibold text-foreground">{wh.name}</h4>
                        </div>
                        {wh.address && (
                          <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                            {wh.address}
                          </p>
                        )}
                      </div>

                      {wh.status === 'active' && (
                        <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">
                          Active
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Security & Authentication */}
        <div className="space-y-6">
          {/* Security Credentials */}
          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-primary" />
                <CardTitle className="text-base font-semibold">Change Password</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Update your account password with at least 8 characters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">New Password</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-8 text-xs"
                    disabled={passwordStatus === 'saving'}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">Confirm Password</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-8 text-xs"
                    disabled={passwordStatus === 'saving'}
                  />
                </div>

                {passwordError && (
                  <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                    <AlertCircle className="size-3 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordStatus === 'success' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3 shrink-0" />
                    <span>Password updated successfully!</span>
                  </div>
                )}

                <Button
                  type="submit"
                  size="sm"
                  disabled={passwordStatus === 'saving' || !newPassword}
                  className="w-full h-8 text-xs mt-2"
                >
                  <KeyRound className="size-3.5 mr-1" />
                  {passwordStatus === 'saving' ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Session Info */}
          <Card className="shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Session Diagnostics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-muted-foreground">User ID</span>
                <span className="font-mono text-[11px] text-foreground truncate max-w-[140px]" title={user?.id}>
                  {user?.id ? `${user.id.slice(0, 10)}...` : '—'}
                </span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-muted-foreground">Auth Provider</span>
                <span className="font-medium text-foreground">Email / Supabase Auth</span>
              </div>
              <div className="flex justify-between border-b pb-1.5">
                <span className="text-muted-foreground">RLS Policy Scope</span>
                <span className="font-medium text-foreground">Enforced</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Registered</span>
                <span className="text-foreground">
                  {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Active'}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
