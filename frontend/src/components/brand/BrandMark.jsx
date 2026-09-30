import { useId } from 'react'

// The Crickrida mark ("Play K"): a K whose leg is a bat, with a ball and seam.
// Generated from bleedblue/tools/brand_mark.py so every rendering matches.
// The stem follows the text colour; the bat is the site's cyan, the ball its magenta.
export default function BrandMark({ className = '', title }) {
  const mask = `crSeam${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 244 240" className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <defs>
        <mask id={mask}>
          <rect width="244" height="240" fill="#fff" />
          <path d="M103.5,137.8 L239.4,-60.0 M112.6,144.0 L248.5,-53.8" stroke="#000" strokeWidth="4.5" strokeLinecap="round" />
        </mask>
      </defs>
      <path d="M0,0 L66,0 L66,98 L0,194Z" fill="currentColor" />
      <path d="M61.4,125.9 L95.7,76 L238.4,234.1 Q243.8,240 235.8,240 L164.4,240Z" fill="#00E5FF" />
      <circle cx="176" cy="42" r="39" fill="#FF2D78" mask={`url(#${mask})`} />
    </svg>
  )
}
