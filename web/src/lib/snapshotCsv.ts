import type { AnalysisResponse } from './types'

export function downloadSnapshotCsv(data: AnalysisResponse) {
  const { dataset, method, request, regions, paired } = data
  const lines: string[] = []
  const note = (key: string, value: string) => lines.push(`# ${key}: ${value}`)
  const row = (...fields: (string | number | boolean | null)[]) => lines.push(fields.map((field) => {
    const text = field == null ? '' : String(field)
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }).join(','))
  const tagged = regions.map((region, i) => ({ ...region, tag: i === 0 ? 'A' : 'B' }))
  note('Trend Atlas evidence export', data.queryKey)
  note('dataset', dataset.productVersion)
  note('source', dataset.source.url)
  note('citation', dataset.source.citation)
  note('snapshot', dataset.snapshotId)
  note('unit', dataset.unit + (dataset.baseline ? ` (anomaly vs ${dataset.baseline})` : ''))
  note('aggregation', dataset.aggregation)
  note('method', `${method.model}; ${method.covariance}; primary maxlags=${method.primaryMaxLags}; ${data.methodVersion}; ${method.library}`)
  note('interval', method.intervalMeaning)
  if (data.exploratoryNote) note('note', data.exploratoryNote)
  for (const { region, coverage, tag } of tagged) {
    const { west, south, east, north } = region.bounds
    note(`region ${tag}`, `${region.label} [west ${west}, south ${south}, east ${east}, north ${north}]`)
    note(`coverage ${tag}`, coverage.fraction?.toFixed(4) ?? 'unknown')
  }
  const series = paired ? [...tagged, { ...paired, tag: 'A-B' }] : tagged
  row('section', 'series', 'year', 'month', 'value', 'unit')
  for (const { annualSeries, tag } of series) {
    for (const { year, value } of annualSeries) row('annual', tag, year, '', value, dataset.unit)
  }
  for (const { monthlySeries, tag } of tagged) {
    for (const { year, month, value } of monthlySeries ?? []) row('monthly', tag, year, month, value, dataset.monthlyUnit ?? dataset.unit)
  }
  lines.push('')
  row('section', 'series', 'state', 'n', 'used_start', 'used_end', 'slope_per_decade', 'ci95_low',
    'ci95_high', 'p_value', 'hac_maxlags', 'residual_lag1_autocorr', 'sensitive_to_method', 'statement')
  for (const { fit, statement, tag } of series) {
    row('fit', tag, fit.state, fit.n, fit.usedStartYear, fit.usedEndYear, fit.slopePerDecade, fit.ciLow, fit.ciHigh,
      fit.pValue, method.primaryMaxLags, fit.residualLag1Autocorrelation, fit.sensitiveToMethod, statement)
    for (const s of fit.sensitivity ?? []) {
      row('sensitivity', tag, s.state, fit.n, '', '', s.slopePerDecade, s.ciLow, s.ciHigh, s.pValue, s.maxLags, '', '', '')
    }
  }
  if (paired?.differenceOfSlopesCheck != null) note('cross-check slope(A) - slope(B)', String(paired.differenceOfSlopesCheck))
  const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `trend-atlas_${dataset.datasetId}_${request.startYear}-${request.endYear}.csv`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
