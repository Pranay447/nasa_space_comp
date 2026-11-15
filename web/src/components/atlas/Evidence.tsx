import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ChevronDown, Clipboard, Download } from 'lucide-react'
import { csvUrl } from '@/lib/api'
import { downloadSnapshotCsv } from '@/lib/snapshotCsv'
import { OBSERVED_SCALE, uniformColors } from '@/lib/colors'
import { EVIDENCE_HELP, EVIDENCE_LABEL, interval, pValue, signed, value } from '@/lib/format'
import { boundsText } from '@/lib/geo'
import { SCENES } from '@/lib/scenes'
import { currentQuery, useAtlas } from '@/lib/store'
import type { AnalysisResponse, Dataset, Fit, RegionResult } from '@/lib/types'
import { RegionPicker } from './Controls'
import { IntervalPlot } from './IntervalPlot'
import type { IntervalRow } from './IntervalPlot'
import { MonthSurface } from './MonthSurface'
import { SeriesChart } from './SeriesChart'
import { SeriesTable } from './SeriesTable'

const SLOTS = ['a', 'b'] as const

function valueAt(r: RegionResult, year: number): number | null {
  return r.annualSeries.find((p) => p.year === year)?.value ?? null
}

/** Explore dock: region pickers, the synchronized chart, and the rate with its interval. */
export function EvidenceDock({ dataset, data }: { dataset: Dataset; data: AnalysisResponse | null }) {
  const a = useAtlas((s) => s.a)
  const b = useAtlas((s) => s.b)
  const frameYear = useAtlas((s) => s.frameYear)
  const setFrameYear = useAtlas((s) => s.setFrameYear)
  const theme = useAtlas((s) => s.theme)
  const status = useAtlas((s) => s.analysis.status)
  const error = useAtlas((s) => s.analysis.error)
  const offline = useAtlas((s) => s.analysis.offline)
  const retry = useAtlas((s) => s.retry)
  const d = data?.dataset.digits ?? dataset.digits
  const unit = dataset.unit

  const series = useMemo(
    () => (data?.regions ?? []).map((r, i) => ({ slot: SLOTS[i], label: r.region.label, points: r.annualSeries, fitted: r.fit.fitted })),
    [data],
  )
  const rows: IntervalRow[] = useMemo(() => {
    if (!data) return []
    const out: IntervalRow[] = data.regions.map((r, i) => ({
      key: SLOTS[i], label: `${SLOTS[i].toUpperCase()} · ${r.region.label}`,
      slope: r.fit.slopePerDecade, low: r.fit.ciLow, high: r.fit.ciHigh, stateLabel: EVIDENCE_LABEL[r.fit.state],
    }))
    if (data.paired)
      out.push({ key: 'diff', label: 'A minus B · paired fit', slope: data.paired.fit.slopePerDecade, low: data.paired.fit.ciLow, high: data.paired.fit.ciHigh, stateLabel: EVIDENCE_LABEL[data.paired.fit.state] })
    return out
  }, [data])

  const primary: { title: string; fit: Fit; statement: string } | null = !data
    ? null
    : data.paired
      ? { title: 'A minus B · paired rate', fit: data.paired.fit, statement: data.paired.statement }
      : { title: `Rate · ${data.regions[0].region.label}`, fit: data.regions[0].fit, statement: data.regions[0].statement }

  return (
    <section aria-label="Evidence" className="grid gap-4 border-t border-line bg-panel p-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
      <div className="min-w-0">
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <RegionPicker slot="a" dataset={dataset} value={a} other={b} />
          <RegionPicker slot="b" dataset={dataset} value={b} other={a} />
        </div>
        <div className="rounded border border-line bg-plot p-2" aria-busy={status === 'loading'}>
          {status === 'error' && (
            <div role="alert" className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
              <p>The analysis request failed: {error}</p>
              <button type="button" className="ta-btn" onClick={retry}>Retry</button>
            </div>
          )}
          {status !== 'error' && !data && <div className="grid h-[220px] place-items-center text-dim">Loading the series…</div>}
          {status !== 'error' && data && (
            <SeriesChart
              series={series} unit={unit} digits={d} frameYear={frameYear} onSelectYear={setFrameYear}
              dark={theme === 'dark'} zeroLine={!!dataset.baseline}
              axisLabel={dataset.baseline ? `${unit} vs ${dataset.baseline}` : `${dataset.variable} (${unit})`}
            />
          )}
        </div>
        {data && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-live="polite">
            <span className="ta-micro">Selected year <span className="num text-ink">{frameYear}</span></span>
            {data.regions.map((r, i) => (
              <span key={r.region.id} className="num text-sm">
                <span className={i === 0 ? 'text-series-a' : 'text-series-b'}>{SLOTS[i].toUpperCase()}</span>{' '}
                {valueAt(r, frameYear) === null ? 'no data' : `${value(valueAt(r, frameYear), d, !!dataset.baseline)} ${unit}`}
              </span>
            ))}
            <span className="ta-micro">
              {dataset.dataKind === 'published_regional_series' ? 'Published band mean' : 'Regional mean'}
              {dataset.baseline ? ` · anomaly vs ${dataset.baseline}` : ''} · click the chart to move the map year
            </span>
          </p>
        )}
        {offline && <p className="ta-micro mt-1">Calculated from the bundled NASA data.</p>}
      </div>

      <div className="min-w-0 lg:border-l lg:border-line lg:pl-4">
        {primary && (
          <>
            <h2 className="ta-micro">{primary.title}</h2>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="num text-[2.4rem] font-medium leading-none tracking-tight">{signed(primary.fit.slopePerDecade, d)}</span>
              <span className="ta-micro">{dataset.rateUnit}</span>
            </p>
            <p className="num mt-1 text-sm">
              {primary.fit.inferenceAvailable ? `95% interval ${interval(primary.fit.ciLow, primary.fit.ciHigh, d)}` : 'No interval: descriptive slope only'}
            </p>
            <p className="mt-2 text-sm">{primary.statement}</p>
            <div className="mt-3">
              <IntervalPlot rows={rows} unit={dataset.rateUnit} digits={d} />
            </div>
            <ul className="mt-2 grid gap-1 border-t border-line pt-2">
              {data!.regions.map((r, i) => (
                <li key={r.region.id} className="text-sm">
                  <span className={`num ${i === 0 ? 'text-series-a' : 'text-series-b'}`}>{SLOTS[i].toUpperCase()}</span> {r.statement}
                </li>
              ))}
            </ul>
            {data!.exploratory && <p className="ta-micro mt-2">Exploratory: {data!.exploratoryNote}</p>}
            {[...data!.regions.map((r) => r.fit), ...(data!.paired ? [data!.paired.fit] : [])].some((f) => f.sensitiveToMethod) && (
              <p className="mt-2 text-sm text-danger">Sensitive to method: whether the interval excludes zero changes between HAC lags 1, 2 and 3.</p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

function FitDetails({ title, bounds, fit, digits, rateUnit, coverage, check }: { title: string; bounds?: string; fit: Fit; digits: number; rateUnit: string; coverage?: string; check?: string }) {
  return (
    <article className="analysis-fit">
      <div><h3>{title}</h3>{bounds && <p className="analysis-context">{bounds}</p>}</div>
      <p className="analysis-rate num">{signed(fit.slopePerDecade, digits)} <span>{rateUnit}</span></p>
      <p className="analysis-fit-description"><strong>{EVIDENCE_LABEL[fit.state]}.</strong> {EVIDENCE_HELP[fit.state]}</p>
      <dl className="analysis-fit-data num">
        <div><dt>95% confidence interval</dt><dd>{fit.inferenceAvailable ? `${interval(fit.ciLow, fit.ciHigh, digits + 1)} ${rateUnit}` : 'Unavailable'}</dd></div>
        <div><dt>Observations used</dt><dd>{fit.usedStartYear ?? '—'}–{fit.usedEndYear ?? '—'} · {fit.n} annual values{fit.contiguous === false ? ' · gaps' : ''}</dd></div>
      </dl>
      {fit.reason && <p className="analysis-context">{fit.reason}</p>}
      {fit.sensitiveToMethod && <p className="mt-2 text-xs text-danger">Sensitive to method: the reading changes between HAC lags (see checks).</p>}
      <details className="analysis-disclosure analysis-method-check">
        <summary>Method checks <ChevronDown size={15} aria-hidden="true" /></summary>
        <div className="analysis-disclosure-body">
        <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-dim">Slope (unrounded)</dt><dd>{signed(fit.slopePerDecade, digits + 2)} {rateUnit}</dd>
          <dt className="text-dim">p-value (two-sided)</dt><dd>{pValue(fit.pValue)}</dd>
          {fit.missingYears.length > 0 && (<><dt className="text-dim">Missing years</dt><dd>{fit.missingYears.join(', ')}</dd></>)}
          {coverage !== undefined && (<><dt className="text-dim">Coverage</dt><dd>{coverage}</dd></>)}
          <dt className="text-dim">Residual lag-1 r</dt><dd>{fit.residualLag1Autocorrelation === null ? '—' : signed(fit.residualLag1Autocorrelation, 2)}</dd>
          {check && (<><dt className="text-dim">Cross-check</dt><dd>{check}</dd></>)}
        </dl>
        {fit.sensitivity && (
          <table className="num mt-2 w-full text-xs">
            <caption className="ta-micro text-left">HAC lag sensitivity (lag 2 is the declared primary)</caption>
            <thead><tr className="text-dim"><th scope="col" className="text-left font-normal">Lag</th><th scope="col" className="text-left font-normal">95% interval</th><th scope="col" className="text-left font-normal">Reading</th></tr></thead>
            <tbody>
              {fit.sensitivity.map((s) => (
                <tr key={s.maxLags}><th scope="row" className="text-left font-normal">{s.maxLags}</th><td>{interval(s.ciLow, s.ciHigh, digits + 1)}</td><td>{EVIDENCE_LABEL[s.state]}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </details>
    </article>
  )
}

function coverageText(r: RegionResult): string {
  const c = r.coverage
  if (!c.known || c.fraction === null) return 'unknown (not published with this source)'
  return `${(c.fraction * 100).toFixed(0)}% of region area · ${c.eligibleCells}/${c.touchedCells} cells`
}

/** Analyze view: inference details, monthly surface, accessible table, export and provenance. */
export function AnalyzePanel({ dataset, data, charts }: { dataset: Dataset; data: AnalysisResponse; charts: ReactNode }) {
  const offline = useAtlas((s) => s.analysis.offline)
  const frameYear = useAtlas((s) => s.frameYear)
  const setFrameYear = useAtlas((s) => s.setFrameYear)
  const theme = useAtlas((s) => s.theme)
  const d = data.dataset.digits
  const [copyStatus, setCopyStatus] = useState('')
  const first = data.regions[0]
  const second = data.regions[1]
  const name = (region: RegionResult) => region.region.label.split(' (')[0].replace(/ band$/i, '')
  const a = name(first)
  const b = second ? name(second) : null
  const paired = data.paired
  const fit = paired?.fit ?? first.fit
  const period = `${data.request.startYear}–${data.request.endYear}`
  const arcticWarmedFaster = first.region.id === 'zonal:64N-90N' && second?.region.id === 'zonal:90S-64S'
    && first.fit.state === 'supported_increase' && paired?.fit.state === 'supported_increase'
  const title = paired && b
    ? fit.state === 'supported_increase' ? (arcticWarmedFaster ? 'The Arctic warmed faster' : `${a} had a higher trend than ${b}`)
      : fit.state === 'supported_decrease' ? `${a} had a lower trend than ${b}` : `${a} and ${b}: trend comparison`
    : `${a}: regional trend`
  const picturedRegions = paired ? data.regions : [first]
  const selectedPhotos = picturedRegions.map((r) => SCENES.find((scene) => scene.regionId === r.region.id || scene.id + '-box' === r.region.id)).filter((scene) => scene !== undefined)
  const tone = fit.state === 'supported_increase' ? 'increase' : fit.state === 'supported_decrease' ? 'decrease' : 'neutral'
  const scope = paired && b ? `${a} minus ${b} · compared year by year` : first.region.label
  const confidence = fit.inferenceAvailable
    ? `95% interval ${interval(fit.ciLow, fit.ciHigh, d + 1)} ${data.dataset.rateUnit}`
    : EVIDENCE_HELP[fit.state]

  async function copyFinding() {
    const exactScope = data.regions.map((item) => `${item.region.label}: ${boundsText(item.region.bounds)}`).join('\n')
    try {
      await navigator.clipboard.writeText([`${title} · ${period}`, `${scope}: ${signed(fit.slopePerDecade, d)} ${data.dataset.rateUnit}. ${confidence}.`,
        `Source: ${data.dataset.source.citation}`, exactScope, window.location.href].join('\n'))
      setCopyStatus('Finding copied.')
    } catch {
      setCopyStatus('Clipboard unavailable. You can select the finding to copy it.')
    }
  }
  const years = data.regions[0].annualSeries.map((p) => p.year)
  const surfaceRegion = data.regions.find((r) => r.monthlySeries) ?? null
  const scale = useMemo(() => {
    if (dataset.baseline) return { min: OBSERVED_SCALE.min, max: OBSERVED_SCALE.max, colors: uniformColors(OBSERVED_SCALE) }
    const vals = (surfaceRegion?.monthlySeries ?? []).map((p) => p.value).filter((v): v is number => v !== null)
    return { min: 0, max: Math.max(1, Math.ceil(Math.max(...vals, 1) / 50) * 50), colors: ['#eff8fb', '#b7e3e4', '#54b3c6', '#24769b', '#163f64'] }
  }, [dataset.baseline, surfaceRegion])

  return (
    <section aria-label="Analysis details" className="analysis-page">
      <header className="analysis-hero" key={data.queryKey} data-tone={tone}>
        {selectedPhotos.length > 0 && <div className="analysis-hero-images" aria-hidden="true">
          {selectedPhotos.map((scene) => <img key={scene.id} src={scene.photo} alt="" style={{ objectPosition: scene.focus }} />)}
        </div>}
        <div className="region-stat-wash" aria-hidden="true"><span /><span /></div>
        <div className="analysis-hero-content">
          <p className="analysis-hero-meta">{period} · {data.dataset.shortTitle}</p>
          <h2>{title}</h2>
          <p className="analysis-hero-scope">{scope}</p>
          <p className="analysis-hero-rate num">{signed(fit.slopePerDecade, d)} <span>{data.dataset.rateUnit}</span></p>
          <p className="analysis-hero-confidence num">{confidence}</p>
          {fit.inferenceAvailable && fit.state === 'inconclusive' && <p>The interval crosses zero, so either direction is consistent with these data.</p>}
          {fit.sensitiveToMethod && <p>The evidence classification depends on the statistical settings. See method checks below.</p>}
        </div>
        {selectedPhotos.length > 0 && <div className="analysis-image-credit">NASA imagery · {selectedPhotos.map((scene) => (
          <a key={scene.id} href={scene.credit.url} target="_blank" rel="noreferrer">{scene.place}</a>
        ))}</div>}
      </header>

      <div className="analysis-source-strip">
        <div><p>{data.dataset.productVersion}</p><a href={data.dataset.source.url} target="_blank" rel="noreferrer">Open dataset</a></div>
        <div className="analysis-actions">
          <button className="ta-btn" type="button" onClick={copyFinding}><Clipboard size={15} aria-hidden="true" /> Copy finding</button>
          {offline
            ? <button type="button" className="ta-btn accent-action" onClick={() => downloadSnapshotCsv(data)}><Download size={15} aria-hidden="true" /> Download evidence CSV</button>
            : <a className="ta-btn accent-action no-underline" href={csvUrl(currentQuery())} download><Download size={15} aria-hidden="true" /> Download evidence CSV</a>}
          <small>Observations, trend estimates and method metadata</small>
          {copyStatus && <span role="status">{copyStatus}</span>}
        </div>
      </div>

      <div className="analysis-section-heading"><h2>Trend estimates</h2><a href="#analysis-observations"><ArrowDown size={14} aria-hidden="true" /> View annual values</a></div>
      <div className="analysis-fits">
        {data.regions.map((r, i) => (
          <FitDetails key={r.region.id} title={i === 0 ? a : b ?? r.region.label} bounds={boundsText(r.region.bounds)} fit={r.fit} digits={d} rateUnit={dataset.rateUnit} coverage={coverageText(r)} />
        ))}
        {data.paired && (
          <FitDetails
            title={`${a} minus ${b}`} fit={data.paired.fit} digits={d} rateUnit={dataset.rateUnit}
            check={data.paired.differenceOfSlopesCheck === null ? undefined : `slope(A) − slope(B) = ${signed(data.paired.differenceOfSlopesCheck, d + 1)}`}
          />
        )}
      </div>
      <section id="analysis-observations" className="analysis-observations">
        <h2>Annual values</h2>
        <div className="analysis-annual-body">
          <SeriesTable
            caption={`Annual values, ${years[0]}–${years[years.length - 1]} · ${data.dataset.productVersion}`}
            years={years}
            columns={[
              ...data.regions.map((r, i) => ({ key: SLOTS[i], label: `${SLOTS[i].toUpperCase()} ${r.region.label}`, values: r.annualSeries.map((p) => p.value) })),
              ...(data.paired ? [{ key: 'diff', label: 'A − B', values: data.paired.annualSeries.map((p) => p.value) }] : []),
            ]}
            unit={dataset.unit} digits={d} highlightYear={frameYear} maxHeight={330} signedValues={!!dataset.baseline}
          />
        </div>
      </section>
      {charts}
      {surfaceRegion ? (
        <section className="analysis-observations">
          <h2>Monthly surface</h2>
          <div className="analysis-annual-body">
            <MonthSurface rows={surfaceRegion.monthlySeries!} unit={data.dataset.monthlyUnit ?? dataset.unit} regionLabel={surfaceRegion.region.label}
              coverageText={`coverage ${coverageText(surfaceRegion)}`} scale={scale} selectedYear={frameYear} onSelectYear={setFrameYear} dark={theme === 'dark'} />
            <p className="analysis-context">Monthly means from {data.dataset.productVersion}. Gaps represent missing data.</p>
          </div>
        </section>
      ) : <p className="analysis-context">This source provides annual values. Choosing a monthly dataset will run a new analysis.</p>}

      <details className="analysis-disclosure">
        <summary>Data sources and method <ChevronDown size={17} aria-hidden="true" /></summary>
        <dl className="analysis-disclosure-body grid gap-x-4 gap-y-3 text-sm md:grid-cols-[12rem_1fr]">
          <dt className="text-dim">Series</dt><dd>{data.dataset.productVersion}</dd>
          <dt className="text-dim">Direct source</dt><dd><a href={data.dataset.source.url} target="_blank" rel="noreferrer">{data.dataset.source.url}</a></dd>
          <dt className="text-dim">Snapshot</dt><dd className="num break-all text-xs">{data.dataset.snapshotId}<br />{data.dataset.snapshotNote}</dd>
          <dt className="text-dim">Units and baseline</dt><dd>{data.dataset.unit}{data.dataset.baseline ? `, anomaly relative to ${data.dataset.baseline}` : ''}; rates in {data.dataset.rateUnit}</dd>
          <dt className="text-dim">Resolution</dt><dd>{data.dataset.resolution}</dd>
          <dt className="text-dim">Aggregation</dt><dd>{data.dataset.aggregation}</dd>
          <dt className="text-dim">Transformations</dt><dd>{data.dataset.transformations.join('; ')}</dd>
          <dt className="text-dim">What the marks show</dt><dd>{data.dataset.marks}</dd>
          <dt className="text-dim">Model</dt><dd>{data.method.model}. {data.method.covariance}, max lags {data.method.primaryMaxLags}. Inference needs ≥ {data.method.minContiguousYearsForInference} contiguous years. ({data.method.library}, {data.methodVersion})</dd>
          <dt className="text-dim">Interval meaning</dt><dd>{data.method.intervalMeaning}</dd>
          {paired && <><dt className="text-dim">Year pairing</dt><dd>Each paired value subtracts the second region’s annual value from the first for the same year. The fit uses years with values for both regions.</dd></>}
          <dt className="text-dim">Citation</dt><dd>{data.dataset.source.citation}</dd>
          {dataset.mapContextDataset && (
            <>
              <dt className="text-dim">Map layer</dt>
              <dd>
                NASA GISS GISTEMP v4 · Land–Ocean Temperature Index · 2° grid · anomaly vs 1951–1980 · 1200 km smoothing applied by NASA; cells drawn
                without interpolation. Annual frame = calendar-day-weighted mean of 12 complete months. Trend layer = per-cell linear slope over the
                window, magnitude only (no per-cell significance).{' '}
                <a href="https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz" target="_blank" rel="noreferrer">Direct NetCDF</a>
              </dd>
            </>
          )}
          {dataset.capabilityNotes.length > 0 && (<><dt className="text-dim">Limits</dt><dd>{dataset.capabilityNotes.join(' ')}</dd></>)}
        </dl>
      </details>
    </section>
  )
}
