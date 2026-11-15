import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import 'echarts-gl'
import type { MonthlyPoint } from '@/lib/types'
import { signed } from '@/lib/format'

export interface MonthSurfaceProps {
  rows: MonthlyPoint[]
  unit: string
  regionLabel: string
  coverageText: string
  scale: { min: number; max: number; colors: string[] }
  selectedYear: number | null
  onSelectYear?: (year: number) => void
  dark: boolean
}

type View = '3d' | 'heatmap' | 'table'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const INITIAL_CAMERA = { alpha: 28, beta: 35, distance: 210 }

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function mq(q: string): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches
}

export function MonthSurface(props: MonthSurfaceProps) {
  const { rows, unit, regionLabel, coverageText, scale, selectedYear, onSelectYear, dark } = props
  const webgl = useMemo(() => hasWebGL(), [])
  const [view, setView] = useState<View>(() =>
    !webgl || mq('(max-width: 640px)') ? 'heatmap' : '3d',
  )
  const years = useMemo(() => {
    const s = new Set<number>()
    for (const r of rows) s.add(r.year)
    return [...s].sort((a, b) => a - b)
  }, [rows])
  const lookup = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const r of rows) m.set(`${r.year}-${r.month}`, r.value)
    return m
  }, [rows])
  const lastYear = years.length ? years[years.length - 1] : null
  const [year, setYear] = useState<number | null>(selectedYear ?? lastYear)
  const [month, setMonth] = useState(1)

  useEffect(() => {
    if (selectedYear !== null) setYear(selectedYear)
  }, [selectedYear])
  useEffect(() => {
    if (year === null || !years.includes(year)) {
      if (lastYear !== null && selectedYear === null) setYear(lastYear)
    }
  }, [years, lastYear, year, selectedYear])

  const pickYear = (y: number) => {
    setYear(y)
    onSelectYear?.(y)
  }
  const pickRef = useRef({ pickYear, setMonth })
  pickRef.current = { pickYear, setMonth }

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  const colors = {
    ink: dark ? '#eef3f8' : '#17252c',
    dim: dark ? '#aebdcc' : '#4b5b6b',
    line: dark ? '#30434e' : '#c6cfd9',
    accent: dark ? '#ffb347' : '#9a5200',
  }

  // init / dispose chart for chart views
  useEffect(() => {
    if (view === 'table' || !containerRef.current) return
    const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    chartRef.current = chart
    chart.on('click', (p: unknown) => {
      const ev = p as { seriesId?: string; value?: unknown }
      if (ev.seriesId !== 'main' || !Array.isArray(ev.value)) return
      const v = ev.value as number[]
      // heatmap: [yearIndex, monthIndex, val]; surface: [year, monthIndex, val]
      const y = view === 'heatmap' ? years[v[0]] : v[0]
      const m = Math.round(v[1]) + 1
      if (typeof y === 'number' && m >= 1 && m <= 12) {
        pickRef.current.pickYear(y)
        pickRef.current.setMonth(m)
      }
    })
    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [view, years])

  const buildOption = (): Record<string, unknown> => {
    const reduced = mq('(prefers-reduced-motion: reduce)')
    const visualMap = {
      show: false,
      type: 'continuous',
      min: scale.min,
      max: scale.max,
      dimension: 2,
      seriesIndex: 0,
      inRange: { color: scale.colors },
      outOfRange: { color: scale.colors },
    }
    const textStyle = { color: colors.ink, fontFamily: getComputedStyle(document.body).fontFamily }
    const base = { backgroundColor: 'transparent', animation: !reduced, textStyle }
    const val = (y: number, m: number) => {
      const v = lookup.get(`${y}-${m}`)
      return v === null || v === undefined ? null : v
    }
    if (view === 'heatmap') {
      const data: (number | string)[][] = []
      years.forEach((y, xi) => {
        for (let m = 1; m <= 12; m++) {
          const v = val(y, m)
          if (v !== null) data.push([xi, m - 1, v])
        }
      })
      const yi = year === null ? -1 : years.indexOf(year)
      return {
        ...base,
        tooltip: {
          formatter: (p: { value: number[] }) =>
            `${MONTHS[p.value[1]]} ${years[p.value[0]]}: ${signed(p.value[2], 2)} ${unit}`,
        },
        grid: { left: 44, right: 12, top: 12, bottom: 40 },
        xAxis: {
          type: 'category',
          data: years.map(String),
          name: 'Year',
          nameLocation: 'middle',
          nameGap: 26,
          axisLabel: { color: colors.dim },
          axisLine: { lineStyle: { color: colors.line } },
          nameTextStyle: { color: colors.dim },
        },
        yAxis: {
          type: 'category',
          data: MONTHS,
          name: 'Month',
          inverse: true,
          axisLabel: { color: colors.dim },
          axisLine: { lineStyle: { color: colors.line } },
          nameTextStyle: { color: colors.dim },
        },
        visualMap: { ...visualMap, seriesIndex: 0 },
        series: [
          {
            id: 'main',
            type: 'heatmap',
            data,
            progressive: 0,
            emphasis: { itemStyle: { borderColor: colors.ink, borderWidth: 1 } },
            markArea:
              yi >= 0
                ? {
                    silent: true,
                    itemStyle: { color: 'transparent', borderColor: colors.accent, borderWidth: 2 },
                    data: [[{ xAxis: yi, yAxis: 0 }, { xAxis: yi, yAxis: 11 }]],
                  }
                : undefined,
          },
        ],
      }
    }
    // 3D surface
    const surf: (number | string)[][] = []
    for (const y of years) {
      for (let m = 1; m <= 12; m++) {
        const v = val(y, m)
        surf.push([y, m - 1, v === null ? '-' : v])
      }
    }
    const axisCommon = {
      axisLine: { lineStyle: { color: colors.line } },
      axisLabel: { textStyle: { color: colors.dim } },
      nameTextStyle: { color: colors.dim },
      splitLine: { lineStyle: { color: colors.line, opacity: 0.6 } },
    }
    const series: Record<string, unknown>[] = [
      {
        id: 'main',
        type: 'surface',
        data: surf,
        shading: 'color',
        wireframe: { show: true, lineStyle: { color: colors.line, width: 0.5, opacity: 0.5 } },
      },
    ]
    if (scale.min < 0 && scale.max > 0 && years.length) {
      const y0 = years[0]
      const y1 = years[years.length - 1]
      series.push({
        id: 'zero',
        type: 'surface',
        silent: true,
        shading: 'color',
        itemStyle: { color: colors.dim, opacity: 0.18 },
        wireframe: { show: false },
        data: [
          [y0, 0, 0],
          [y0, 11, 0],
          [y1, 0, 0],
          [y1, 11, 0],
        ],
      })
    }
    if (year !== null) {
      const line: number[][] = []
      for (let m = 1; m <= 12; m++) {
        const v = val(year, m)
        if (v !== null) line.push([year, m - 1, v])
      }
      series.push({
        id: 'sel',
        type: 'scatter3D',
        silent: true,
        symbolSize: 5,
        itemStyle: { color: colors.accent, borderColor: colors.ink, borderWidth: 0.5 },
        data: line,
      })
    }
    return {
      ...base,
      tooltip: {
        formatter: (p: { seriesId?: string; value: (number | string)[] }) =>
          p.seriesId === 'main' && typeof p.value[2] === 'number'
            ? `${MONTHS[p.value[1] as number]} ${p.value[0]}: ${signed(p.value[2], 2)} ${unit}`
            : '',
      },
      visualMap,
      xAxis3D: { type: 'value', name: 'Year', min: years[0], max: years[years.length - 1], ...axisCommon },
      yAxis3D: {
        type: 'value',
        name: 'Month',
        min: 0,
        max: 11,
        interval: 1,
        ...axisCommon,
        axisLabel: { textStyle: { color: colors.dim }, formatter: (v: number) => MONTHS[v] ?? '' },
      },
      zAxis3D: { type: 'value', name: `Value (${unit})`, ...axisCommon },
      grid3D: {
        boxWidth: 120,
        boxDepth: 70,
        boxHeight: 50,
        environment: 'none',
        axisPointer: { show: false },
        viewControl: {
          ...INITIAL_CAMERA,
          animation: !reduced,
        },
        light: { main: { intensity: 1 }, ambient: { intensity: 0.4 } },
      },
      series,
    }
  }

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || view === 'table') return
    chart.setOption(buildOption() as echarts.EChartsCoreOption, { notMerge: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rows, lookup, years, year, scale, unit, dark])

  const resetView = () => {
    chartRef.current?.setOption({
      grid3D: { viewControl: { ...INITIAL_CAMERA } },
    } as unknown as echarts.EChartsCoreOption)
  }

  const curVal = year === null ? null : (lookup.get(`${year}-${month}`) ?? null)
  const readout =
    year === null
      ? 'No data'
      : `${MONTHS[month - 1]} ${year} · ${curVal === null ? 'no data' : `${signed(curVal, 2)} ${unit}`} · ${coverageText}`

  const views: [View, string][] = [
    ['3d', '3D surface'],
    ['heatmap', '2D heatmap'],
    ['table', 'Table'],
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Surface view">
        {views.map(([v, label]) => (
          <button
            key={v}
            type="button"
            className="ta-btn"
            aria-pressed={view === v}
            disabled={v === '3d' && !webgl}
            onClick={() => setView(v)}
          >
            {label}
          </button>
        ))}
        {view === '3d' && (
          <button type="button" className="ta-btn" onClick={resetView}>
            Reset view
          </button>
        )}
        {!webgl && (
          <span className="ta-micro" style={{ color: 'var(--ta-dim)' }}>
            3D needs WebGL, which is unavailable in this browser
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="ta-micro flex flex-col gap-1">
          Month
          <select className="ta-select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="ta-micro flex flex-col gap-1">
          Year
          <select
            className="ta-select"
            value={year ?? ''}
            onChange={(e) => pickYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <p className="num" aria-live="polite" style={{ color: 'var(--ta-ink)' }}>
          {readout}
        </p>
      </div>

      {view === 'table' ? (
        <div tabIndex={0} style={{ maxHeight: 260, overflow: 'auto' }} aria-label={`Monthly values for ${regionLabel}`}>
          <table className="num w-full text-right">
            <caption className="sr-only">
              Monthly values of {regionLabel} in {unit}, rows are years, columns are months
            </caption>
            <thead>
              <tr>
                <th scope="col" className="text-left">Year</th>
                {MONTHS.map((m) => (
                  <th key={m} scope="col">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y} style={y === year ? { outline: '2px solid var(--ta-accent)' } : undefined}>
                  <th scope="row" className="text-left">{y}</th>
                  {MONTHS.map((_, i) => {
                    const v = lookup.get(`${y}-${i + 1}`)
                    return <td key={i}>{v === null || v === undefined ? '–' : signed(v, 2)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            role="img"
            aria-label={`Year by month surface of ${regionLabel}, values in ${unit}; use the Table view for exact values`}
            style={{ width: '100%', height: 320 }}
          />
          {view === 'heatmap' && (
            <p className="ta-micro" style={{ color: 'var(--ta-dim)' }}>Blank = no data</p>
          )}
        </>
      )}
    </div>
  )
}
