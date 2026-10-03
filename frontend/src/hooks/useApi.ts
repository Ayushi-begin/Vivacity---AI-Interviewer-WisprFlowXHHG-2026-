import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { getErrorMessage, getStatus } from '../api/errors'

interface Settled<T> {
  /** Which request this result belongs to. */
  request: string
  data: T | null
  error: string | null
  status: number | undefined
}

/**
 * Load data on mount (and when `deps` change) with loading and error state.
 * Stale responses from an earlier call are ignored. `setData` lets a page swap in
 * fresh data from a mutation (or a poll) without refetching. `deps` must be
 * JSON-serialisable values such as ids and page numbers.
 */
export function useApi<T>(load: () => Promise<T>, deps: DependencyList) {
  const [nonce, setNonce] = useState(0)
  const request = `${JSON.stringify(deps)}#${nonce}`
  const [settled, setSettled] = useState<Settled<T>>({ request: '', data: null, error: null, status: undefined })

  // Always call the latest `load`, without making it an effect dependency.
  const loadRef = useRef(load)
  const requestRef = useRef(request)
  useEffect(() => {
    loadRef.current = load
    requestRef.current = request
  })

  useEffect(() => {
    let current = true
    loadRef.current().then(
      (data) => {
        if (current) setSettled({ request, data, error: null, status: undefined })
      },
      (error: unknown) => {
        if (current) setSettled({ request, data: null, error: getErrorMessage(error), status: getStatus(error) })
      },
    )
    return () => {
      current = false
    }
  }, [request])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const setData = useCallback(
    (data: T) => setSettled({ request: requestRef.current, data, error: null, status: undefined }),
    [],
  )

  const loading = settled.request !== request
  return {
    // While reloading, the previous data stays visible; an old error doesn't.
    data: settled.data,
    error: loading ? null : settled.error,
    status: loading ? undefined : settled.status,
    loading,
    reload,
    setData,
  }
}
