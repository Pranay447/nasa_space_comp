import type { ReactNode } from 'react'
import { EVIDENCE_PLAIN, interval, signed, value } from '@/lib/format'
import type { AnnualPoint, Fit } from '@/lib/types'

export interface RegionRow {
  id: string
  name: string
  photo?: string
  annualSeries: AnnualPoint[]
  fit: Fit
}

export function RegionalTables({ rows, selectedId, year, startYear, endYear, unit, rateUnit, digits, baseline, source, children, onRegion, onYear, status }: {
  rows: RegionRow[]
  selectedId: string
  year: number
  startYear: number
  endYear: number
  unit: string
  rateUnit: string
  digits: number
  baseline: string | null
  source: ReactNode
  children?: ReactNode
  onRegion?: (id: string) => void
  onYear?: (year: number) => void
  status?: ReactNode
}) {
  const selected = rows.find((row) => row.id === selectedId)
  const observations = selected?.annualSeries ?? []
  const recent = observations.slice(-4)
  const current = observations.find((point) => point.year === year)
  const shown = current && !recent.some((point) => point.year === year) ? [current, ...recent.slice(-3)] : recent
  const formatValue = (val: number | null | undefined) => val == null ? '—' : `${value(val, digits, !!baseline)} ${unit}`

  return (
    <div className="ledger-content">
      <div className="ledger-main">
        {children}
        <section aria-label="Regions">
          <h2 className="ledger-heading">Regions</h2>
          <table className="ledger-table">
            <colgroup><col className="ledger-region-col" /><col /><col /><col /></colgroup>
            <thead><tr><th scope="col">Region</th><th scope="col">{year} value</th><th scope="col">Trend</th><th scope="col">Evidence</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const name = <>{row.photo && <img src={row.photo} alt="" />}<span>{row.name}</span></>
                return (
                  <tr key={row.id} data-selected={row.id === selectedId}>
                    <th scope="row">{onRegion
                      ? <button type="button" aria-pressed={row.id === selectedId} onClick={() => onRegion(row.id)} className="ledger-region">{name}</button>
                      : <span className="ledger-region">{name}</span>}</th>
                    <td className="num">{formatValue(row.annualSeries.find((point) => point.year === year)?.value)}</td>
                    <td className="num" aria-label={row.fit.slopePerDecade == null ? 'Trend unavailable' : `${signed(row.fit.slopePerDecade, digits)} ${rateUnit}`}>{signed(row.fit.slopePerDecade, digits)}</td>
                    <td><span className="ledger-status" data-direction={row.fit.state}>{EVIDENCE_PLAIN[row.fit.state]}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {status && <div className="ledger-notice">{status}</div>}
        </section>
        <section className="ledger-annual" aria-label="Annual observations">
          <h2 className="ledger-heading">Annual observations</h2>
          <table className="ledger-table">
            <thead><tr><th scope="col">Year</th><th scope="col">{baseline ? 'Anomaly' : 'Annual value'}</th><th scope="col">Region</th></tr></thead>
            <tbody>
              {shown.map((point) => (
                <tr key={point.year} data-selected={point.year === year}>
                  <th scope="row">{onYear ? <button type="button" aria-pressed={point.year === year} onClick={() => onYear(point.year)}>{point.year}</button> : point.year}</th>
                  <td className="num">{formatValue(point.value)}</td><td>{selected?.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <aside className="ledger-inspector" aria-label="Investigation details">
        <h2 className="ledger-heading">Investigation</h2>
        <dl>
          <div><dt>Region</dt><dd>{selected?.name ?? '—'}</dd></div>
          <div><dt>Study period</dt><dd className="num">{startYear}–{endYear}</dd></div>
          {baseline && <div><dt>Baseline</dt><dd className="num">{baseline}</dd></div>}
          <div><dt>Trend units</dt><dd>{rateUnit}</dd></div>
          <div><dt>95% interval</dt><dd className="num">{selected?.fit.inferenceAvailable ? interval(selected.fit.ciLow, selected.fit.ciHigh, digits) : 'Unavailable'}</dd></div>
          <div><dt>Source</dt><dd>{source}</dd></div>
        </dl>
      </aside>
    </div>
  )
}
