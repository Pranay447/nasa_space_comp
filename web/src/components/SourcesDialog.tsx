import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { SCENES } from '@/lib/scenes'
import { useAtlas } from '@/lib/store'

/** Imagery credits and dataset information. Dataset entries come from the same registry the atlas uses. */
export function SourcesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const datasets = useAtlas((s) => s.datasets)
  const load = useAtlas((s) => s.loadDatasets)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { d.showModal(); if (!datasets) load() }
    if (!open && d.open) d.close()
  }, [open, datasets, load])

  return (
    <dialog
      ref={ref} aria-labelledby="sources-heading" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className="m-auto max-h-[85vh] w-[min(44rem,calc(100%-1.5rem))] overflow-auto rounded-lg border border-line bg-panel p-0 text-ink backdrop:bg-black/60"
    >
      <div className="p-5">
        <header className="flex items-start justify-between gap-3">
          <h2 id="sources-heading" className="m-0 text-xl font-medium tracking-tight">Sources</h2>
          <button type="button" className="ta-btn" onClick={onClose} aria-label="Close sources"><X size={16} aria-hidden="true" /></button>
        </header>

        <h3 className="mb-1 mt-4 text-sm font-medium">Datasets</h3>
        {!datasets && <p className="ta-micro">Loading dataset records…</p>}
        <ul className="m-0 grid list-none gap-3 p-0">
          {datasets?.map((d) => (
            <li key={d.datasetId} className="rounded border border-line p-3">
              <strong className="font-medium">{d.title}</strong>{' '}
              <span className={`num rounded border px-1 text-xs ${d.status === 'available' ? 'border-accent text-accent' : 'border-danger text-danger'}`}>{d.status === 'available' ? 'in use' : 'not acquired'}</span>
              <span className="ta-micro block">{d.productVersion}</span>
              <span className="ta-micro block">Unit {d.unit}{d.baseline ? ` · anomaly vs ${d.baseline}` : ''} · {d.resolution} · {d.period.startYear}–{d.period.endYear}</span>
              <span className="mt-1 block text-sm">{d.source.citation}</span>
              <span className="block text-sm"><a href={d.source.url} target="_blank" rel="noreferrer">Direct source</a> · <a href={d.source.info} target="_blank" rel="noreferrer">Product information</a>{d.source.doi && <> · <a href={`https://doi.org/${d.source.doi}`} target="_blank" rel="noreferrer">doi:{d.source.doi}</a></>}</span>
              <span className="num mt-1 block break-all text-[11px] text-dim">Snapshot {d.snapshotId}</span>
              {d.status !== 'available' && <span className="mt-1 block text-sm text-danger">{d.statusReason}</span>}
            </li>
          ))}
        </ul>

        <h3 className="mb-1 mt-5 text-sm font-medium">Homepage imagery</h3>
        <ul className="m-0 grid list-none gap-3 p-0">
          {SCENES.map((s) => (
            <li key={s.id} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded border border-line p-3">
              <img src={s.photo} alt="" className="h-14 w-14 rounded object-cover" />
              <div className="min-w-0 text-sm">
                <a href={s.credit.url} target="_blank" rel="noreferrer">{s.credit.title}</a>
                <span className="block">{s.place} · {s.credit.acquired}</span>
                <span className="block">{s.credit.line}</span>
                {s.credit.note && <span className="ta-micro block">Note: {s.credit.note}</span>}
              </div>
            </li>
          ))}
        </ul>

        <h3 className="mb-1 mt-5 text-sm font-medium">Map and software</h3>
        <p className="text-sm">
          Coastlines: Natural Earth 1:110m (public domain) via the world-atlas package. Map rendering: MapLibre GL JS. Charts: Apache ECharts.
          Statistics: statsmodels. Interface components adapted from shadcn/ui and Aceternity UI. Parts of this app’s code were written with
          Claude (Anthropic); the NASA data are used as published and are not AI-generated.
        </p>
      </div>
    </dialog>
  )
}
