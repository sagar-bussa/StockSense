import { useNavigate } from 'react-router-dom'
import { LogOut, Menu, Moon, Search, Sun, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/features/auth/AuthProvider'
import { ROLE_LABELS } from '@/features/auth/types'
import { useTheme } from 'next-themes'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { NotificationBell } from './NotificationBell'
import { WarehouseSelector } from './WarehouseSelector'

/** Two-letter monogram from a name, e.g. "Jordan Blake" -> "JB". */
function initials(name: string | null | undefined, fallback: string): string {
  const source = name?.trim() || fallback
  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

export function Topbar({
  onOpenMobileNav,
  onOpenCommandPalette,
}: {
  onOpenMobileNav: () => void
  onOpenCommandPalette: () => void
}) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()

  const displayName = profile?.full_name?.trim() || user?.email || 'Signed in'
  const roleLabel = profile ? ROLE_LABELS[profile.role] : null

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-sm sm:px-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onOpenMobileNav}
        aria-label="Open navigation menu"
        className="lg:hidden"
      >
        <Menu className="size-[18px]" aria-hidden />
      </Button>

      {/* Global search - opens the command palette */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="group flex h-9 flex-1 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted sm:max-w-md"
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Search products, SKUs, documents…</span>
        <kbd className="hidden shrink-0 rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5">
        <WarehouseSelector />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {resolvedTheme === 'dark' ? <Sun className="size-[18px]" aria-hidden /> : <Moon className="size-[18px]" aria-hidden />}
        </Button>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-9 items-center gap-2 rounded-md px-1 pr-2 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label="Account menu"
            >
              <Avatar className="size-7">
                <AvatarFallback className="bg-primary/10 text-[11px] font-semibold text-primary">
                  {initials(profile?.full_name, user?.email ?? 'U')}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-left lg:block">
                <span className="block max-w-[9rem] truncate text-[13px] leading-tight font-medium">
                  {displayName}
                </span>
                {roleLabel && (
                  <span className="block text-[11px] leading-tight text-muted-foreground">{roleLabel}</span>
                )}
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-[13px] font-medium">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              {roleLabel && (
                <Badge variant="secondary" className="mt-1.5 text-[10px]">
                  {roleLabel}
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/settings/profile')}>
              <UserRound className="size-4" aria-hidden />
              Profile settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                void signOut()
              }}
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
