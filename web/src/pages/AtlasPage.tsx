import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChartNoAxesCombined, ChevronDown, LayoutGrid, Map, Maximize2, Minimize2, Moon, Pause, Play, Share2, Sun } from 'lucide-react'
import { SiteMasthead } from '@/components/SiteMasthead'
import { AnalyzePanel, EvidenceDock } from '@/components/atlas/Evidence'
import { AtlasOverview } from '@/components/atlas/Overview'
import { RegionPicker, VariablePicker, YearWindow } from '@/components/atlas/Controls'
import { MapView, cellText } from '@/components/atlas/MapView'
import type { CellInfo, MapRegion } from '@/components/atlas/MapView'
import type { Bounds } from '@/lib/types'
import { GRID, queryKey } from '@/lib/api'
import { OBSERVED_SCALE, cssGradient, trendScale } from '@/lib/colors'
import { signed } from '@/lib/format'
import { transitionPage } from '@/lib/pageMotion'
import { currentQuery, stateToParams, useAtlas, useDataset } from '@/lib/store'
import { useGrid } from '@/lib/useGrid'

function width(bounds: Bounds) {
  return bounds.east >= bounds.west ? bounds.east - bounds.west : 360 + bounds.east - bounds.west
}

function contains(bounds: Bounds, lon: number, lat: number) {
  return lat >= bounds.south && lat <= bounds.north && (bounds.east >= bounds.west
    ? lon >= bounds.west && lon <= bounds.east
    : lon >= bounds.west || lon <= bounds.east)
}

function clickedBox(lon: number, lat: number) {
  const west = Math.round(lon) - 5
  const east = west + 10
  const south = Math.max(-90, Math.min(80, Math.round(lat) - 5))
  return `box:${west < -180 ? west + 360 : west},${south},${east > 180 ? east - 360 : east},${south + 10}`
}

export function AtlasPage({ onSources, onSignup }: { onSources: () => void; onSignup: () => void }) {
  const [params] = useSearchParams()
  const s = useAtlas()
  const dataset = useDataset()
  const data = s.analysis.data?.queryKey === queryKey(currentQuery()) ? s.analysis.data : null
  const [mapOpen, setMapOpen] = useState(false)
  const [mapTarget, setMapTarget] = useState<'a' | 'b'>('a')
  const [mapNotice, setMapNotice] = useState('')
  const showField = s.fieldVisible
  const [chartsOpen, setChartsOpen] = useState(false)
  const [cell, setCell] = useState<CellInfo | null>(null)
  const [playing, setPlaying] = useState(false)
  const [copied, setCopied] = useState(false)
  const applied = useRef(false)
  const mapPanel = useRef<HTMLElement>(null)

  // URL → state once, then state → URL.
  useEffect(() => {
    if (applied.current) return
    applied.current = true
    s.setTheme(s.theme)
    if (!params.has('m')) s.setMode('explore')
    s.applyUrl(params)
    if (!s.datasets) s.loadDatasets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(
    () => useAtlas.subscribe((st) => {
      if (window.location.pathname === '/atlas') {
        window.history.replaceState(window.history.state, '', `/atlas?${stateToParams(st).toString()}`)
      }
    }),
    [],
  )

  const hasGrid = dataset?.mapContextDataset === 'gistemp-grid'
  const exploring = s.mode === 'explore'
  const grid = useGrid(s.startYear, s.endYear, !!hasGrid && exploring && showField)
  const field = grid.data?.start === s.startYear && grid.data.end === s.endYear ? grid.data : null
  const layer = hasGrid && s.layer === 'trend' && s.endYear - s.startYear >= 2 ? 'trend' : 'observed'
  const scale = useMemo(
    () => (layer === 'trend' && field?.trend ? trendScale(field.trend, GRID.missing) : OBSERVED_SCALE),
    [layer, field],
  )

  const regions: MapRegion[] = useMemo(() => {
    const find = (ref: string | null) => {
      if (!ref) return null
      const fromData = data?.regions.find((r) => r.region.id === ref)?.region
      const named = dataset?.supportedRegions.find((r) => r.id === ref)
      if (fromData ?? named) return (fromData ?? named)!
      if (ref.startsWith('box:')) {
        const [west, south, east, north] = ref.slice(4).split(',').map(Number)
        return { id: ref, label: 'Custom box', kind: 'box' as const, bounds: { west, south, east, north } }
      }
      return null
    }
    const out: MapRegion[] = []
    const a = find(s.a)
    const b = find(s.b)
    if (a) out.push({ slot: 'a', label: a.label, bounds: a.bounds })
    if (b) out.push({ slot: 'b', label: b.label, bounds: b.bounds })
    return out
  }, [s.a, s.b, data, dataset])

  function selectOnMap(lon: number, lat: number) {
    if (!dataset) return
    const matched = dataset.supportedRegions.filter((r) => contains(r.bounds, lon, lat))
      .sort((a, b) => width(a.bounds) * (a.bounds.north - a.bounds.south) - width(b.bounds) * (b.bounds.north - b.bounds.south))[0]
    const ref = dataset.customRegions ? clickedBox(lon, lat) : matched?.id
    if (!ref) {
      setMapNotice('This dataset covers only the regions listed above.')
      return
    }
    const other = mapTarget === 'a' ? s.b : s.a
    if (ref === other && s.b) s.swapRegions()
    else if (ref === other) {
      setMapNotice('Choose a different region to compare.')
      return
    } else s.setRegion(mapTarget, ref)
    setMapNotice('')
  }

  // Timeline playback only on explicit request; stops at the last year.
  useEffect(() => {
    if (!playing || !exploring || !showField || layer !== 'observed') return
    const t = window.setInterval(() => {
      const st = useAtlas.getState()
      if (st.frameYear >= st.endYear) setPlaying(false)
      else st.setFrameYear(st.frameYear + 1)
    }, 900)
    return () => window.clearInterval(t)
  }, [playing, exploring, showField, layer])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [s.mode])

  useEffect(() => {
    if (exploring && mapOpen) mapPanel.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [exploring, mapOpen])

  function view(next: 'explore' | 'map' | 'analyze') {
    const current = exploring ? (mapOpen ? 'map' : 'explore') : 'analyze'
    if (current === next) return
    transitionPage(() => {
      if (mapOpen && next === 'explore') window.scrollTo({ top: 0, behavior: 'instant' })
      setMapOpen(next === 'map')
      if (next === 'analyze') setPlaying(false)
      s.setMode(next === 'analyze' ? 'analyze' : 'explore')
    })
  }

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable: the address bar already holds the link */ }
  }

  const layerTitle = layer === 'trend'
    ? `Rate of change, ${s.startYear}–${s.endYear}`
    : `Temperature vs 1951–1980 average · ${s.frameYear}`

  return (
    <>
    <div className="atlas-masthead"><SiteMasthead atlasHref={`/atlas?${stateToParams({ ...s, mode: 'explore' })}`} onAtlas={() => view('explore')} onSources={onSources} onSignup={onSignup} /></div>
    <div className={`atlas-weather-shell${exploring && mapOpen ? ' atlas-map-expanded' : ''}`}>
      <nav className="atlas-weather-nav" aria-label="Atlas navigation">
        <button type="button" aria-pressed={!mapOpen && exploring} onClick={() => view('explore')}><LayoutGrid /><span>Explore</span></button>
        <button type="button" aria-pressed={mapOpen && exploring} onClick={() => view('map')}><Map /><span>Map</span></button>
        <button type="button" aria-pressed={!exploring} onClick={() => view('analyze')}><ChartNoAxesCombined /><span>Analyze</span></button>
      </nav>
      <div className="atlas-weather-workspace">
      <header className="atlas-weather-header">
        <div className="atlas-weather-title"><h1>{!exploring ? 'Analysis' : mapOpen ? 'Region map' : 'Regional overview'}</h1></div>
        <div className="atlas-weather-tools">
          {s.datasets && <VariablePicker datasets={s.datasets} current={dataset} />}
          {dataset && <YearWindow dataset={dataset} />}
          <button type="button" className="ta-btn" onClick={share} aria-label="Copy a shareable link to this view">
            <Share2 size={14} aria-hidden="true" /> <span aria-live="polite">{copied ? 'Link copied' : 'Share'}</span>
          </button>
          <button type="button" className="ta-btn" onClick={() => s.setTheme(s.theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${s.theme === 'dark' ? 'light' : 'dark'} theme`}>
            {s.theme === 'dark' ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
          </button>
        </div>
      </header>
      {dataset && <div className="atlas-region-controls" aria-label="Regions" role="group">
        <div><span>Primary region</span><RegionPicker slot="a" dataset={dataset} value={s.a} other={s.b} /></div>
        <div><span>Compare with</span><RegionPicker slot="b" dataset={dataset} value={s.b} other={s.a} /></div>
      </div>}

      {s.datasetsError && s.datasetsError !== 'offline' && (
        <p role="alert" className="border-b border-line bg-panel px-3 py-2 text-danger">
          The dataset list could not be loaded ({s.datasetsError}). <button type="button" className="ta-btn" onClick={() => s.loadDatasets()}>Retry</button>
        </p>
      )}

      <main className="min-w-0" data-page-motion>
        {!exploring && dataset && (
          <>
            {data && <AnalyzePanel key={data.queryKey} dataset={dataset} data={data} charts={
              <details className="analysis-disclosure" open={chartsOpen} onToggle={(event) => setChartsOpen(event.currentTarget.open)}>
                <summary>Annual series and trend charts <ChevronDown size={17} aria-hidden="true" /></summary>
                {chartsOpen && <div className="analysis-disclosure-body"><EvidenceDock dataset={dataset} data={data} /></div>}
              </details>
            } />}
            {!data && s.analysis.status !== 'error' && <p className="atlas-weather-card" role="status">Loading analysis…</p>}
            {!data && s.analysis.status === 'error' && <p className="atlas-weather-card" role="alert">Analysis unavailable. <button type="button" className="ta-btn" onClick={s.retry}>Retry</button></p>}
          </>
        )}
        {exploring && (
          <div className="atlas-dashboard" data-expanded={mapOpen}>
          <section ref={mapPanel} className="atlas-weather-map" aria-label="Region map">
          <header className="dashboard-map-header">
            <div><h2>Choose a region</h2><p>{dataset?.customRegions ? 'Click Earth to select a 10° × 10° area.' : dataset?.datasetId === 'gistemp-zonal' ? 'Click Earth to select a latitude band.' : 'Click Earth to select a region.'}</p></div>
            <button type="button" className="ta-btn" aria-expanded={mapOpen} onClick={() => view(mapOpen ? 'explore' : 'map')}>
              {mapOpen ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
              {mapOpen ? 'Collapse map' : 'Expand map'}
            </button>
          </header>
          <div className="dashboard-map-tools">
            <div role="group" aria-label="Map selection target" className="flex flex-wrap gap-1">
              <button type="button" className="ta-btn" aria-pressed={mapTarget === 'a'} onClick={() => { setMapTarget('a'); setMapNotice('') }}>Primary (A)</button>
              <button type="button" className="ta-btn" aria-pressed={mapTarget === 'b'} onClick={() => { setMapTarget('b'); setMapNotice('') }}>Compare (B)</button>
            </div>
            <div role="group" aria-label="Map projection" className="flex gap-1">
              <button type="button" className="ta-btn" aria-pressed={s.projection === 'globe'} onClick={() => s.setProjection('globe')}>Globe</button>
              <button type="button" className="ta-btn" aria-pressed={s.projection === 'mercator'} onClick={() => s.setProjection('mercator')}>Flat</button>
            </div>
          </div>
        <div className="dashboard-map-stage">
          <MapView
            grid={hasGrid && showField ? field : null} layer={layer} frameYear={s.frameYear} scale={scale} projection={s.projection}
            regions={regions} dark opacity={.74} onInspect={setCell} onSelect={selectOnMap}
          />
          {hasGrid && showField && <div className="pointer-events-none absolute left-3 top-3 max-w-[min(30rem,calc(100%-4.5rem))] rounded border border-line bg-panel/90 px-3 py-2 backdrop-blur">
              <>
                <strong className="block font-medium">{layerTitle}</strong>
                <span className="ta-micro block">NASA GISS GISTEMP v4 · 2° grid</span>
                <span className="num mt-1 block text-xs" aria-live="polite">
                  {grid.status === 'loading' && !field ? 'Loading map frames…' : field && cell ? `${cell.pinned ? 'Pinned cell' : 'Cell'} ${cellText(cell, scale.unit, 2)}` : null}
                </span>
              </>
          </div>}
          {showField && grid.status === 'error' && (
            <div role="alert" className="absolute inset-x-3 bottom-14 mx-auto max-w-md rounded border border-line bg-panel p-3 text-center">
              Map frames failed to load ({grid.error}). The chart and evidence below are unaffected.{' '}
              <button type="button" className="ta-btn mt-2" onClick={grid.retry}>Retry map</button>
            </div>
          )}
        </div>
        {mapNotice && <p className="dashboard-map-note" role="status">{mapNotice}</p>}
        <div className="dashboard-map-footer">
          <a href="https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/" target="_blank" rel="noreferrer">NASA Blue Marble</a>
          {dataset && <a href="#region-stats" className="map-stats-jump">Selected region stats ↓</a>}
          {hasGrid && <div role="group" aria-label="Map layer" className="flex flex-wrap gap-1">
            <button type="button" className="ta-btn" aria-pressed={!showField} onClick={() => { s.setFieldVisible(false); setPlaying(false); s.setLayer('observed') }}>Imagery</button>
            <button type="button" className="ta-btn" aria-pressed={showField && layer === 'observed'} onClick={() => { s.setFieldVisible(true); s.setLayer('observed') }}>Anomaly</button>
            <button type="button" className="ta-btn" aria-pressed={showField && layer === 'trend'} disabled={s.endYear - s.startYear < 2} onClick={() => { s.setFieldVisible(true); setPlaying(false); s.setLayer('trend') }}>Trend</button>
          </div>}
        </div>

        {hasGrid && showField && <div className="grid items-center gap-x-6 gap-y-2 border-t border-line bg-panel px-3 py-2">
          {layer === 'observed' &&
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" className="ta-btn" onClick={() => { if (!playing && s.frameYear >= s.endYear) s.setFrameYear(s.startYear); setPlaying((p) => !p) }} aria-label={playing ? 'Pause timeline' : 'Play annual frames'} disabled={s.startYear === s.endYear}>
              {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            </button>
            <span className="num ta-micro">{s.startYear}</span>
            <input
              type="range" className="min-h-[36px] w-full min-w-0 accent-[var(--ta-accent)]" aria-label="Map year"
              min={s.startYear} max={s.endYear} step={1} value={s.frameYear} disabled={s.startYear === s.endYear}
              onChange={(e) => { setPlaying(false); s.setFrameYear(Number(e.target.value)) }}
            />
            <span className="num ta-micro">{s.endYear}</span>
            <output className="num min-w-[3.2rem] rounded border border-line px-2 py-1 text-center">{s.frameYear}</output>
          </div>}
          {field && (
            <div className="min-w-0" role="group" aria-label={`Colour scale, ${scale.unit}`}>
              <div className="flex items-center gap-2">
                <div className="h-[8px] flex-1 rounded-sm" style={{ background: cssGradient(scale) }} />
                <span className="flex items-center gap-1 ta-micro"><i className="inline-block h-[8px] w-[14px] rounded-sm border border-line" style={{ background: 'var(--ta-map-nodata)' }} /> no data</span>
              </div>
              <div className="num flex justify-between pr-[4.6rem] text-[11px] text-dim">
                {scale.ticks.map((t, i) => (
                  <span key={t}>{i === 0 ? '≤ ' : i === scale.ticks.length - 1 ? '≥ ' : ''}{signed(t, t % 1 === 0 ? 0 : 2)}</span>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="ta-micro">{layer === 'trend' ? `${scale.unit} · shows how fast, not how certain` : `${scale.unit} warmer or cooler than the 1951–1980 average`}</span>
              </div>
            </div>
          )}
        </div>}

          </section>
          {dataset && <AtlasOverview dataset={dataset} data={data} regionLabel={regions.find((r) => r.slot === 'a')?.label} onAnalyze={() => view('analyze')} />}
          </div>
        )}
      </main>
      </div>
    </div>
    </>
  )
}
