import type { AnnualPoint, Fit, Method, Sensitivity } from './types'

const sum = (xs: number[]) => xs.reduce((total, x) => total + x, 0)

// Continued fraction for the regularized incomplete beta used by Student's t.
function betaFraction(a: number, b: number, x: number) {
  const safe = (value: number) => Math.abs(value) < 1e-28 ? 1e-28 : value
  let c = 1
  let d = 1 / safe(1 - (a + b) * x / (a + 1))
  let fraction = d
  for (let m = 1; m <= 150; m++) {
    const terms = [
      m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m)),
      -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1)),
    ]
    let change = 1
    for (const term of terms) {
      d = 1 / safe(1 + term * d)
      c = safe(1 + term / c)
      change *= c * d
    }
    fraction *= change
    if (Math.abs(change - 1) < 1e-13) break
  }
  return fraction
}

function twoSidedP(t: number, df: number) {
  const a = df / 2
  const b = .5
  const x = df / (df + t * t)
  if (x === 0 || x === 1) return x
  let i = df % 2 ? .5 : 1
  let beta = df % 2 ? Math.PI : 2
  for (; i < a; i++) beta *= i / (i + b)
  const scale = x ** a * (1 - x) ** b / beta
  const result = x < (a + 1) / (a + b + 2)
    ? scale * betaFraction(a, b, x) / a
    : 1 - scale * betaFraction(b, a, 1 - x) / b
  return Math.max(0, Math.min(1, result))
}

export function fitSnapshot(points: AnnualPoint[], method: Method, critical: Record<number, number>): Fit {
  const complete = points.filter((point): point is { year: number; value: number } => point.value !== null)
  const years = complete.map((p) => p.year)
  const n = years.length
  const out: Fit = {
    state: 'insufficient_data', n, requestedStartYear: points[0].year, requestedEndYear: points.at(-1)!.year,
    usedStartYear: years[0] ?? null, usedEndYear: years.at(-1) ?? null, completeYears: years,
    missingYears: points.filter((p) => p.value === null).map((p) => p.year), contiguous: null,
    inferenceAvailable: false, descriptiveOnly: false, reason: null, slopePerDecade: null,
    ciLow: null, ciHigh: null, pValue: null, centerYear: null, valueAtCenter: null, fitted: null,
    sensitivity: null, sensitiveToMethod: null, residualLag1Autocorrelation: null,
  }
  if (n < 3) return { ...out, reason: `Only ${n} complete annual value(s) in the window; a slope cannot be estimated.` }
  const contiguous = years[n - 1] - years[0] === n - 1
  out.contiguous = contiguous
  if (complete.every((point) => point.value === complete[0].value)) {
    return { ...out, state: 'degenerate_variance', reason: 'All annual values are identical; no trend model can be evaluated.' }
  }
  const center = sum(years) / n
  const x = years.map((year) => year - center)
  const mean = sum(complete.map((point) => point.value)) / n
  const y = complete.map((point) => point.value - mean)
  const ssx = sum(x.map((v) => v * v))
  const slope = sum(x.map((v, i) => v * y[i])) / ssx
  const residual = y.map((v, i) => v - slope * x[i])
  const ssr = sum(residual.map((v) => v * v))
  out.slopePerDecade = slope * 10
  out.centerYear = center
  out.valueAtCenter = mean
  out.fitted = [years[0], years[n - 1]].map((year) => ({ year, value: mean + slope * (year - center) }))
  if (ssr <= 1e-20 * sum(y.map((v) => v * v))) {
    return { ...out, state: 'degenerate_variance', reason: 'The annual values lie exactly on a line; the residual variance is zero.' }
  }
  if (contiguous) out.residualLag1Autocorrelation = sum(residual.slice(1).map((r, i) => r * residual[i])) / ssr
  const minimum = method.minContiguousYearsForInference
  if (n < minimum || !contiguous) return {
    ...out, descriptiveOnly: true,
    reason: n < minimum ? `${n} complete years; inference needs at least ${minimum} contiguous years. The slope is descriptive only.`
      : 'The annual record has gaps; HAC inference needs contiguous years. The slope is descriptive only.',
  }

  // Because years are centered, the slope row of (X'X)^-1 has a zero intercept term.
  // The sandwich estimator therefore uses only the year × residual scores.
  const scores = residual.map((r, i) => r * x[i])
  const lagZero = sum(scores.map((v) => v * v))
  const sensitivity = method.sensitivityMaxLags.map((maxLags): Sensitivity => {
    let covariance = lagZero
    for (let lag = 1; lag <= maxLags; lag++) {
      covariance += 2 * (1 - lag / (maxLags + 1)) * sum(scores.slice(lag).map((v, i) => v * scores[i]))
    }
    const se = Math.sqrt(Math.max(0, covariance * n / (n - 2))) / ssx
    const width = critical[n - 2] * se
    const ciLow = (slope - width) * 10
    const ciHigh = (slope + width) * 10
    return { maxLags, slopePerDecade: slope * 10, ciLow, ciHigh, pValue: twoSidedP(slope / se || 0, n - 2),
      state: ciLow > 0 ? 'supported_increase' : ciHigh < 0 ? 'supported_decrease' : 'inconclusive' }
  })
  const primary = sensitivity.find((item) => item.maxLags === method.primaryMaxLags)!
  return { ...out, inferenceAvailable: true, state: primary.state, ciLow: primary.ciLow, ciHigh: primary.ciHigh,
    pValue: primary.pValue, sensitivity, sensitiveToMethod: new Set(sensitivity.map((item) => item.state)).size > 1 }
}
