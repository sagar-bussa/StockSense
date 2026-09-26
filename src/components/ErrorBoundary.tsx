import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface State {
  error: Error | null
}

/**
 * Last line of defence. Catches render-time failures so a bug in one route
 * shows a recoverable message instead of a white screen.
 */
export class ErrorBoundary extends Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface to the browser console; wire to your error reporter here.
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-xs">
          <div className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-destructive-soft text-destructive">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <h1 className="text-base font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The interface hit an unexpected error. Reloading usually clears it.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RefreshCw className="size-4" aria-hidden />
            Reload StockSense
          </button>
        </div>
      </div>
    )
  }
}
