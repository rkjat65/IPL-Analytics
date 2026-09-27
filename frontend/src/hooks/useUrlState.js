import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// Like useState, but stored in the query string so filtered views can be
// shared and survive a refresh. Default values are left out of the URL.
export default function useUrlState(key, defaultValue = '') {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const isNumber = typeof defaultValue === 'number'
  const value = raw === null ? defaultValue : (isNumber ? Number(raw) || defaultValue : raw)

  const setValue = useCallback((next) => {
    setParams(prev => {
      const p = new URLSearchParams(prev)
      if (next === defaultValue || next === '' || next == null) p.delete(key)
      else p.set(key, String(next))
      return p
    }, { replace: true })
  }, [key, defaultValue, setParams])

  return [value, setValue]
}
