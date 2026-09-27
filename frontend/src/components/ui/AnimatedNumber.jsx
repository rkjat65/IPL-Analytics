import { useEffect, useRef, useState } from 'react'
import useReducedMotion from '../../hooks/useReducedMotion'

// Parses "4,01,423", "162.2", "53.9%" or 1243 into parts we can count up to,
// keeping the original grouping style, decimals and suffix.
function parse(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? { n: value, decimals: String(value).split('.')[1]?.length || 0, prefix: '', suffix: '', grouped: false, indian: false } : null
  if (typeof value !== 'string') return null
  const m = value.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/)
  // Only plain numbers: leave dates, scores ("5/10") and seasons ("2007/08") alone
  if (!m || /\d/.test(m[1] + m[3]) || m[3].length > 12) return null
  const digits = m[2]
  const n = Number(digits.replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  const groups = digits.split('.')[0].split(',')
  return {
    n,
    decimals: digits.split('.')[1]?.length || 0,
    prefix: m[1],
    suffix: m[3],
    grouped: groups.length > 1,
    indian: groups.length > 2 && groups[1].length === 2,
  }
}

function format(n, p) {
  const opts = { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals, useGrouping: p.grouped }
  return p.prefix + n.toLocaleString(p.indian ? 'en-IN' : 'en-US', opts) + p.suffix
}

export default function AnimatedNumber({ value, duration = 900 }) {
  const reduced = useReducedMotion()
  const parsed = parse(value)
  const [shown, setShown] = useState(parsed && !reduced ? format(0, parsed) : value)
  const frame = useRef(0)

  useEffect(() => {
    const p = parse(value)
    if (!p || reduced) { setShown(value); return }
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setShown(t < 1 ? format(p.n * eased, p) : value)
      if (t < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [value, duration, reduced])

  return <span className="tabular-nums">{shown}</span>
}
