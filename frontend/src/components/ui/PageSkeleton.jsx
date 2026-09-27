// Placeholder shown while a page's code chunk downloads.
export default function PageSkeleton() {
  const block = 'rounded-xl bg-bg-card border border-border-subtle animate-pulse'
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-8 w-64 rounded-lg bg-bg-card animate-pulse" />
        <div className="h-4 w-96 max-w-full rounded bg-bg-card/70 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map(i => <div key={i} className={`${block} h-24`} style={{ animationDelay: `${i * 80}ms` }} />)}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className={`${block} h-72 lg:col-span-2`} />
        <div className={`${block} h-72`} />
      </div>
    </div>
  )
}
