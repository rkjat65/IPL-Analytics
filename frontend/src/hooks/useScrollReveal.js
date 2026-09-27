import { useEffect } from 'react'

// Fades cards in as they scroll into view. Only cards that start below the
// fold are hidden first, so nothing visible on load flickers.
export default function useScrollReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || !('IntersectionObserver' in window)) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('reveal-visible')
        entry.target.classList.remove('reveal-pending')
        io.unobserve(entry.target)
      })
    }, { root: null, rootMargin: '0px 0px -40px 0px', threshold: 0.08 })

    const seen = new WeakSet()
    const scan = () => {
      const viewportBottom = window.innerHeight
      root.querySelectorAll('.card').forEach(el => {
        if (seen.has(el)) return
        seen.add(el)
        if (el.getBoundingClientRect().top > viewportBottom) {
          el.classList.add('reveal-pending')
          io.observe(el)
        }
      })
    }
    scan()
    // Pages render data asynchronously; pick up cards as they appear.
    const mo = new MutationObserver(() => scan())
    mo.observe(root, { childList: true, subtree: true })
    return () => { io.disconnect(); mo.disconnect() }
  }, deps)
}
