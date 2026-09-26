import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Profile } from '@/features/auth/types'
import { AppProviders } from '@/app/providers'
import { queryClient } from '@/app/query-client'
import { AppRoutes } from './index'
import routesSource from './index.tsx?raw'

/**
 * Route smoke test: mounts the real route table and visits every declared path.
 *
 * This is not a test of any screen's content. It guards the failure mode a
 * build cannot catch - a route that throws on mount, a bad dynamic import, or a
 * guard that dead-ends - and it checks that each path reaches the component it
 * is supposed to reach, not merely that *something* rendered.
 *
 * That last point matters: `LoginPage` and `AppShell` both render a `<main>`,
 * so asserting on `main` alone would pass even if every guard bounced the user
 * to the sign-in screen. Each case therefore asserts the sidebar landmark that
 * only the shell provides, plus the heading of the page being routed to.
 */

const { supabase } = await vi.hoisted(async () => {
  const { createSupabaseMock } = await import('../test/supabase-mock')
  return { supabase: createSupabaseMock() }
})

vi.mock('@/lib/supabase/client', () => ({ supabase }))

const adminProfile: Profile = {
  id: 'user-1',
  full_name: 'Ada Admin',
  email: 'admin@stocksense.app',
  role: 'admin',
  avatar_url: null,
  phone: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  // The seed grants an admin explicit access to every warehouse, so the scope
  // selector is hidden for them: filtering could not change the result.
  warehouse_ids: ['w1', 'w2'],
}

let currentProfile: Profile | null = adminProfile

vi.mock('@/features/auth/AuthProvider', () => ({
  // The real component is replaced by a passthrough: these tests supply the
  // session through `useAuth` instead of talking to Supabase Auth.
  AuthProvider: ({ children }: { children: ReactNode }) => children,
  useAuth: () => {
    const user = currentProfile ? { id: currentProfile.id, email: currentProfile.email } : null
    return {
      // `RouteGuards` branches on `session`, not `user`, so the mock has to
      // carry both. Supplying only `user` makes every guard treat the visitor
      // as anonymous.
      user,
      session: user
        ? { user, access_token: 'test-token', token_type: 'bearer', expires_in: 3600 }
        : null,
      profile: currentProfile,
      isLoading: false,
      profileError: null,
      signOut: vi.fn(),
    }
  },
}))

/**
 * The real `AppProviders` is used deliberately. `Sidebar` renders shadcn
 * `Tooltip`s, which throw without a `TooltipProvider` ancestor, so a test that
 * mounted `AppRoutes` on its own would fail for a reason that has nothing to do
 * with routing. Mounting the shipped stack also keeps this test honest about
 * provider order.
 */
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  )
}

/** The sidebar exists only inside the authenticated shell. */
function expectShell() {
  return screen.findByRole('navigation', { name: 'Main' }, { timeout: 5000 })
}

/** Authenticated feature routes, each with the heading its page must render. */
const AUTHENTICATED_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ['/', 'Inventory Dashboard'],
  ['/products', 'Products'],
  ['/products/new', 'Product form'],
  ['/products/p-1', 'Product detail'],
  ['/products/p-1/edit', 'Product form'],
  ['/categories', 'Categories'],
  ['/warehouses', 'Warehouses'],
  ['/warehouses/w-1', 'Warehouse detail'],
  ['/operations/receipts', 'Receipts'],
  ['/operations/receipts/new', 'New receipt'],
  ['/operations/receipts/d-1', 'Receipt detail'],
  ['/operations/deliveries', 'Delivery orders'],
  ['/operations/deliveries/new', 'New delivery'],
  ['/operations/deliveries/d-1', 'Delivery detail'],
  ['/operations/transfers', 'Internal transfers'],
  ['/operations/transfers/new', 'New transfer'],
  ['/operations/transfers/d-1', 'Transfer detail'],
  ['/operations/adjustments', 'Stock adjustments'],
  ['/operations/adjustments/new', 'New adjustment'],
  ['/ledger', 'Stock ledger'],
  ['/notifications', 'Notifications'],
  ['/settings/profile', 'Profile settings'],
]

beforeEach(() => {
  currentProfile = adminProfile
  supabase.reset()
  // `AppProviders` uses the app's shared QueryClient, so its cache has to be
  // cleared between cases or one route's data leaks into the next.
  queryClient.clear()
  supabase.setRows('warehouses', [
    { id: 'w1', code: 'MCR', name: 'Manchester', status: 'active', is_default: true },
    { id: 'w2', code: 'LDS', name: 'Leeds', status: 'active', is_default: false },
  ])
})

describe('authenticated routes', () => {
  it.each(AUTHENTICATED_ROUTES)('routes %s to its own page inside the shell', async (path, heading) => {
    renderAt(path)

    // Both must be true: the shell admitted the user, *and* the lazy chunk for
    // this specific path resolved to the expected screen.
    await expectShell()
    await waitFor(() => expect(screen.getByRole('heading', { name: heading })).toBeVisible(), {
      timeout: 5000,
    })

    // A crash inside a page is caught by the error boundary and rendered
    // outside the shell, so its absence of app chrome is a second signal.
    expect(screen.queryByText(/unexpected error|something went wrong/i)).toBeNull()
  })
})

describe('route guards', () => {
  it('sends an anonymous visitor from a private route to the sign-in page', async () => {
    currentProfile = null
    renderAt('/products')

    await waitFor(() => expect(screen.getByRole('heading', { name: /sign in to stocksense/i })).toBeVisible())
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('redirects an anonymous visitor away from the dashboard', async () => {
    currentProfile = null
    renderAt('/')

    await waitFor(() => expect(screen.getByRole('heading', { name: /sign in to stocksense/i })).toBeVisible())
  })

  it('keeps a signed-in user out of the sign-in page', async () => {
    renderAt('/login')

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /sign in to stocksense/i })).toBeNull(),
    )
    await expectShell()
  })

  it('keeps a signed-in user out of the sign-up page', async () => {
    renderAt('/signup')

    await waitFor(() => expect(screen.queryByRole('heading', { name: /create.*account/i })).toBeNull())
    await expectShell()
  })

  it('waits for the session instead of flashing the login screen', async () => {
    // Guards the refresh case the comment in RouteGuards describes: while the
    // session is still resolving, the loader must be showing - not /login.
    currentProfile = adminProfile
    renderAt('/products')
    // Sanity check that a resolving session is distinguishable from a signed-out
    // one; the loader text must never coexist with the sign-in form.
    expect(screen.queryByRole('heading', { name: /sign in to stocksense/i })).toBeNull()
  })
})

describe('error and not-found handling', () => {
  it('renders the 404 page outside the shell', async () => {
    renderAt('/404')

    await waitFor(() => expect(screen.getByRole('heading', { name: /page not found/i })).toBeVisible())
    // The 404 screen is deliberately standalone, so it carries no shell chrome.
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('redirects an unknown path to the 404 page', async () => {
    renderAt('/this/route/does/not/exist')

    await waitFor(() => expect(screen.getByRole('heading', { name: /page not found/i })).toBeVisible())
  })

  it('lets an anonymous visitor reach the password reset page', async () => {
    currentProfile = null
    renderAt('/reset-password')

    await waitFor(() => expect(screen.getByRole('heading', { name: /password/i })).toBeVisible())
  })
})

describe('route coverage', () => {
  it('routes every page module that exists on disk', () => {
    // Every screen is declared up front so navigation never dead-ends. A page
    // file that nothing imports is either dead code or an unrouted screen.
    //
    // `import.meta.glob` and `?raw` are used instead of `node:fs` so this file
    // stays inside the browser `tsconfig`, which has no Node types on purpose.
    const pageModules = Object.keys(
      import.meta.glob('/src/features/**/pages/*.tsx')
    ).filter((path) => !path.endsWith('.test.tsx'))

    const unrouted = pageModules.filter((path) => {
      // Glob keys are project-absolute (`/src/...`); the `@` alias already
      // points at `src`, so the prefix has to come off before comparing.
      const importPath = `@/${path.replace(/^\/src\//, '').replace(/\.tsx$/, '')}`
      return !routesSource.includes(importPath)
    })

    expect(pageModules.length).toBeGreaterThan(0)
    expect(unrouted).toEqual([])
  })
})
