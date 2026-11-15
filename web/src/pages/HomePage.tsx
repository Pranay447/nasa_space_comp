import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Database, Globe, LayoutPanelLeft, Pause, Play } from 'lucide-react'
import { RegionalTables } from '@/components/atlas/RegionalTables'
import { SiteMasthead } from '@/components/SiteMasthead'
import { SCENES, atlasHref } from '@/lib/scenes'
import type { AnnualPoint, Fit } from '@/lib/types'

interface Hero {
  startYear: number
  endYear: number
  scenes: Record<string, { label: string; annualSeries: AnnualPoint[]; fit: Fit; statement: string }>
}

export function HomePage({ onSignup, onSources }: { onSignup: () => void; onSources: () => void }) {
  const [hero, setHero] = useState<Hero | null>(null)
  const [failed, setFailed] = useState(false)
  const [index, setIndex] = useState(0)
  const [year, setYear] = useState(2024)
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [auto, setAuto] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/data/hero.json', { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('Regional data unavailable')
      return response.json() as Promise<Hero>
    }).then((data) => {
      setHero(data)
      setYear(data.endYear)
    }).catch((error) => { if (error.name !== 'AbortError') setFailed(true) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    if (!auto || reduced) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % SCENES.length), 9000)
    return () => window.clearInterval(timer)
  }, [auto, reduced])

  const scene = SCENES[index]
  const rows = SCENES.flatMap((item) => {
    const series = hero?.scenes[item.id]
    return series ? [{ id: item.id, name: item.name, photo: item.photo, annualSeries: series.annualSeries, fit: series.fit }] : []
  })
  const [atlasPath, query] = atlasHref(scene).split('?')
  const params = new URLSearchParams(query)
  params.set('f', String(year))
  const investigation = `${atlasPath}?${params}`

  function selectRegion(id: string) {
    const next = SCENES.findIndex((item) => item.id === id)
    if (next < 0) return
    setAuto(false)
    setIndex(next)
  }

  return (
    <main className="editorial-home">
      <div className="editorial-landscape" aria-hidden="true">
        {SCENES.map((item) => <img key={item.id} src={item.photo} alt="" fetchPriority={item.id === scene.id ? 'high' : 'low'}
          data-active={item.id === scene.id} style={{ objectPosition: item.focus }} />)}
      </div>
      <SiteMasthead atlasHref={investigation} onSources={onSources} onSignup={onSignup} />
      <div className="editorial-stage">
        <div className="editorial-intro">
          <h1>See how Earth is changing.</h1>
          <p>Compare regional climate trends and explore decades of NASA observations.</p>
          <Link to={investigation} className="editorial-cta">Open the atlas <ArrowUpRight size={16} aria-hidden="true" /></Link>
        </div>
        <section className="editorial-demo" aria-label="Interactive Atlas preview">
          <header className="editorial-demo-bar"><LayoutPanelLeft size={15} aria-hidden="true" /> <span>Trend Atlas</span></header>
          <div className="editorial-demo-workspace">
            <nav className="editorial-demo-nav" aria-label="Preview navigation">
              <span aria-current="page"><LayoutPanelLeft /> Overview</span>
              <Link to={investigation}><Globe /> Open atlas</Link>
              <button type="button" onClick={onSources}><Database /> Sources</button>
              {!reduced && <button type="button" onClick={() => setAuto((running) => !running)}>{auto ? <Pause /> : <Play />}{auto ? 'Pause rotation' : 'Rotate regions'}</button>}
            </nav>
            <div className="editorial-demo-board">
              <div className="ledger-breadcrumb">Atlas <span aria-hidden="true">›</span> Regional overview</div>
              <RegionalTables rows={rows} selectedId={scene.id} year={year} startYear={hero?.startYear ?? 2001} endYear={hero?.endYear ?? 2024}
                unit="°C" rateUnit="°C per decade" digits={2} baseline="1951–1980" source="NASA GISS"
                onRegion={selectRegion} onYear={(next) => { setAuto(false); setYear(next) }}
                status={!hero ? (failed ? <p role="alert">Regional data unavailable.</p> : <p role="status">Loading NASA observations…</p>) : undefined} />
            </div>
          </div>
        </section>
        <div className="editorial-foreground" aria-hidden="true"><img src={scene.photo} alt="" style={{ objectPosition: scene.focus }} /></div>
      </div>
      <footer className="editorial-credit">
        <a href={scene.credit.url} target="_blank" rel="noreferrer">{scene.place} · NASA imagery</a>
        <button type="button" onClick={onSources}>Data and image credits</button>
      </footer>
    </main>
  )
}
