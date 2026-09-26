import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import { queryClient } from '@/app/query-client'
import { getProfile } from './services/profiles'
import type { AuthContextValue, AuthState, Profile } from './types'

const AuthContext = createContext<AuthContextValue | null>(null)

const initialState: AuthState = {
  session: null,
  user: null,
  profile: null,
  isLoading: true,
  profileError: null,
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)

  /**
   * Load the signed-in user's profile. A missing profile means the signup
   * trigger did not fire, which is a real deployment problem - surface it
   * rather than leaving the user with a blank dashboard forever.
   */
  const loadProfile = useCallback(async (user: User | null): Promise<Profile | null> => {
    if (!user) {
      setState((prev) => ({ ...prev, profile: null, profileError: null }))
      return null
    }
    try {
      const profile = await getProfile(user.id)
      if (!profile) {
        setState((prev) => ({
          ...prev,
          profile: null,
          profileError:
            'Your account profile could not be loaded. Please sign out and sign in again.',
        }))
        return null
      }
      setState((prev) => ({ ...prev, profile, profileError: null }))
      return profile
    } catch (error) {
      setState((prev) => ({
        ...prev,
        profile: null,
        profileError:
          error instanceof Error
            ? error.message
            : 'Your account profile could not be loaded. Please try again.',
      }))
      return null
    }
  }, [])

  useEffect(() => {
    let active = true

    /**
     * Supabase fires this immediately with the persisted session on load and
     * again on every refresh / sign-out. Listening is what keeps a manual
     * browser refresh signed in - reading the session once would not be
     * enough, because the token refresh itself triggers another event.
     */
    const { data } = supabase.auth.onAuthStateChange((event, session: Session | null) => {
      if (!active) return

      // TOKEN_REFRESHED and INITIAL_SESSION fire far more often than a real
      // identity change. Re-reading the profile on every refresh would make
      // the app feel unstable for no reason.
      const isIdentityChange =
        event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED'

      if (event === 'SIGNED_OUT') {
        // Cached data belongs to the previous user. Never show it to the next.
        queryClient.clear()
        setState({ session: null, user: null, profile: null, isLoading: false, profileError: null })
        return
      }

      setState((prev) => ({ ...prev, session, user: session?.user ?? null, isLoading: false }))

      if (isIdentityChange || event === 'INITIAL_SESSION') {
        void loadProfile(session?.user ?? null)
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUp = useCallback<AuthContextValue['signUp']>(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error

    // When email confirmation is enabled there is no session yet; the UI
    // routes to a "check your inbox" state instead of the dashboard.
    return { needsEmailConfirmation: !data.session }
  }, [])

  const signOut = useCallback<AuthContextValue['signOut']>(async () => {
    await supabase.auth.signOut()
    queryClient.clear()
  }, [])

  const requestPasswordReset = useCallback<AuthContextValue['requestPasswordReset']>(
    async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
    },
    [],
  )

  const updatePassword = useCallback<AuthContextValue['updatePassword']>(async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }, [])

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    await loadProfile(data.user)
  }, [loadProfile])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signUp, signOut, requestPasswordReset, updatePassword, refreshProfile }),
    [state, signIn, signUp, signOut, requestPasswordReset, updatePassword, refreshProfile],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthContextValue {
  const context = use(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.')
  return context
}
