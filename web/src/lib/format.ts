import type { EvidenceState } from './types'

const MINUS = '−'

/** Signed fixed-decimal number with a true minus sign; null renders as an em dash. */
export function signed(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = Math.abs(v).toFixed(digits)
  if (Number(s) === 0) return s
  return (v > 0 ? '+' : MINUS) + s
}

/** Unsigned-positive variant: only negatives carry a sign. */
export function plain(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = Math.abs(v).toFixed(digits)
  return (v < 0 && Number(s) !== 0 ? MINUS : '') + s
}

export function interval(lo: number | null, hi: number | null, digits = 2): string {
  if (lo === null || hi === null) return 'interval unavailable'
  return `${signed(lo, digits)} to ${signed(hi, digits)}`
}

export function pValue(p: number | null): string {
  if (p === null) return '—'
  return p < 0.001 ? '< 0.001' : p.toFixed(3)
}

export const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  supported_increase: 'Increase supported',
  supported_decrease: 'Decrease supported',
  inconclusive: 'Inconclusive',
  insufficient_data: 'Descriptive only',
  no_spatial_coverage: 'No data coverage',
  degenerate_variance: 'No variation',
}

export const EVIDENCE_HELP: Record<EvidenceState, string> = {
  supported_increase: 'The 95% interval for the rate lies entirely above zero.',
  supported_decrease: 'The 95% interval for the rate lies entirely below zero.',
  inconclusive: 'The 95% interval includes zero, so the data do not settle whether there was a change.',
  insufficient_data: 'Too few complete or contiguous years for inference; the slope only describes these points.',
  no_spatial_coverage: 'No valid data cells in this region for the whole period.',
  degenerate_variance: 'The values do not vary, so no trend model can be evaluated.',
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Everyday wording for the overview. The Analyze view keeps the precise labels above. */
export const EVIDENCE_PLAIN: Record<EvidenceState, string> = {
  supported_increase: 'Clear increase',
  supported_decrease: 'Clear decrease',
  inconclusive: 'No clear change',
  insufficient_data: 'Too few years to judge',
  no_spatial_coverage: 'No data here',
  degenerate_variance: 'No variation',
}

/** Anomalies carry a sign; totals such as rainfall do not. */
export function value(v: number | null | undefined, digits: number, anomaly: boolean): string {
  return anomaly ? signed(v, digits) : plain(v, digits)
}
