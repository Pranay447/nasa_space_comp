// Fixed display scales. One scale per variable across all frames.

export interface Scale {
  min: number
  max: number
  colors: string[] // evenly spaced from min to max
  unit: string
  ticks: number[]
}

const DIVERGING = ['#07529d', '#35bbd9', '#e8eee0', '#f8bf4e', '#ea6f40', '#aa324c']
// Six stops placed so the pale neutral sits exactly on zero.
const DIVERGING_POS = [0, 0.25, 0.5, 0.667, 0.833, 1]

export const OBSERVED_SCALE: Scale = {
  min: -4,
  max: 4,
  colors: DIVERGING,
  unit: '°C',
  ticks: [-4, -2, 0, 2, 4],
}

const TREND_LIMITS = [0.25, 0.5, 1, 1.5, 2, 3, 5, 10]

/** Symmetric trend scale whose limit is the first "nice" value covering the 99th percentile of |slope|. */
export function trendScale(field: Int16Array, missing: number): Scale {
  const abs: number[] = []
  for (let i = 0; i < field.length; i++) if (field[i] !== missing) abs.push(Math.abs(field[i]) / 1000)
  abs.sort((x, y) => x - y)
  const p99 = abs.length ? abs[Math.floor(abs.length * 0.99)] : 1
  const lim = TREND_LIMITS.find((l) => l >= p99) ?? 10
  return { min: -lim, max: lim, colors: DIVERGING, unit: '°C per decade', ticks: [-lim, -lim / 2, 0, lim / 2, lim] }
}

export function stopPositions(scale: Scale): { value: number; color: string }[] {
  return scale.colors.map((color, i) => ({
    value: scale.min + DIVERGING_POS[i] * (scale.max - scale.min),
    color,
  }))
}

export function cssGradient(scale: Scale): string {
  return `linear-gradient(90deg, ${scale.colors.map((c, i) => `${c} ${DIVERGING_POS[i] * 100}%`).join(', ')})`
}

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
}

/** Colour for a value, clipped to the scale ends. Used by the non-WebGL fallback and the surface. */
export function colorAt(scale: Scale, v: number): [number, number, number] {
  const t = Math.min(1, Math.max(0, (v - scale.min) / (scale.max - scale.min)))
  let i = 0
  while (i < DIVERGING_POS.length - 2 && t > DIVERGING_POS[i + 1]) i++
  const f = (t - DIVERGING_POS[i]) / (DIVERGING_POS[i + 1] - DIVERGING_POS[i])
  const a = hex(scale.colors[i])
  const b = hex(scale.colors[i + 1])
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number]
}

/** Evenly spaced colour list (for ECharts visualMap, which spaces colours uniformly). */
export function uniformColors(scale: Scale, n = 13): string[] {
  return Array.from({ length: n }, (_, i) => {
    const [r, g, b] = colorAt(scale, scale.min + (i / (n - 1)) * (scale.max - scale.min))
    return `rgb(${r},${g},${b})`
  })
}
