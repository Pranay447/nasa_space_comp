import type { AnalysisResponse, Dataset } from './types'

export interface AnalysisQuery {
  datasetId: string
  startYear: number
  endYear: number
  a: string
  b: string | null
}

export function analysisParams(q: AnalysisQuery): string {
  const p = new URLSearchParams({
    dataset: q.datasetId,
    start: String(q.startYear),
    end: String(q.endYear),
    a: q.a,
  })
  if (q.b) p.set('b', q.b)
  return p.toString()
}

export function queryKey(q: AnalysisQuery): string {
  return `${q.datasetId}|${q.startYear}|${q.endYear}|${q.a}|${q.b ?? ''}`
}

async function fail(r: Response): Promise<never> {
  let detail = `${r.status} ${r.statusText}`
  try {
    const j = await r.json()
    if (j?.detail) detail = String(j.detail)
  } catch {
    /* not JSON */
  }
  throw new Error(detail)
}

export async function fetchDatasets(signal?: AbortSignal): Promise<{ datasets: Dataset[] }> {
  const r = await fetch('/api/datasets', { signal })
  if (!r.ok) await fail(r)
  return r.json()
}

export async function fetchAnalysis(q: AnalysisQuery, signal?: AbortSignal): Promise<AnalysisResponse> {
  const r = await fetch(`/api/analysis?${analysisParams(q)}`, { signal })
  if (!r.ok) await fail(r)
  return r.json()
}

export const csvUrl = (q: AnalysisQuery) => `/api/analysis.csv?${analysisParams(q)}`

export const GRID = { nlat: 90, nlon: 180, cell: 2, missing: -32768 }

/** Annual frames: Int16, hundredths of °C, [year][lat south→north][lon west→east]. */
export async function fetchAnnualFrames(start: number, end: number, signal?: AbortSignal): Promise<Int16Array> {
  const r = await fetch(`/api/grid/annual?start=${start}&end=${end}`, { signal })
  if (!r.ok) await fail(r)
  return new Int16Array(await r.arrayBuffer())
}

/** Trend field: Int16, thousandths of °C per decade, [lat][lon]. Slope magnitude only. */
export async function fetchTrendField(start: number, end: number, signal?: AbortSignal): Promise<Int16Array> {
  const r = await fetch(`/api/grid/trend?start=${start}&end=${end}`, { signal })
  if (!r.ok) await fail(r)
  return new Int16Array(await r.arrayBuffer())
}
