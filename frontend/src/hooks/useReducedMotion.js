import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

// True when the visitor asked their OS for less motion.
export default function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(QUERY).matches : false)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(QUERY)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}
