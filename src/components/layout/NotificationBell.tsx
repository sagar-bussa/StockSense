import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  fetchUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  subscribeToNotifications,
  type Notification,
} from '@/features/notifications/services/notifications'
import { cn } from '@/lib/utils'

const COUNT_KEY = ['notifications', 'unread-count']
const LIST_KEY = ['notifications', 'list']

/** Icon tint per severity. Reserved for status, never decoration. */
const SEVERITY_CLASS: Record<Notification['severity'], string> = {
  info: 'text-info',
  warning: 'text-warning',
  critical: 'text-danger',
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
  ]
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  let chosen: [Intl.RelativeTimeFormatUnit, number] = units[0]!
  for (const unit of units) if (seconds >= unit[1]) chosen = unit
  return formatter.format(-Math.round(seconds / chosen[1]), chosen[0])
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: Notification
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/60',
        !notification.is_read && 'bg-primary/5',
      )}
    >
      <span className="flex items-start gap-2">
        <Bell
          className={cn('mt-0.5 size-3.5 shrink-0', SEVERITY_CLASS[notification.severity])}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{notification.title}</span>
            {!notification.is_read && (
              <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />
            )}
          </span>
          <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
            {notification.message}
          </span>
          <span className="mt-1 block text-[11px] text-muted-foreground/80">
            {relativeTime(notification.created_at)}
          </span>
        </span>
      </span>
    </button>
  )
}

export function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const countQuery = useQuery({
    queryKey: COUNT_KEY,
    queryFn: fetchUnreadCount,
    enabled: Boolean(user),
    refetchInterval: 60_000,
  })

  const listQuery = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => listNotifications(20),
    enabled: Boolean(user),
  })

  /**
   * Validating a receipt on a tablet should light up the bell on the office
   * desktop immediately.
   */
  useEffect(() => {
    if (!user) return
    return subscribeToNotifications(user.id, () => {
      void queryClient.invalidateQueries({ queryKey: COUNT_KEY })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    })
  }, [user, queryClient])

  const markOne = useMutation({
    mutationFn: markRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COUNT_KEY })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  const markAll = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COUNT_KEY })
      void queryClient.invalidateQueries({ queryKey: LIST_KEY })
    },
  })

  const unread = countQuery.data ?? 0
  const notifications = listQuery.data ?? []

  const openNotification = (notification: Notification) => {
    if (!notification.is_read) markOne.mutate(notification.id)
    if (notification.link) navigate(notification.link)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'
          }
        >
          <Bell className="size-[18px]" aria-hidden />
          {unread > 0 && (
            <span
              className="absolute top-1 right-1 flex min-w-[15px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-[15px] font-semibold text-destructive-foreground tabular"
              aria-hidden
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-88 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-[13px] font-semibold">Notifications</p>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="size-3.5" aria-hidden />
              Mark all read
            </Button>
          )}
        </div>

        {listQuery.isLoading ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Loading…</p>
        ) : notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            You have no notifications.
          </p>
        ) : (
          <ScrollArea className="max-h-96">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onOpen={() => openNotification(notification)}
              />
            ))}
          </ScrollArea>
        )}

        <div className="border-t p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-center text-xs"
            onClick={() => navigate('/notifications')}
          >
            View all notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
