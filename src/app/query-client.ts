import { QueryClient } from '@tanstack/react-query'

/**
 * The app's single QueryClient.
 *
 * It lives in its own module rather than in `app/providers.tsx` because
 * `AuthProvider` needs it (to clear cached data on sign-out) while
 * `providers.tsx` renders `AuthProvider`. Keeping it here means neither module
 * imports the other, so there is no initialisation-order cycle.
 *
 * Retries are disabled for queries: a failed Supabase request will fail again
 * on retry, and silently retrying turns a "connection lost" banner into an
 * infinite spinner. Mutations also do not retry, because they are not idempotent
 * - a double submission is rejected by the database's own guards, not here.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
})
