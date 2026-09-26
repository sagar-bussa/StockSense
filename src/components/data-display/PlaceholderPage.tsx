import { Construction } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/**
 * Temporary landing page for modules still being built. Every route resolves so
 * there are no dead links, and each one names its home in the sidebar.
 */
export function PlaceholderPage({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full border bg-muted text-muted-foreground">
        <Construction className="size-5" aria-hidden />
      </div>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        This module is being built in {phase}. The route is wired so navigation and layout stay
        testable while it is in progress.
      </p>
      <Button variant="outline" size="sm" className="mt-5" asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
