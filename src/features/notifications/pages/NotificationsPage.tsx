import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/features/auth/AuthProvider'
import {
  listNotifications,
  markRead,
  markAllRead,
  subscribeToNotifications,
  type Notification,
} from '@/features/notifications/services/notifications'
import { cn } from '@/lib/utils'

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'Just now'

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

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertOctagon,
    badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900',
    iconClass: 'text-red-500 bg-red-500/10',
    label: 'Critical',
  },
  warning: {
    icon: AlertTriangle,
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900',
    iconClass: 'text-amber-500 bg-amber-500/10',
    label: 'Warning',
  },
  info: {
    icon: Info,
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900',
    iconClass: 'text-blue-500 bg-blue-500/10',
    label: 'Information',
  },
} as const

type FilterTab = 'all' | 'unread' | 'critical' | 'info'

export function NotificationsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')

  const { data: notifications = [], isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['notifications', 'full-list'],
    queryFn: () => listNotifications(100),
    enabled: Boolean(user),
  })

  // Real-time synchronization
  useEffect(() => {
    if (!user) return
    return subscribeToNotifications(user.id, () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })
  }, [user, queryClient])

  const markOneMutation = useMutation({
    mutationFn: markRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllMutation = useMutation({
    mutationFn: markAllRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  )

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      // Tab filter
      if (activeTab === 'unread' && n.is_read) return false
      if (activeTab === 'critical' && n.severity !== 'critical' && n.severity !== 'warning') return false
      if (activeTab === 'info' && n.severity !== 'info') return false

      // Text search
      if (search.trim()) {
        const query = search.toLowerCase()
        const matchTitle = n.title?.toLowerCase().includes(query)
        const matchMessage = n.message?.toLowerCase().includes(query)
        const matchType = n.type?.toLowerCase().includes(query)
        if (!matchTitle && !matchMessage && !matchType) return false
      }

      return true
    })
  }, [notifications, activeTab, search])

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="px-2 py-0.5 text-xs font-semibold tabular-nums">
                {unreadCount} unread
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time operational alerts, low-stock warnings, and warehouse movement notices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading || isRefetching}
            className="h-9 gap-1.5 text-xs font-medium"
          >
            <RefreshCw className={cn('size-3.5', (isLoading || isRefetching) && 'animate-spin')} />
            Refresh
          </Button>

          {unreadCount > 0 && (
            <Button
              variant="default"
              size="sm"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="h-9 gap-1.5 text-xs font-medium shadow-sm"
            >
              <CheckCheck className="size-4" />
              Mark all as read
            </Button>
          )}
        </div>
      </div>

      {/* Control Bar: Tabs & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === 'all'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span>All</span>
            <span className="rounded-full bg-background/20 px-1.5 py-0.2 text-[10px] tabular-nums">
              {notifications.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('unread')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === 'unread'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-destructive text-destructive-foreground px-1.5 py-0.2 text-[10px] font-semibold tabular-nums">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('critical')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === 'critical'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <AlertTriangle className="size-3 text-amber-500" />
            <span>Alerts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              activeTab === 'info'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Info className="size-3 text-blue-500" />
            <span>System</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alerts..."
            className="h-8 pl-8 text-xs bg-card"
          />
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-xl border bg-card p-12 text-center shadow-xs">
            <RefreshCw className="mx-auto size-6 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Loading your notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/60 p-12 text-center backdrop-blur-xs">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="size-6 text-primary" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-foreground">
              {search ? 'No matching notifications' : 'All caught up!'}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {search
                ? `No alerts match "${search}". Try clearing your search.`
                : activeTab === 'unread'
                ? 'You have read all your notifications.'
                : 'There are no active notifications in this category.'}
            </p>
            {search && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearch('')}
                className="mt-4 text-xs"
              >
                Clear filter
              </Button>
            )}
          </div>
        ) : (
          filteredNotifications.map((n: Notification) => {
            const config = SEVERITY_CONFIG[n.severity] || SEVERITY_CONFIG.info
            const SeverityIcon = config.icon

            return (
              <div
                key={n.id}
                className={cn(
                  'group relative flex flex-col gap-3 rounded-xl border p-4 transition-all duration-150 sm:flex-row sm:items-start sm:justify-between',
                  n.is_read
                    ? 'bg-card/70 hover:bg-card hover:border-border/90'
                    : 'bg-card border-primary/20 shadow-xs ring-1 ring-primary/10'
                )}
              >
                {/* Left side: Icon & Text content */}
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', config.iconClass)}>
                    <SeverityIcon className="size-4.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className={cn('text-sm font-semibold tracking-tight', !n.is_read && 'text-foreground')}>
                        {n.title}
                      </h4>
                      <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-4.5 font-medium', config.badgeClass)}>
                        {config.label}
                      </Badge>
                      {n.type && (
                        <span className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
                          • {n.type.replace(/_/g, ' ')}
                        </span>
                      )}
                      {!n.is_read && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                          New
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {n.message}
                    </p>

                    <div className="mt-2.5 flex items-center gap-4 text-[11px] text-muted-foreground/80">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {relativeTime(n.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0 pt-2 sm:pt-0">
                  {n.link && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
                      onClick={() => {
                        if (!n.is_read) markOneMutation.mutate(n.id)
                      }}
                    >
                      <Link to={n.link}>
                        <span>View</span>
                        <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                  )}

                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => markOneMutation.mutate(n.id)}
                      disabled={markOneMutation.isPending}
                      title="Mark as read"
                    >
                      <CheckCircle2 className="size-3.5 mr-1" />
                      Read
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
