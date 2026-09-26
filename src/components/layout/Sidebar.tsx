import { NavLink } from 'react-router-dom'
import { Boxes, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { NAV_GROUPS } from './nav-config'

/**
 * Primary navigation.
 *
 * Three presentations from one component:
 *  - `expanded`  full labels, desktop
 *  - `rail`      icon-only with tooltips, collapsed desktop / tablet
 *  - `overlay`   slide-over drawer, mobile
 */
export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileOpenChange,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
}) {
  const { profile } = useAuth()
  const role = profile?.role

  const isRail = collapsed && !mobileOpen

  const content = (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Brand */}
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-sidebar-border',
          isRail ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        <NavLink
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-md outline-offset-4"
          aria-label="StockSense dashboard"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary">
            <Boxes className="size-4 text-primary-foreground" aria-hidden />
          </span>
          {!isRail && <span className="truncate text-sm font-semibold tracking-tight">StockSense</span>}
        </NavLink>

        {!isRail && mobileOpen && (
          <span className="rounded bg-sidebar-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Demo
          </span>
        )}
      </div>

      {/* Nav */}
      <nav
        aria-label="Main"
        className="scrollbar-thin flex-1 overflow-y-auto px-2 py-3"
      >
        {NAV_GROUPS.map((group, groupIndex) => {
          const items = group.items.filter((item) => !item.hidden?.(role))
          if (items.length === 0) return null

          return (
            <div key={group.label ?? groupIndex} className={cn(groupIndex > 0 && 'mt-5')}>
              {group.label && !isRail && (
                <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
                  {group.label}
                </p>
              )}
              {group.label && isRail && <div className="mx-2 mb-2 border-t" />}

              <ul className="space-y-0.5">
                {items.map(({ label, to, icon: Icon, end }) => (
                  <li key={to}>
                    <Tooltip delayDuration={isRail ? 0 : 300}>
                      <TooltipTrigger asChild>
                        <NavLink
                          to={to}
                          end={end}
                          onClick={() => mobileOpen && onMobileOpenChange(false)}
                          className={({ isActive }) =>
                            cn(
                              'group flex h-9 items-center rounded-md text-[13px] font-medium transition-colors outline-offset-[-1px]',
                              isRail ? 'justify-center px-0' : 'gap-2.5 px-2.5',
                              isActive
                                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <Icon
                                className={cn(
                                  'size-4 shrink-0 transition-colors',
                                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                                )}
                                aria-hidden
                              />
                              {!isRail && <span className="truncate">{label}</span>}
                            </>
                          )}
                        </NavLink>
                      </TooltipTrigger>
                      {isRail && (
                        <TooltipContent side="right" sideOffset={8}>
                          {label}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </nav>

      {/* Collapse control - desktop only */}
      {!mobileOpen && (
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex h-9 w-full items-center rounded-md text-[13px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              collapsed ? 'justify-center' : 'gap-2.5 px-2.5',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="size-4" aria-hidden />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* Desktop: static column that shrinks to an icon rail */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-sidebar-border transition-[width] duration-200 ease-out lg:block',
          collapsed ? 'w-14' : 'w-60',
        )}
      >
        {content}
      </aside>

      {/* Mobile / tablet: slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[1px]"
            onClick={() => onMobileOpenChange(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-64 border-r shadow-lg">{content}</div>
        </div>
      )}
    </>
  )
}
