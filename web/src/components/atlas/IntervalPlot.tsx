import { interval, signed } from '@/lib/format'

export interface IntervalRow {
  key: 'a' | 'b' | 'diff'
  label: string
  slope: number | null
  low: number | null
  high: number | null
  stateLabel: string
}

export interface IntervalPlotProps {
  rows: IntervalRow[]
  unit: string
  digits: number
}

const COLOR: Record<IntervalRow['key'], string> = {
  a: 'var(--ta-series-a)',
  b: 'var(--ta-series-b)',
  diff: 'var(--ta-diff)',
}

const W = 1000
const ROW_H = 28
const PAD_X = 12

function isNum(v: number | null): v is number {
  return v !== null && Number.isFinite(v)
}

function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / mag
  const f = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10
  return f * mag
}

function computeScale(rows: IntervalRow[]) {
  const vals: number[] = [0]
  for (const r of rows) {
    if (!isNum(r.slope)) continue
    vals.push(r.slope)
    if (isNum(r.low)) vals.push(r.low)
    if (isNum(r.high)) vals.push(r.high)
  }
  let lo = Math.min(...vals)
  let hi = Math.max(...vals)
  if (hi - lo === 0) {
    lo = -1
    hi = 1
  }
  const pad = (hi - lo) * 0.08
  lo -= pad
  hi += pad
  const step = niceStep(hi - lo, 4)
  const ticks: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) {
    ticks.push(Math.abs(t) < step * 1e-9 ? 0 : Number(t.toPrecision(12)))
  }
  const x = (v: number) => PAD_X + ((v - lo) / (hi - lo)) * (W - 2 * PAD_X)
  const pct = (v: number) => (x(v) / W) * 100
  return { x, pct, ticks, step }
}

function tickDigits(step: number): number {
  return Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)))
}

function Marker({ kind, cx, cy, color, hollow }: { kind: IntervalRow['key']; cx: number; cy: number; color: string; hollow: boolean }) {
  const common = {
    fill: hollow ? 'var(--ta-plot, transparent)' : color,
    stroke: color,
    strokeWidth: 2,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  // markers drawn in a non-stretched coordinate system via transform below
  if (kind === 'a') return <circle cx={cx} cy={cy} r={6} {...common} />
  if (kind === 'b') return <rect x={cx - 5.5} y={cy - 5.5} width={11} height={11} {...common} />
  return <polygon points={`${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}`} {...common} />
}

export function IntervalPlot({ rows, unit, digits }: IntervalPlotProps) {
  const { x, pct, ticks, step } = computeScale(rows)
  const td = tickDigits(step)
  const zeroX = x(0)

  const aria =
    `Rates of change in ${unit}. ` +
    rows
      .map((r) =>
        r.slope === null
          ? `${r.label}: no rate available, ${r.stateLabel}.`
          : `${r.label}: ${signed(r.slope, digits)} ${unit}, 95% interval ${interval(r.low, r.high, digits)}, ${r.stateLabel}.`,
      )
      .join(' ')

  return (
    <div role="img" aria-label={aria} className="w-full">
      <div aria-hidden="true">
        {rows.map((r) => {
          const has = isNum(r.slope)
          const hasInt = has && isNum(r.low) && isNum(r.high)
          const color = COLOR[r.key]
          return (
            <div key={r.key} className="mb-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px] leading-tight">
                <span className="text-ink">{r.label}</span>
                <span className="num text-ink">
                  {has ? `${signed(r.slope, digits)} (${interval(r.low, r.high, digits)})` : ''}
                  <span className="ml-2 text-dim">{r.stateLabel}</span>
                </span>
              </div>
              <svg viewBox={`0 0 ${W} ${ROW_H}`} preserveAspectRatio="none" width="100%" height={ROW_H} className="block">
                <line x1={zeroX} x2={zeroX} y1={0} y2={ROW_H} stroke="var(--ta-ink)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                {hasInt && (
                  <g stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke">
                    <line x1={x(r.low as number)} x2={x(r.high as number)} y1={ROW_H / 2} y2={ROW_H / 2} vectorEffect="non-scaling-stroke" />
                    <line x1={x(r.low as number)} x2={x(r.low as number)} y1={ROW_H / 2 - 6} y2={ROW_H / 2 + 6} vectorEffect="non-scaling-stroke" />
                    <line x1={x(r.high as number)} x2={x(r.high as number)} y1={ROW_H / 2 - 6} y2={ROW_H / 2 + 6} vectorEffect="non-scaling-stroke" />
                  </g>
                )}
              </svg>
              {has && (
                // Marker in an overlay so its shape is not distorted by preserveAspectRatio="none"
                <div className="relative" style={{ height: 0 }}>
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 16 16"
                    className="absolute"
                    style={{ left: `calc(${pct(r.slope as number)}% - 8px)`, top: -ROW_H / 2 - 8 }}
                  >
                    <Marker kind={r.key} cx={8} cy={8} color={color} hollow={!hasInt} />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
        <div className="relative mt-1 h-5 border-t border-line">
          {ticks.map((t) => (
            <span
              key={t}
              className="num absolute top-0.5 -translate-x-1/2 text-[11px] text-dim"
              style={{ left: `${pct(t)}%` }}
            >
              {signed(t, td)}
            </span>
          ))}
        </div>
        <div className="ta-micro mt-1 text-center">{unit}</div>
      </div>
    </div>
  )
}
