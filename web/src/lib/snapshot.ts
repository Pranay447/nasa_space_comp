import { queryKey } from './api'
import type { AnalysisQuery } from './api'
import { signed } from './format'
import { fitSnapshot } from './snapshotFit'
import { gridSnapshot, readWindow, regionSnapshot } from './snapshotGrid'
import type { GridIndex, SnapshotSeries } from './snapshotGrid'
import type { AnalysisResponse, Dataset, Fit, Method, Region, RegionResult } from './types'

interface Snapshot {
  method: Method
  critical: Record<number, number>
  grid: GridIndex
  series: Record<string, Record<string, SnapshotSeries>>
}

async function dataFile<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/data/${path}`, { signal })
  if (!response.ok) throw new Error('The bundled NASA dataset could not be loaded.')
  return response.json()
}

let snapshot: Snapshot | undefined
async function getSnapshot(signal: AbortSignal) {
  if (!snapshot) snapshot = await dataFile<Snapshot>('snapshot/index.json', signal)
  return snapshot
}

function resolveRegion(dataset: Dataset, ref: string): Region {
  const named = dataset.supportedRegions.find((region) => region.id === ref)
  if (named) return named
  if (!dataset.customRegions || !ref.startsWith('box:')) {
    throw new Error(`This region is unavailable for ${dataset.shortTitle}.`)
  }
  const pieces = ref.slice(4).split(',')
  const [w, south, e, north] = pieces.map(Number)
  if (pieces.length !== 4 || pieces.some((part) => !part.trim() || !Number.isFinite(Number(part)))
    || south < -90 || south >= north || north > 90) throw new Error('The custom box coordinates are invalid.')
  const wrap = (lon: number) => ((lon + 180) % 360 + 360) % 360 - 180
  const west = e - w >= 360 ? -180 : wrap(w)
  const wrappedEast = wrap(e)
  const east = e - w >= 360 || (wrappedEast === -180 && west !== -180) ? 180 : wrappedEast
  if (west === east) throw new Error('The custom box has zero width.')
  const ns = (v: number) => `${Math.abs(v)}°${v >= 0 ? 'N' : 'S'}`
  const ew = (v: number) => `${Math.abs(v)}°${v >= 0 ? 'E' : 'W'}`
  return { id: ref, label: `Box ${ns(south)}–${ns(north)}, ${ew(west)}–${ew(east)}`,
    kind: 'box', bounds: { west, south, east, north } }
}

function descriptive(fit: Fit, reason: string): Fit {
  return { ...fit, state: 'insufficient_data', inferenceAvailable: false, descriptiveOnly: true,
    ciLow: null, ciHigh: null, pValue: null, reason }
}

function resultText(fit: Fit, dataset: Dataset, subject: string) {
  if (fit.slopePerDecade === null) return fit.reason ?? 'No trend could be estimated.'
  const rate = `${signed(fit.slopePerDecade, dataset.digits)} ${dataset.rateUnit}`
  const period = `${fit.usedStartYear}–${fit.usedEndYear}`
  if (fit.state === 'supported_increase' || fit.state === 'supported_decrease') {
    return `${subject} ${fit.state === 'supported_increase' ? 'increased' : 'decreased'} at a rate of ${rate}, ${period}.`
  }
  if (fit.state === 'inconclusive') return `${subject} had an estimated trend of ${rate}, ${period}. Evidence is inconclusive.`
  return `Descriptive trend of ${rate}, ${period}. ${fit.reason ?? ''}`
}

export async function analysisSnapshot(query: AnalysisQuery, signal: AbortSignal): Promise<AnalysisResponse> {
  const [meta, registry] = await Promise.all([
    getSnapshot(signal), dataFile<{ datasets: Dataset[] }>('datasets.json', signal),
  ])
  signal.throwIfAborted()
  const dataset = registry.datasets.find((d) => d.datasetId === query.datasetId && d.status === 'available')
  if (!dataset) throw new Error('The selected dataset is unavailable.')
  const { startYear, endYear } = query
  if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear < dataset.period.startYear
    || endYear > dataset.period.endYear || endYear < startYear) {
    throw new Error(`Choose years from ${dataset.period.startYear} to ${dataset.period.endYear}.`)
  }
  const selected = (query.b ? [query.a, query.b] : [query.a]).map((id) => resolveRegion(dataset, id))
  if (selected[1] && JSON.stringify(selected[0].bounds) === JSON.stringify(selected[1].bounds)) {
    throw new Error('Choose two different regions to compare.')
  }
  const years = Array.from({ length: endYear - startYear + 1 }, (_, i) => startYear + i)
  const blocks = dataset.customRegions ? await readWindow(meta.grid, startYear, endYear, signal) : null
  const method = { ...meta.method, library: 'Trend Atlas browser calculation' }
  const regions = selected.map((region): RegionResult => {
    const series = blocks ? regionSnapshot(blocks, region.bounds, startYear)
      : meta.series[dataset.datasetId]?.[region.id]
    if (!series) throw new Error('The bundled regional data are unavailable.')
    const annualSeries = years.map((year) => ({ year, value: series.annual[year - series.years[0]] ?? null }))
    const monthlySeries = series.monthly?.filter((point) => point.year >= startYear && point.year <= endYear) ?? null
    const { coverage } = series
    let fit = fitSnapshot(annualSeries, method, meta.critical)
    if (coverage.known && coverage.fraction === 0) {
      fit = { ...fit, state: 'no_spatial_coverage', reason: 'No grid cell in this region has a value in every month of the window.' }
    } else if (coverage.known && coverage.fraction !== null && coverage.fraction < (coverage.threshold ?? 0) && fit.inferenceAvailable) {
      fit = descriptive(fit, `Valid cells cover ${Math.round(coverage.fraction * 100)}% of the region, below the ${(coverage.threshold ?? 0) * 100}% threshold. The slope is descriptive only.`)
    }
    return { region, annualSeries, monthlySeries, coverage, fit, statement: resultText(fit, dataset, dataset.noun) }
  })
  const [a, b] = regions
  let paired: AnalysisResponse['paired'] = null
  if (b) {
    const annualSeries = a.annualSeries.map((point, i) => {
      const other = b.annualSeries[i].value
      return { year: point.year, value: point.value === null || other === null ? null : point.value - other }
    })
    let fit = fitSnapshot(annualSeries, method, meta.critical)
    if (fit.inferenceAvailable && !(a.fit.inferenceAvailable && b.fit.inferenceAvailable)) {
      fit = descriptive(fit, 'Inference is unavailable for at least one region, so the paired slope is descriptive only.')
    }
    const differenceOfSlopesCheck = a.fit.slopePerDecade !== null && b.fit.slopePerDecade !== null
      ? a.fit.slopePerDecade - b.fit.slopePerDecade : null
    paired = { label: 'A minus B', annualSeries, fit, differenceOfSlopesCheck,
      statement: resultText(fit, dataset, 'The difference between the two regions') }
  }
  const ids = selected.map((region) => region.id)
  const exploratory = startYear !== dataset.defaultWindow.startYear || endYear !== dataset.defaultWindow.endYear
    || ids.join('|') !== dataset.defaultRegions.join('|')
  return { queryKey: queryKey(query), methodVersion: method.version, method, dataset,
    request: { datasetId: dataset.datasetId, startYear, endYear, regions: ids }, regions, paired, exploratory,
    exploratoryNote: exploratory ? 'User-chosen region or period: treat this analysis as exploratory.' : null }
}

export async function mapSnapshot(start: number, end: number, signal: AbortSignal) {
  return gridSnapshot((await getSnapshot(signal)).grid, start, end, signal)
}
