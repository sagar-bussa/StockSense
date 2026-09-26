import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'

/** Full-screen loader shown while the initial session resolves. */
export function AuthLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Loading StockSense…</p>
      </div>
    </div>
  )
}

/**
 * Gate for authenticated routes.
 *
 * Waits for the session to resolve before deciding, otherwise a page refresh
 * would bounce every signed-in user to `/login` for a frame - the classic
 * "flash of the login screen" bug.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <AuthLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <>{children}</>
}

/** Keeps signed-in users away from the login/signup screens. */
export function RequireAnonymous({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth()
  if (isLoading) return <AuthLoader />
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}
