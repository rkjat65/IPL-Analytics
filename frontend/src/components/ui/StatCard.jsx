import AnimatedNumber from './AnimatedNumber'

export default function StatCard({ label, value, delta, color = 'cyan', className = '' }) {
  const colorMap = {
    cyan: 'text-accent-cyan stat-glow-cyan',
    magenta: 'text-accent-magenta stat-glow-magenta',
    lime: 'text-accent-lime stat-glow-lime',
    amber: 'text-accent-amber stat-glow-amber',
  }

  return (
    <div className={`card animate-in ${className}`}>
      <p className="text-sm uppercase tracking-wider text-text-muted font-medium mb-1.5 font-mono">
        {label}
      </p>
      <p className={`text-3xl font-heading font-bold ${colorMap[color] || ''} leading-tight break-words`}>
        <AnimatedNumber value={value} />
      </p>
      {delta !== undefined && (
        <p className={`text-xs mt-1 ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
          {delta >= 0 ? '\u2191' : '\u2193'} {Math.abs(delta)}
        </p>
      )}
    </div>
  )
}
