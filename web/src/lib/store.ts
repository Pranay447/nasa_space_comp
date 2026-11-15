import { create } from 'zustand'
import { canUseSnapshot, fetchAnalysis, fetchDatasets, queryKey } from './api'
import type { AnalysisQuery } from './api'
import type { AnalysisResponse, Dataset, Layer, Mode, Projection } from './types'

/**
 * Single source of truth for the atlas. The analysis request (dataset, regions,
 * year window) is separate from display state (selected frame year, projection,
 * mode, layer): changing display state never refetches or changes results.
 */
export interface AtlasState {
  datasets: Dataset[] | null
  datasetsError: string | null

  // analysis request
  datasetId: string
  a: string
  b: string | null
  startYear: number
  endYear: number

  // display state
  frameYear: number
  projection: Projection
  mode: Mode
  layer: Layer
  fieldVisible: boolean
  theme: 'dark' | 'light'

  analysis: {
    status: 'idle' | 'loading' | 'ready' | 'error'
    key: string | null
    data: AnalysisResponse | null
    error: string | null
    offline: boolean
  }

  loadDatasets: () => Promise<void>
  setDataset: (id: string) => void
  setRegion: (slot: 'a' | 'b', ref: string | null) => void
  swapRegions: () => void
  setYears: (start: number, end: number) => void
  setFrameYear: (y: number) => void
  setProjection: (p: Projection) => void
  setMode: (m: Mode) => void
  setLayer: (l: Layer) => void
  setFieldVisible: (visible: boolean) => void
  setTheme: (t: 'dark' | 'light') => void
  applyUrl: (p: URLSearchParams) => void
  retry: () => void
}

export const DEFAULTS = {
  datasetId: 'gistemp-zonal',
  a: 'zonal:64N-90N',
  b: 'zonal:90S-64S' as string | null,
  startYear: 2001,
  endYear: 2024,
}

const query = (s: AtlasState): AnalysisQuery => ({
  datasetId: s.datasetId, startYear: s.startYear, endYear: s.endYear, a: s.a, b: s.b,
})
export const currentQuery = () => query(useAtlas.getState())

let controller: AbortController | null = null

async function run(set: (p: Partial<AtlasState>) => void, get: () => AtlasState) {
  const q = query(get())
  const key = queryKey(q)
  controller?.abort()
  const request = new AbortController()
  controller = request
  const prev = get().analysis
  set({ analysis: { status: 'loading', key, data: prev.data, error: null, offline: false } })
  try {
    const data = await fetchAnalysis(q, request.signal)
    if (request.signal.aborted) return
    set({ analysis: { status: 'ready', key, data: { ...data, queryKey: key }, error: null, offline: false } })
  } catch (e) {
    if (request.signal.aborted) return
    let error = e
    if (canUseSnapshot(e)) {
      try {
        const { analysisSnapshot } = await import('./snapshot')
        const data = await analysisSnapshot(q, request.signal)
        if (request.signal.aborted) return
        set({ analysis: { status: 'ready', key, data, error: null, offline: true } })
        return
      } catch (fallbackError) { error = fallbackError }
    }
    if (request.signal.aborted) return
    set({ analysis: { status: 'error', key, data: null, error: (error as Error).message, offline: false } })
  }
}

export const useAtlas = create<AtlasState>((set, get) => ({
  datasets: null,
  datasetsError: null,
  ...DEFAULTS,
  frameYear: DEFAULTS.endYear,
  projection: 'globe',
  mode: 'explore',
  layer: 'observed',
  fieldVisible: false,
  theme: 'dark',
  analysis: { status: 'idle', key: null, data: null, error: null, offline: false },

  loadDatasets: async () => {
    try {
      const { datasets } = await fetchDatasets()
      set({ datasets, datasetsError: null })
    } catch (e) {
      try {
        const r = await fetch('/data/datasets.json')
        set({ datasets: (await r.json()).datasets, datasetsError: 'offline' })
      } catch {
        set({ datasetsError: (e as Error).message })
      }
    }
  },

  setDataset: (id) => {
    const d = get().datasets?.find((x) => x.datasetId === id)
    if (!d || d.status !== 'available') return
    const cur = get()
    // Keep regions that the new dataset also supports (same id), else its defaults.
    const ok = (ref: string | null) => !!ref && d.supportedRegions.some((r) => r.id === ref)
    const a = ok(cur.a) ? cur.a : d.defaultRegions[0]
    const b = ok(cur.b) && cur.b !== a ? cur.b : (d.defaultRegions[1] ?? null)
    const startYear = Math.max(d.period.startYear, Math.min(cur.startYear, d.period.endYear))
    const endYear = Math.max(startYear, Math.min(cur.endYear, d.period.endYear))
    set({
      datasetId: id, a, b, startYear, endYear,
      frameYear: Math.max(startYear, Math.min(get().frameYear, endYear)),
      layer: 'observed',
    })
    run(set, get)
  },

  setRegion: (slot, ref) => {
    if (ref === get()[slot]) return
    if (slot === 'a' && !ref) return
    if (ref && ref === (slot === 'a' ? get().b : get().a)) return
    set(slot === 'a' ? { a: ref as string } : { b: ref })
    run(set, get)
  },

  swapRegions: () => {
    const { a, b } = get()
    if (!b) return
    set({ a: b, b: a })
    run(set, get)
  },

  setYears: (start, end) => {
    const d = get().datasets?.find((x) => x.datasetId === get().datasetId)
    const lo = d?.period.startYear ?? 1880
    const hi = d?.period.endYear ?? 2025
    const s = Math.max(lo, Math.min(Math.round(start), hi))
    const e = Math.max(s, Math.min(Math.round(end), hi))
    if (s === get().startYear && e === get().endYear) return
    set({ startYear: s, endYear: e, frameYear: Math.max(s, Math.min(get().frameYear, e)) })
    run(set, get)
  },

  setFrameYear: (y) => set({ frameYear: Math.max(get().startYear, Math.min(y, get().endYear)) }),
  setProjection: (projection) => set({ projection }),
  setMode: (mode) => set({ mode }),
  setLayer: (layer) => set({ layer }),
  setFieldVisible: (fieldVisible) => set({ fieldVisible }),
  setTheme: (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },

  applyUrl: (p) => {
    const num = (k: string) => (p.get(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : null)
    const patch: Partial<AtlasState> = {}
    if (p.get('d')) patch.datasetId = p.get('d')!
    if (p.get('a')) patch.a = p.get('a')!
    if (p.has('b')) patch.b = p.get('b') || null
    if (num('y0') !== null) patch.startYear = num('y0')!
    if (num('y1') !== null) patch.endYear = num('y1')!
    if ((patch.endYear ?? get().endYear) < (patch.startYear ?? get().startYear)) patch.endYear = patch.startYear ?? get().startYear
    const f = num('f')
    const s = patch.startYear ?? get().startYear
    const e = patch.endYear ?? get().endYear
    patch.frameYear = Math.max(s, Math.min(f ?? e, e))
    if (p.get('p') === 'globe' || p.get('p') === 'mercator') patch.projection = p.get('p') as Projection
    if (p.get('m') === 'explore' || p.get('m') === 'analyze') patch.mode = p.get('m') as Mode
    if (p.get('l') === 'observed' || p.get('l') === 'trend') patch.layer = p.get('l') as Layer
    else patch.layer = 'observed'
    patch.fieldVisible = p.get('field') === '1' || patch.layer === 'trend'
    set(patch)
    run(set, get)
  },

  retry: () => { run(set, get) },
}))

/** Stable URL keys for the shareable state. */
export function stateToParams(s: AtlasState): URLSearchParams {
  const p = new URLSearchParams()
  p.set('d', s.datasetId)
  p.set('a', s.a)
  p.set('b', s.b ?? '')
  p.set('y0', String(s.startYear))
  p.set('y1', String(s.endYear))
  p.set('f', String(s.frameYear))
  p.set('p', s.projection)
  p.set('m', s.mode)
  p.set('l', s.layer)
  if (s.fieldVisible) p.set('field', '1')
  return p
}

export const useDataset = () => useAtlas((s) => s.datasets?.find((d) => d.datasetId === s.datasetId) ?? null)
