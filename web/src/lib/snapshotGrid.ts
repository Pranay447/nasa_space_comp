import { GRID } from './api'
import type { Bounds, Coverage, MonthlyPoint } from './types'

export const CELLS = GRID.nlat * GRID.nlon
export interface GridIndex { start: number; end: number; chunkYears: number }
export interface SnapshotSeries {
  years: number[]
  annual: (number | null)[]
  monthly: MonthlyPoint[] | null
  coverage: Coverage
}

const snapshots = new Map<number, Int16Array>()
async function readChunk(index: GridIndex, start: number, signal: AbortSignal) {
  const cached = snapshots.get(start)
  if (cached) return cached
  const response = await fetch(`/data/snapshot/${start}.bin.gz`, { signal })
  if (!response.ok) throw new Error(`Bundled NASA grid unavailable for ${start}.`)
  const blob = await response.blob()
  const magic = new Uint8Array(await blob.slice(0, 2).arrayBuffer())
  const bytes = magic[0] === 31 && magic[1] === 139
    ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
    : await blob.arrayBuffer()
  signal.throwIfAborted()
  const count = Math.min(index.chunkYears, index.end - start + 1) * 12 * CELLS
  if (bytes.byteLength !== count * 2) throw new Error(`Invalid bundled NASA grid for ${start}.`)
  const values = new Int16Array(count)
  const view = new DataView(bytes)
  for (let i = 0; i < count; i++) values[i] = view.getInt16(i * 2, true)
  if (snapshots.size >= 6) snapshots.delete(snapshots.keys().next().value!)
  snapshots.set(start, values)
  return values
}

export async function readWindow(index: GridIndex, start: number, end: number, signal: AbortSignal) {
  if (start < index.start || end > index.end || start > end) {
    throw new Error(`Map data supports years ${index.start}–${index.end}.`)
  }
  const first = index.start + Math.floor((start - index.start) / index.chunkYears) * index.chunkYears
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i)
  const starts = Array.from({ length: Math.floor((end - first) / index.chunkYears) + 1 }, (_, i) => first + i * index.chunkYears)
  const chunks = await Promise.all(starts.map((year) => readChunk(index, year, signal)))
  return years.map((year) => {
    const chunk = Math.floor((year - first) / index.chunkYears)
    const offset = (year - starts[chunk]) * 12 * CELLS
    return chunks[chunk].subarray(offset, offset + 12 * CELLS)
  })
}

function dayWeights(year: number) {
  return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(year, i + 1, 0)).getUTCDate())
}

function roundHalfEven(number: number) {
  const floor = Math.floor(number)
  return number - floor === .5 ? floor + (floor % 2 === 0 ? 0 : 1) : Math.round(number)
}

export async function gridSnapshot(index: GridIndex, start: number, end: number, signal: AbortSignal) {
  const blocks = await readWindow(index, start, end, signal)
  const frames = new Int16Array(blocks.length * CELLS).fill(GRID.missing)
  const numerator = new Float64Array(CELLS)
  const trend = blocks.length >= 3 ? new Int16Array(CELLS).fill(GRID.missing) : null
  const mid = (blocks.length - 1) / 2
  const xx = blocks.length * (blocks.length ** 2 - 1) / 12
  for (const [i, block] of blocks.entries()) {
    const days = dayWeights(start + i)
    const daysInYear = days.reduce((a, b) => a + b, 0)
    const sums = new Float64Array(CELLS)
    for (let month = 0; month < 12; month++) {
      const offset = month * CELLS
      for (let c = 0; c < CELLS; c++) {
        const raw = block[offset + c]
        sums[c] += raw === GRID.missing ? NaN : Math.fround(raw / 100) * days[month]
      }
    }
    for (let c = 0; c < CELLS; c++) {
      const value = sums[c] / daysInYear
      if (Number.isFinite(value)) frames[i * CELLS + c] = roundHalfEven(value * 100)
      numerator[c] += value * (i - mid)
    }
  }
  if (trend) {
    for (let c = 0; c < CELLS; c++) {
      if (Number.isFinite(numerator[c])) trend[c] = roundHalfEven(numerator[c] / xx * 10000)
    }
  }
  return { start, end, frames, trend }
}

export function regionSnapshot(blocks: Int16Array[], bounds: Bounds, start: number): SnapshotSeries {
  const { west, south, east, north } = bounds
  const sine = (angle: number) => Math.sin(angle * Math.PI / 180)
  const overlap = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(b, d) - Math.max(a, c))
  const eligible: { i: number; area: number }[] = []
  let total = 0
  let area = 0
  let touched = 0
  for (let y = 0; y < GRID.nlat; y++) {
    const lat = -90 + y * GRID.cell
    const h = overlap(sine(lat), sine(lat + GRID.cell), sine(south), sine(north))
    if (!h) continue
    for (let x = 0; x < GRID.nlon; x++) {
      const lon = -180 + x * GRID.cell
      const w = west < east ? overlap(lon, lon + GRID.cell, west, east)
        : overlap(lon, lon + GRID.cell, west, 180) + overlap(lon, lon + GRID.cell, -180, east)
      if (!w) continue
      const weight = w * h
      total += weight
      touched++
      const i = y * GRID.nlon + x
      if (blocks.every((block) => {
        for (let m = 0; m < 12; m++) if (block[m * CELLS + i] === GRID.missing) return false
        return true
      })) {
        eligible.push({ i, area: weight })
        area += weight
      }
    }
  }
  const coverage = {
    fraction: total ? area / total : 0, known: true, eligibleCells: eligible.length, touchedCells: touched,
    threshold: .5, note: 'Share of the region’s area with valid values in every month of the analysis window.',
  }
  const years = blocks.map((_, i) => start + i)
  if (area === 0) return { years, annual: years.map(() => null), monthly: null, coverage }
  const monthly: MonthlyPoint[] = []
  const annual = blocks.map((block, i) => {
    const year = years[i]
    const days = dayWeights(year)
    let weighted = 0
    for (let m = 0; m < 12; m++) {
      let totalMonth = 0
      for (const cell of eligible) totalMonth += Math.fround(block[m * CELLS + cell.i] / 100) * cell.area
      const value = totalMonth / area
      monthly.push({ year, month: m + 1, value })
      weighted += days[m] * value
    }
    return weighted / days.reduce((a, b) => a + b, 0)
  })
  return { years, annual, monthly, coverage }
}
