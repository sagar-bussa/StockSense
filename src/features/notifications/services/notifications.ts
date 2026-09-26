import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

export type Notification = Database['public']['Tables']['notifications']['Row']

/** The most recent alerts for the signed-in user. RLS limits these to their own. */
export async function listNotifications(limit = 20): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

/**
 * How many alerts are unread. Computed by the database rather than by counting
 * a fetched page, so the badge is right even when the list is truncated.
 */
export async function fetchUnreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_notification_count')
  if (error) throw error
  return data ?? 0
}

export async function markRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  })
  if (error) throw error
}

export async function markAllRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_all_notifications_read')
  if (error) throw error
}

/**
 * Push notifications to `onChange` as they arrive.
 *
 * Returns an unsubscribe function. Row Level Security applies to the Realtime
 * payload as well as to a normal select, so the server only ever sends this
 * user's own rows - a bug in the filter below could not leak another account's
 * alerts, which is why the subscription is scoped by `user_id` for correctness
 * of intent rather than for safety.
 */
export function subscribeToNotifications(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
