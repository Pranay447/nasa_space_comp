import { plain, signed } from '@/lib/format'

export interface SeriesTableColumn {
  key: string
  label: string
  values: (number | null)[]
}

export interface SeriesTableProps {
  caption: string
  years: number[]
  columns: SeriesTableColumn[]
  unit: string
  digits: number
  highlightYear?: number | null
  maxHeight?: number
  /** false for totals (e.g. rainfall), which should not carry a plus sign */
  signedValues?: boolean
}

export function SeriesTable({ caption, years, columns, unit, digits, highlightYear = null, maxHeight = 240, signedValues = true }: SeriesTableProps) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-auto rounded border border-line focus-visible:outline-2 focus-visible:outline-accent"
      style={{ maxHeight }}
    >
      <table className="w-full border-collapse text-[12px]">
        <caption className="ta-micro px-2 py-1 text-left">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 z-10 border-b border-line bg-panel px-2 py-1 text-left font-medium text-dim">
              Year
            </th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className="sticky top-0 z-10 border-b border-line bg-panel px-2 py-1 text-right font-medium text-dim">
                {c.label} ({unit})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((y, i) => {
            const current = highlightYear !== null && y === highlightYear
            return (
              <tr
                key={y}
                aria-current={current ? 'true' : undefined}
                className="border-b border-line"
                style={current ? { background: 'color-mix(in srgb, var(--ta-accent) 14%, transparent)' } : undefined}
              >
                <th scope="row" className="num px-2 py-0.5 text-left font-normal text-ink">
                  {y}
                </th>
                {columns.map((c) => {
                  const v = c.values[i] ?? null
                  return (
                    <td key={c.key} className="num px-2 py-0.5 text-right text-ink">
                      {v === null || Number.isNaN(v) ? <span className="text-dim">no data</span> : (signedValues ? signed : plain)(v, digits)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
