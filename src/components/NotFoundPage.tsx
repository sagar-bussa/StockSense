import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 text-center">
      <div className="mb-5 flex size-12 items-center justify-center rounded-full border bg-card text-muted-foreground">
        <Compass className="size-5" aria-hidden />
      </div>
      <p className="text-[13px] font-medium text-primary">404</p>
      <h1 className="mt-1.5 text-lg font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        The page you are looking for does not exist or has moved.
      </p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link to="/">Go to dashboard</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/products">Browse products</Link>
        </Button>
      </div>
    </div>
  )
}
