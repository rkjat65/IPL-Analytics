import { useState, useEffect, useCallback, useRef } from 'react'

export function useFetch(fetchFn, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Only the latest request may update state: switching filters quickly must
  // not let a slower, older response overwrite the newer one.
  const latest = useRef(0)

  const refetch = useCallback(async () => {
    const id = ++latest.current
    setLoading(true)
    setError(null)
    try {
      const result = await fetchFn()
      if (id === latest.current) setData(result)
    } catch (err) {
      if (id === latest.current) setError(err.message)
    } finally {
      if (id === latest.current) setLoading(false)
    }
  }, deps)

  useEffect(() => {
    refetch()
    // Invalidate in-flight requests when deps change or the component unmounts
    return () => { latest.current++ }
  }, [refetch])

  return { data, loading, error, refetch }
}
