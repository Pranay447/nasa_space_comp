import { ArrowUpRight, ChevronDown, MapPin, TrendingDown, TrendingUp } from 'lucide-react'
import { EVIDENCE_PLAIN, interval, signed, value } from '@/lib/format'
import { SCENES } from '@/lib/scenes'
import { useAtlas } from '@/lib/store'
import type { AnalysisResponse, Dataset } from '@/lib/types'

export function AtlasOverview({ dataset, data, regionLabel, onAnalyze }: { dataset: Dataset; data: AnalysisResponse | null; regionLabel?: string; onAnalyze: () => void }) {
  const year = useAtlas((s) => s.frameYear)
  const setYear = useAtlas((s) => s.setFrameYear)
  const { status, offline } = useAtlas((s) => s.analysis)
  const retry = useAtlas((s) => s.retry)
  const summary = data?.dataset ?? dataset
  const primary = data?.regions[0]
  const comparison = data?.regions[1]
  const fit = primary?.fit
  const pair = data?.paired?.fit
  const scene = SCENES.find((item) => item.regionId === primary?.region.id || item.id + '-box' === primary?.region.id)
  const observation = primary?.annualSeries.find((point) => point.year === year)?.value
  const annualValue = (number: number | null | undefined) => value(number, summary.digits, !!summary.baseline)
  const tone = fit?.state === 'supported_increase' ? 'increase' : fit?.state === 'supported_decrease' ? 'decrease' : 'neutral'
  const recent = primary?.annualSeries.slice(-5) ?? []
  const TrendIcon = tone === 'increase' ? TrendingUp : tone === 'decrease' ? TrendingDown : null

  return (
    <section id="region-stats" className="regional-stats" aria-label="Selected region statistics" aria-busy={status === 'loading'}>
      <article className="region-stat-cover" data-tone={tone}>
        {scene && <img src={scene.photo} alt="" style={{ objectPosition: scene.focus }} />}
        <div className="region-stat-wash" aria-hidden="true"><span /><span /></div>
        <div className="region-stat-content">
          <h2><MapPin size={16} aria-hidden="true" /> {primary?.region.label ?? regionLabel ?? 'Selected region'}</h2>
          <p>{year} · {summary.variable}</p>
          <p className="region-stat-number num">{annualValue(observation)} {observation != null && <span>{summary.unit}</span>}</p>
          {summary.baseline && <p className="region-stat-context">Compared with the {summary.baseline} average</p>}
          {fit ? (
            <div className="region-stat-trend">
              <strong className="num">{TrendIcon && <TrendIcon size={17} aria-hidden="true" />}{signed(fit.slopePerDecade, summary.digits)} {fit.slopePerDecade !== null && summary.rateUnit}</strong>
              <span>{EVIDENCE_PLAIN[fit.state]}</span>
            </div>
          ) : status === 'error'
            ? <p role="alert">The result couldn’t load. <button type="button" onClick={retry}>Retry</button></p>
            : <p role="status">Loading regional observations…</p>}
          {scene && <a className="region-stat-credit" href={scene.credit.url} target="_blank" rel="noreferrer">{scene.place} · NASA imagery</a>}
        </div>
      </article>

      {primary && <div className="region-stat-panel">
        <h2>Recent observations</h2>
        <div className="region-observations" role="group" aria-label="Choose an observation year">
          {recent.map((point) => (
            <button type="button" key={point.year} aria-pressed={year === point.year} onClick={() => setYear(point.year)}>
              <span>{point.year}</span>
              <strong className="num">{annualValue(point.value)}</strong>
              <small>{point.value === null ? 'No data' : summary.unit}</small>
            </button>
          ))}
        </div>
        {comparison && <p className="region-compare"><span>{comparison.region.label}</span><strong className="num">{annualValue(comparison.annualSeries.find((point) => point.year === year)?.value)} {summary.unit}</strong></p>}
        <details className="region-more analysis-disclosure">
          <summary>More statistics <ChevronDown size={16} aria-hidden="true" /></summary>
          <dl className="analysis-disclosure-body">
            <div><dt>Study period</dt><dd>{data.request.startYear}–{data.request.endYear}</dd></div>
            <div><dt>95% trend interval</dt><dd>{fit?.inferenceAvailable ? `${interval(fit.ciLow, fit.ciHigh, summary.digits + 1)} ${summary.rateUnit}` : 'Unavailable'}</dd></div>
            <div><dt>Years used</dt><dd>{fit?.n ?? 0}</dd></div>
            <div><dt>Spatial coverage</dt><dd>{primary.coverage.fraction === null ? 'Unreported' : `${Math.round(primary.coverage.fraction * 100)}%`}</dd></div>
            {pair && <div><dt>Paired trend difference</dt><dd>{signed(pair.slopePerDecade, summary.digits)} {summary.rateUnit}</dd></div>}
          </dl>
        </details>
        <div className="region-stat-footer">
          <a href={summary.source.url} target="_blank" rel="noreferrer">{summary.source.name}</a>
          <button type="button" className="ta-btn accent-action" onClick={onAnalyze}>View analysis <ArrowUpRight size={14} aria-hidden="true" /></button>
        </div>
        {offline && <p className="ta-micro">Showing the saved result.</p>}
      </div>}
    </section>
  )
}
