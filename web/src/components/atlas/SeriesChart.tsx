import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { plain, signed } from '@/lib/format'
import type { AnnualPoint } from '@/lib/types'

export interface ChartSeries {
  slot: 'a' | 'b'
  label: string
  points: AnnualPoint[]
  fitted: AnnualPoint[] | null
}

export interface SeriesChartProps {
  series: ChartSeries[]
  unit: string
  digits: number
  axisLabel: string
  frameYear: number
  onSelectYear: (year: number) => void
  dark: boolean
  zeroLine: boolean
}

/** Annual series with fitted lines over their observed span and a crosshair on the shared frame year. */
export function SeriesChart({ series, unit, digits, axisLabel, frameYear, onSelectYear, dark, zeroLine }: SeriesChartProps) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const select = useRef(onSelectYear)
  select.current = onSelectYear

  useEffect(() => {
    if (!el.current) return
    const c = echarts.init(el.current, undefined, { renderer: 'canvas' })
    chart.current = c
    c.getZr().on('click', (e: { offsetX: number; offsetY: number }) => {
      const [x] = c.convertFromPixel({ gridIndex: 0 }, [e.offsetX, e.offsetY])
      if (Number.isFinite(x)) select.current(Math.round(x))
    })
    const ro = new ResizeObserver(() => c.resize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      c.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    const c = chart.current
    if (!c) return
    const ink = dark ? '#eef3f8' : '#17252c'
    const dim = dark ? '#aebdcc' : '#4b5b6b'
    const line = dark ? '#30434e' : '#c6cfd9'
    const color = { a: dark ? '#ffb347' : '#9a5200', b: dark ? '#8ec5ff' : '#1f63a8' }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const years = series.flatMap((s) => s.points.map((p) => p.year))
    const min = Math.min(...years)
    const max = Math.max(...years)
    c.setOption(
      {
        animation: !reduced,
        animationDuration: 200,
        textStyle: { fontFamily: getComputedStyle(document.body).fontFamily, color: ink },
        grid: { left: 52, right: 92, top: 14, bottom: 30 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: dark ? '#111e28' : '#ffffff',
          borderColor: line,
          textStyle: { color: ink, fontSize: 12 },
          formatter: (items: { seriesName: string; value: [number, number | null]; marker: string; seriesId?: string }[]) => {
            const obs = items.filter((i) => !String(i.seriesId).startsWith('fit'))
            if (!obs.length) return ''
            return `<b>${obs[0].value[0]}</b><br/>` + obs.map((i) => `${i.marker}${i.seriesName}: ${i.value[1] == null ? 'no data' : `${zeroLine ? signed(i.value[1], digits) : plain(i.value[1], digits)} ${unit}`}`).join('<br/>')
          },
        },
        xAxis: {
          type: 'value', min, max, minInterval: 1,
          axisLabel: { color: dim, formatter: (v: number) => String(v), fontSize: 11 },
          axisLine: { lineStyle: { color: line } },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value', scale: true, name: axisLabel, nameLocation: 'middle', nameGap: 38,
          nameTextStyle: { color: dim, fontSize: 11 },
          axisLabel: { color: dim, fontSize: 11 },
          splitLine: { lineStyle: { color: line, opacity: 0.6 } },
        },
        series: [
          ...series.map((s, i) => ({
            id: `obs-${s.slot}`,
            name: `${s.slot.toUpperCase()} · ${s.label}`,
            type: 'line',
            data: s.points.map((p) => [p.year, p.value]),
            connectNulls: false,
            symbol: s.slot === 'a' ? 'circle' : 'rect',
            symbolSize: 5,
            lineStyle: { color: color[s.slot], width: 2, type: s.slot === 'a' ? 'solid' : [6, 4] },
            itemStyle: { color: color[s.slot] },
            endLabel: { show: true, formatter: s.slot.toUpperCase() + ' ' + shortLabel(s.label), color: color[s.slot], fontSize: 11, distance: 6 },
            labelLayout: { moveOverlap: 'shiftY' },
            emphasis: { disabled: true },
            markLine: i === 0 ? {
              silent: true, symbol: 'none', animation: false,
              data: [
                { xAxis: frameYear, lineStyle: { color: ink, width: 1, type: 'solid', opacity: 0.8 }, label: { formatter: String(frameYear), color: ink, fontSize: 11 } },
                ...(zeroLine ? [{ yAxis: 0, lineStyle: { color: dim, width: 1, type: 'solid', opacity: 0.7 }, label: { show: false } }] : []),
              ],
            } : undefined,
          })),
          ...series.filter((s) => s.fitted).map((s) => ({
            id: `fit-${s.slot}`,
            name: `${s.slot.toUpperCase()} fitted line`,
            type: 'line',
            data: s.fitted!.map((p) => [p.year, p.value]),
            symbol: 'none', silent: true,
            lineStyle: { color: color[s.slot], width: 1.2, opacity: 0.75, type: 'solid' },
            tooltip: { show: false },
          })),
        ],
      },
      { notMerge: true },
    )
  }, [series, unit, digits, axisLabel, frameYear, dark, zeroLine])

  const summary = series.map((s) => `${s.slot.toUpperCase()}, ${s.label}`).join('; ')
  return (
    <div
      ref={el}
      className="h-[220px] w-full"
      role="img"
      aria-label={`Annual time series in ${unit} for ${summary}. Thin straight lines are the fitted trends over the years used. Exact values are in the data table.`}
    />
  )
}

function shortLabel(label: string): string {
  const s = label.replace(/\s*\(.*\)$/, '').replace(/ band$| box$/, '')
  return s.length > 12 ? s.slice(0, 11) + '…' : s
}
