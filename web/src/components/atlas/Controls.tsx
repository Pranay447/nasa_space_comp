import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { useAtlas } from '@/lib/store'
import type { Dataset } from '@/lib/types'

const GROUPS = ['Atmosphere', 'Water', 'Land'] as const

/** Searchable variable list grouped by Atmosphere / Water / Land. Unavailable sources explain why. */
export function VariablePicker({ datasets, current }: { datasets: Dataset[]; current: Dataset | null }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const setDataset = useAtlas((s) => s.setDataset)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [open])

  const match = (d: Dataset) => `${d.title} ${d.productVersion} ${d.unit} ${d.group}`.toLowerCase().includes(q.toLowerCase())
  return (
    <div ref={wrap} className="relative min-w-0">
      <button ref={btn} type="button" className="ta-btn max-w-full" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span className="ta-micro">Variable</span>
        <span className="truncate">{current?.shortTitle ?? 'Loading…'}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} role="dialog" aria-label="Choose a variable" className="ta-panel absolute left-0 top-full z-50 mt-1 w-[min(26rem,calc(100vw-1.5rem))] p-2 shadow-xl">
          <label className="flex items-center gap-2 px-1 pb-2">
            <Search size={14} aria-hidden="true" className="text-dim" />
            <span className="sr-only">Search variables</span>
            <input autoFocus className="ta-input w-full" placeholder="Search variables, products, units" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <div className="max-h-[60vh] overflow-auto">
            {GROUPS.map((g) => {
              const items = datasets.filter((d) => d.group === g && match(d))
              return (
                <section key={g} aria-label={g} className="mb-2">
                  <h3 className="ta-micro px-1 py-1 uppercase tracking-wide">{g}</h3>
                  {items.length === 0 && <p className="ta-micro px-1">{q ? 'No match.' : 'No verified source in this build yet.'}</p>}
                  {items.map((d) => {
                    const off = d.status !== 'available'
                    return (
                      <button
                        key={d.datasetId}
                        type="button"
                        aria-disabled={off}
                        aria-current={d.datasetId === current?.datasetId}
                        onClick={() => { if (!off) { setDataset(d.datasetId); setOpen(false); btn.current?.focus() } }}
                        className={`block w-full rounded border border-transparent px-2 py-2 text-left hover:border-control aria-[current=true]:border-accent ${off ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                      >
                        <span className="block font-medium">{d.title} <span className="num ta-micro">({d.unit})</span></span>
                        <span className="ta-micro block">{d.productVersion}</span>
                        {off && <span className="mt-1 block text-xs text-danger">Unavailable: {d.statusReason}</span>}
                        {!off && d.capabilityNotes[0] && <span className="ta-micro mt-1 block">{d.capabilityNotes[0]}</span>}
                      </button>
                    )
                  })}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** Named-region select plus a coordinate form (the keyboard alternative to drawing on the map). */
export function RegionPicker({ slot, dataset, value, other }: { slot: 'a' | 'b'; dataset: Dataset; value: string | null; other: string | null }) {
  const setRegion = useAtlas((s) => s.setRegion)
  const isBox = !!value?.startsWith('box:')
  const [custom, setCustom] = useState(isBox)
  const [box, setBox] = useState(() => (isBox ? value!.slice(4).split(',') : ['-20', '-10', '20', '10']))
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  useEffect(() => {
    setCustom(!!value?.startsWith('box:'))
    if (value?.startsWith('box:')) setBox(value.slice(4).split(','))
    setError(null)
  }, [value])

  const apply = () => {
    const [w, s, e, n] = box.map(Number)
    if ([w, s, e, n].some((v) => !Number.isFinite(v))) return setError('Enter four numbers.')
    if (s < -90 || n > 90 || s >= n) return setError('Latitude: −90 ≤ south < north ≤ 90.')
    if (w < -180 || w > 180 || e < -180 || e > 180 || w === e) return setError('Longitude: −180 to 180, west ≠ east. West greater than east crosses the antimeridian.')
    setError(null)
    setRegion(slot, `box:${w},${s},${e},${n}`)
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className={`num grid h-6 w-6 shrink-0 place-items-center rounded border text-xs ${slot === 'a' ? 'border-series-a text-series-a' : 'border-series-b text-series-b'}`}>{slot.toUpperCase()}</span>
        <select
          id={id}
          aria-label={slot === 'a' ? 'Primary region' : 'Comparison region'}
          className="ta-select w-full"
          value={custom ? '__custom' : (value ?? '')}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__custom') return setCustom(true)
            setCustom(false)
            setRegion(slot, v || null)
          }}
        >
          {slot === 'b' && <option value="">No comparison region</option>}
          {dataset.supportedRegions.map((r) => (
            <option key={r.id} value={r.id} disabled={r.id === other}>{r.label}</option>
          ))}
          {dataset.customRegions && <option value="__custom">Custom coordinate box…</option>}
        </select>
      </label>
      {custom && (
        <form className="mt-2 grid grid-cols-4 gap-1" onSubmit={(e) => { e.preventDefault(); apply() }} aria-label={`Custom box for region ${slot.toUpperCase()}`}>
          {(['West', 'South', 'East', 'North'] as const).map((name, i) => (
            <label key={name} className="ta-micro min-w-0">
              {name}°
              <input className="ta-input num w-full" inputMode="decimal" value={box[i]} onChange={(e) => setBox((b) => b.map((x, k) => (k === i ? e.target.value : x)))} />
            </label>
          ))}
          <button type="submit" className="ta-btn col-span-4">Apply box to {slot.toUpperCase()}</button>
          {error && <p role="alert" className="col-span-4 text-xs text-danger">{error}</p>}
        </form>
      )}
    </div>
  )
}

/** Inclusive analysis year window. Commits on blur or Enter so typing does not fire requests. */
export function YearWindow({ dataset }: { dataset: Dataset }) {
  const start = useAtlas((s) => s.startYear)
  const end = useAtlas((s) => s.endYear)
  const setYears = useAtlas((s) => s.setYears)
  const [draft, setDraft] = useState([String(start), String(end)])
  useEffect(() => setDraft([String(start), String(end)]), [start, end])
  const commit = () => {
    const [a, b] = draft.map(Number)
    if (Number.isFinite(a) && Number.isFinite(b)) setYears(Math.min(a, b), Math.max(a, b))
    else setDraft([String(start), String(end)])
  }
  return (
    <fieldset className="flex items-center gap-1" aria-label={`Analysis years, inclusive, ${dataset.period.startYear} to ${dataset.period.endYear}`}>
      <span className="ta-micro">Years</span>
      {[0, 1].map((i) => (
        <input
          key={i}
          aria-label={i === 0 ? 'First year' : 'Last year'}
          className="ta-input num w-[4.5rem]"
          type="number"
          min={dataset.period.startYear}
          max={dataset.period.endYear}
          value={draft[i]}
          onChange={(e) => setDraft((d) => d.map((x, k) => (k === i ? e.target.value : x)))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit() }}
        />
      ))}
    </fieldset>
  )
}
