import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { getErrorMessage, getStatus } from '../api/errors'

interface ApiState<T> {
  data: T | null
  error: string | null
  status: number | undefined
  loading: boolean
}

/**
 * Load data on mount (and when `deps` change) with loading and error state.
 * Stale responses from an earlier call are ignored. `setData` lets a page swap in
 * fresh data from a mutation without refetching.
 */
export function useApi<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<ApiState<T>>({ data: null, error: null, status: undefined, loading: true })
  const callId = useRef(0)
  const loadFn = useCallback(load, deps)

  const run = useCallback(async () => {
    const id = ++callId.current
    setState((current) => ({ ...current, loading: true, error: null, status: undefined }))
    try {
      const data = await loadFn()
      if (id === callId.current) setState({ data, error: null, status: undefined, loading: false })
    } catch (error) {
      if (id === callId.current)
        setState({ data: null, error: getErrorMessage(error), status: getStatus(error), loading: false })
    }
  }, [loadFn])

  useEffect(() => {
    void run()
  }, [run])

  const setData = useCallback((data: T) => setState({ data, error: null, status: undefined, loading: false }), [])

  return { ...state, reload: run, setData }
}
