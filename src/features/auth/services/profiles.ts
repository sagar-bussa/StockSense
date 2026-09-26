import { supabase } from '@/lib/supabase/client'
import type { Profile } from '../types'

/** The subset of a profile a user is allowed to change about themselves. */
export type ProfilePatch = Pick<Partial<Profile>, 'full_name' | 'avatar_url' | 'phone'>

/**
 * Read the signed-in user's profile via RPC rather than a direct `profiles`
 * select. The RPC resolves the warehouse grants in the same round-trip and
 * works regardless of which column-level grants the caller holds.
 *
 * Passing no id asks the database to use `auth.uid()`, which is both simpler
 * and safer: the client cannot accidentally read somebody else's profile by
 * sending their id.
 *
 * The function is declared `returns table (...)`, so the payload is a
 * single-element array rather than an object.
 */
export async function getProfile(userId?: string | null): Promise<Profile | null> {
  const { data, error } = await supabase.rpc('get_my_profile', {
    p_user_id: userId ?? undefined,
  })

  if (error) throw error

  const row = (data ?? [])[0]
  if (!row) return null

  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    avatar_url: row.avatar_url,
    phone: row.phone,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // The underlying grant column is nullable, so the RPC can return null here
    // even though the type says string[].
    warehouse_ids: row.warehouse_ids ?? [],
  }
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw error
}
