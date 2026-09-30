export default function Badge({ text, color = 'cyan' }) {
  const colorMap = {
    cyan: 'bg-accent-cyan/10 text-accent-cyan border-accent-cyan/20',
    magenta: 'bg-accent-magenta/10 text-accent-magenta border-accent-magenta/20',
    lime: 'bg-accent-lime/10 text-accent-lime border-accent-lime/20',
    amber: 'bg-accent-amber/10 text-accent-amber border-accent-amber/20',
    purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
    success: 'bg-success/10 text-success border-success/20',
    danger: 'bg-danger/10 text-danger border-danger/20',
    muted: 'bg-bg-card-hover text-text-secondary border-border-subtle',
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
        colorMap[color] || colorMap.cyan
      }`}
    >
      {text}
    </span>
  )
}
