import { useCallback, useEffect, useState } from 'react'
import { fetchAnnualFrames, fetchTrendField } from './api'

export interface GridData {
  start: number
  end: number
  frames: Int16Array // hundredths of °C, [year][lat][lon]
  trend: Int16Array | null // thousandths of °C per decade, [lat][lon]
}

export interface GridState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: GridData | null
  error: string | null
  retry: () => void
}

/** Loads the annual map frames and slope field for the analysis window. Independent of the chart request. */
export function useGrid(start: number, end: number, enabled: boolean): GridState {
  const [state, setState] = useState<Omit<GridState, 'retry'>>({ status: 'idle', data: null, error: null })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', data: null, error: null })
      return
    }
    const ac = new AbortController()
    setState((s) => ({ status: 'loading', data: s.data, error: null }))
    Promise.all([
      fetchAnnualFrames(start, end, ac.signal),
      end - start + 1 >= 3 ? fetchTrendField(start, end, ac.signal) : Promise.resolve(null),
    ])
      .then(([frames, trend]) => setState({ status: 'ready', data: { start, end, frames, trend }, error: null }))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setState({ status: 'error', data: null, error: e.message })
      })
    return () => ac.abort()
  }, [start, end, enabled, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { ...state, retry }
}
