export function Skeleton({ className = '' }) {
  return (
    <div
      className={`bg-bg-card-hover rounded animate-pulse ${className}`}
    />
  )
}

export function Spinner({ size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
  }

  return (
    <div
      className={`${sizes[size]} border-border-subtle border-t-accent-cyan rounded-full animate-spin ${className}`}
    />
  )
}

// Content-shaped placeholder instead of a spinner: the layout doesn't jump
// when data arrives, and it feels faster.
export default function Loading({ message = 'Loading...' }) {
  return (
    <div className="space-y-4 py-4" role="status" aria-live="polite">
      <span className="sr-only">{message}</span>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-20 rounded-lg bg-bg-card border border-border-subtle animate-pulse" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
      <div className="h-56 rounded-lg bg-bg-card border border-border-subtle animate-pulse" />
      <p className="text-center text-text-muted font-mono text-xs">{message}</p>
    </div>
  )
}
