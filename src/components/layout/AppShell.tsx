import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { WarehouseScopeProvider } from '@/features/warehouses/WarehouseScopeProvider'
import { useAuth } from '@/features/auth/AuthProvider'

const COLLAPSE_KEY = 'stocksense.sidebarCollapsed'

/** Routes are code-split; this is the placeholder while a chunk loads. */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">Loading…</span>
    </div>
  )
}

/**
 * A profile that failed to load leaves the user with a shell that cannot load
 * any data. Say so plainly and offer the one action that can fix it, rather than
 * letting them click through empty pages wondering what they did wrong.
 */
function ProfileError({ message }: { message: string }) {
  const { refreshProfile, signOut } = useAuth()

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center">
        <h2 className="text-sm font-semibold">Your account could not be loaded</h2>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => void refreshProfile()}
            className="h-9 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="h-9 rounded-md border px-3.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

/** The frame around every authenticated route. */
export function AppShell() {
  const { profile, profileError } = useAuth()
  const [collapsed, setCollapsed] = useState(
    () => window.localStorage.getItem(COLLAPSE_KEY) === '1',
  )
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        // Storage can be unavailable; the preference simply will not persist.
      }
      return next
    })
  }, [])

  // Cmd/Ctrl+K opens search, Escape closes everything. Matches every other tool
  // the team already uses, so nobody has to learn it.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false)
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const openCommandPalette = useCallback(() => {
    // Opening search from the mobile drawer must not leave the drawer on top of
    // the palette, so close both together.
    setMobileOpen(false)
    setPaletteOpen(true)
  }, [])

  return (
    <WarehouseScopeProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onOpenMobileNav={() => setMobileOpen(true)}
            onOpenCommandPalette={openCommandPalette}
          />

          <main className="min-w-0 flex-1 overflow-y-auto">
            {profileError && !profile ? (
              <ProfileError message={profileError} />
            ) : (
              <Suspense fallback={<RouteFallback />}>
                <Outlet />
              </Suspense>
            )}
          </main>
        </div>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </WarehouseScopeProvider>
  )
}
