import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { feature, mesh } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import type { FeatureCollection, MultiLineString } from 'geojson'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import landTopo from 'world-atlas/land-110m.json'
import { GRID } from '@/lib/api'
import { colorAt, stopPositions } from '@/lib/colors'
import type { Scale } from '@/lib/colors'
import { cellIndex, graticule, gridCells, regionCenter, regionOutline, regionPolygon } from '@/lib/geo'
import { signed } from '@/lib/format'
import type { GridData } from '@/lib/useGrid'
import type { Bounds, Layer, Projection } from '@/lib/types'

export interface MapRegion { slot: 'a' | 'b'; label: string; bounds: Bounds }

export interface MapViewProps {
  grid: GridData | null // null → no gridded layer for this source
  layer: Layer
  frameYear: number
  scale: Scale
  projection: Projection
  regions: MapRegion[]
  dark: boolean
  opacity: number
  onInspect: (info: CellInfo | null) => void
  onSelect?: (lon: number, lat: number) => void
}

export interface CellInfo {
  lon: number // cell centre
  lat: number
  value: number | null // in scale units
  pinned: boolean
}

// Dev: MapLibre finds its worker next to its own module. Build: use the worker Vite bundled.
if (import.meta.env.PROD) maplibregl.setWorkerUrl(workerUrl)

const topo = landTopo as unknown as Topology
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const COAST = mesh(topo, topo.objects.land as any) as MultiLineString
const LAND = feature(topo, topo.objects.land) as unknown as FeatureCollection

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function theme(dark: boolean) {
  return dark
    ? { ocean: '#07121e', nodata: '#2b3944', coast: '#eef3f8', grat: '#9fb1c2', a: '#ffb347', b: '#8ec5ff', land: '#182a36' }
    : { ocean: '#dde5ec', nodata: '#b8c1cb', coast: '#17252c', grat: '#4b5b6b', a: '#9a5200', b: '#1f63a8', land: '#c9d2db' }
}

/** Value of a cell in display units for the active layer, or null when missing. */
function cellValue(grid: GridData | null, layer: Layer, frameYear: number, idx: number): number | null {
  if (!grid) return null
  if (layer === 'trend') {
    if (!grid.trend || grid.trend[idx] === GRID.missing) return null
    return grid.trend[idx] / 1000
  }
  const y = frameYear - grid.start
  if (y < 0 || y > grid.end - grid.start) return null
  const v = grid.frames[y * GRID.nlat * GRID.nlon + idx]
  return v === GRID.missing ? null : v / 100
}

function fillExpression(key: string, scale: Scale, nodata: string): ExpressionSpecification {
  const stops = stopPositions(scale).flatMap((s) => [s.value, s.color])
  return ['case', ['has', key], ['interpolate', ['linear'], ['get', key], ...stops], nodata] as ExpressionSpecification
}

function regionData(regions: MapRegion[]) {
  return {
    fill: {
      type: 'FeatureCollection' as const,
      features: regions.map((r) => ({ type: 'Feature' as const, properties: { slot: r.slot }, geometry: regionPolygon(r.bounds) })),
    },
    line: {
      type: 'FeatureCollection' as const,
      features: regions.flatMap((r) =>
        regionOutline(r.bounds).map((g) => ({ type: 'Feature' as const, properties: { slot: r.slot }, geometry: g })),
      ),
    },
  }
}

export function MapView(props: MapViewProps) {
  const [gl] = useState(webglAvailable)
  return gl ? <GlMap {...props} /> : <StaticMap {...props} />
}

function globeZoom(el: HTMLElement) {
  return Math.max(.4, Math.log2(Math.min(el.clientWidth, el.clientHeight) * 2.8 / 512))
}

function GlMap({ grid, layer, frameYear, scale, projection, regions, dark, opacity, onInspect, onSelect }: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const pinned = useRef<number | null>(null)
  const live = useRef({ grid, layer, frameYear, onInspect, onSelect, projection })
  live.current = { grid, layer, frameYear, onInspect, onSelect, projection }
  const reduced = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  // Create the single map instance.
  useEffect(() => {
    if (!el.current) return
    let map: MlMap
    try {
      map = new maplibregl.Map({
        container: el.current,
        style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#07121e' } }] },
        center: [14, 26],
        zoom: globeZoom(el.current),
        minZoom: 0.4,
        maxZoom: 5,
        attributionControl: false,
        renderWorldCopies: true,
      })
    } catch (e) {
      setFailed((e as Error).message)
      return
    }
    mapRef.current = map
    ;(window as unknown as { __taMap?: MlMap }).__taMap = map
    map.on('error', (e) => console.warn('[map]', e.error?.message ?? e))
    map.dragRotate.disable()
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('load', () => {
      map.addSource('blue-marble', { type: 'raster', tiles: [`${window.location.origin}/earth/{z}/{x}/{y}.jpg`], tileSize: 256, maxzoom: 3 })
      map.addSource('grid', { type: 'geojson', data: gridCells() })
      map.addSource('land', { type: 'geojson', data: LAND })
      map.addSource('coast', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: COAST } })
      map.addSource('graticule', { type: 'geojson', data: graticule() })
      map.addSource('region-fill', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addSource('region-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#182a36' } })
      map.addLayer({ id: 'blue-marble', type: 'raster', source: 'blue-marble', paint: { 'raster-saturation': -.12, 'raster-contrast': .12 } })
      map.addLayer({ id: 'grid', type: 'fill', source: 'grid', paint: { 'fill-color': '#2b3944', 'fill-antialias': false } })
      map.addLayer({ id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': '#9fb1c2', 'line-opacity': 0.22, 'line-width': 0.5 } })
      map.addLayer({ id: 'coast', type: 'line', source: 'coast', paint: { 'line-color': '#eef3f8', 'line-opacity': 0.85, 'line-width': 0.9 } })
      map.addLayer({ id: 'region-fill', type: 'fill', source: 'region-fill', paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.08 } })
      map.addLayer({ id: 'region-halo', type: 'line', source: 'region-line', paint: { 'line-color': '#07121e', 'line-width': 4.5, 'line-opacity': 0.75 } })
      map.addLayer({ id: 'region-a', type: 'line', source: 'region-line', filter: ['==', ['get', 'slot'], 'a'], paint: { 'line-color': '#ffb347', 'line-width': 2.2 } })
      map.addLayer({ id: 'region-b', type: 'line', source: 'region-line', filter: ['==', ['get', 'slot'], 'b'], paint: { 'line-color': '#8ec5ff', 'line-width': 2.2, 'line-dasharray': [2.5, 1.5] } })
      setReady(true)
    })
    const report = (lngLat: maplibregl.LngLat, pin: boolean) => {
      const { grid: g, layer: l, frameYear: fy, onInspect: cb } = live.current
      const idx = cellIndex(lngLat.lng, lngLat.lat)
      if (idx === null || !g) return
      if (pin) pinned.current = pinned.current === idx ? null : idx
      const use = pinned.current ?? idx
      cb({
        lon: -179 + (use % GRID.nlon) * GRID.cell,
        lat: -89 + Math.floor(use / GRID.nlon) * GRID.cell,
        value: cellValue(g, l, fy, use),
        pinned: pinned.current !== null,
      })
    }
    map.on('mousemove', (e) => report(e.lngLat, false))
    map.on('click', (e) => {
      if (map.project(e.lngLat).dist(e.point) > 3) return
      live.current.onSelect?.(e.lngLat.wrap().lng, e.lngLat.lat)
      report(e.lngLat, true)
    })
    map.on('mouseout', () => { if (pinned.current === null) live.current.onInspect(null) })
    let previousFit = globeZoom(el.current)
    const ro = new ResizeObserver(() => {
      const nextFit = globeZoom(map.getContainer())
      map.resize()
      if (live.current.projection === 'globe' && nextFit !== previousFit) {
        map.jumpTo({ zoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + nextFit - previousFit)) })
      }
      previousFit = nextFit
    })
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Keep a pinned cell's readout in step with the frame and layer.
  useEffect(() => {
    if (pinned.current === null || !grid) return
    const use = pinned.current
    onInspect({
      lon: -179 + (use % GRID.nlon) * GRID.cell,
      lat: -89 + Math.floor(use / GRID.nlon) * GRID.cell,
      value: cellValue(grid, layer, frameYear, use),
      pinned: true,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameYear, layer, grid])

  // Attach every year's value to the cells once per window; frame changes then only swap a paint expression.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const fc = gridCells()
    if (grid) {
      const n = GRID.nlat * GRID.nlon
      const years = grid.end - grid.start + 1
      for (let c = 0; c < n; c++) {
        const p: Record<string, number> = {}
        for (let y = 0; y < years; y++) {
          const v = grid.frames[y * n + c]
          if (v !== GRID.missing) p[`f${grid.start + y}`] = v / 100
        }
        if (grid.trend && grid.trend[c] !== GRID.missing) p.t = grid.trend[c] / 1000
        fc.features[c].properties = p
      }
    }
    ;(map.getSource('grid') as GeoJSONSource).setData(fc)
    map.setLayoutProperty('grid', 'visibility', grid ? 'visible' : 'none')
  }, [ready, grid])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const t = theme(dark)
    map.setSky({ 'sky-color': '#061221', 'horizon-color': '#436b92', 'fog-color': '#152b41', 'atmosphere-blend': .85 })
    map.setPaintProperty('bg', 'background-color', t.ocean)
    map.setPaintProperty('land', 'fill-color', t.land)
    map.setPaintProperty('coast', 'line-color', t.coast)
    map.setPaintProperty('graticule', 'line-color', t.grat)
    map.setPaintProperty('region-halo', 'line-color', t.ocean)
    map.setPaintProperty('region-a', 'line-color', t.a)
    map.setPaintProperty('region-b', 'line-color', t.b)
    map.setPaintProperty('grid', 'fill-color', fillExpression(layer === 'trend' ? 't' : `f${frameYear}`, scale, t.nodata))
    map.setPaintProperty('grid', 'fill-opacity', opacity)
  }, [ready, dark, layer, frameYear, scale, opacity])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setProjection({ type: projection })
  }, [ready, projection])

  const regionKey = regions.map((r) => `${r.slot}:${r.bounds.west},${r.bounds.south},${r.bounds.east},${r.bounds.north}`).join('|')
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const d = regionData(regions)
    ;(map.getSource('region-fill') as GeoJSONSource).setData(d.fill)
    ;(map.getSource('region-line') as GeoJSONSource).setData(d.line)
    markers.current.forEach((m) => m.remove())
    markers.current = regions.map((r) => {
      const tag = document.createElement('div')
      tag.className = `ta-map-tag ta-map-tag-${r.slot}`
      tag.textContent = r.slot.toUpperCase()
      tag.setAttribute('aria-hidden', 'true')
      return new maplibregl.Marker({ element: tag }).setLngLat(regionCenter(r.bounds)).addTo(map)
    })
    if (onSelect) return
    // Aim at the regions for maps that are used for inspection rather than selection.
    const wide = (map.getContainer().clientWidth >= 600 ? 1.8 : 0.9)
    const small = regions.filter((r) => r.bounds.west !== -180 || r.bounds.east !== 180)
    const target =
      small.length === 1 && regions.length === 1
        ? { center: regionCenter(small[0].bounds), zoom: 2.6 }
        : small.length > 0
          ? { center: [regionCenter(small[0].bounds)[0], 0] as [number, number], zoom: wide }
          : { center: [0, 15] as [number, number], zoom: wide }
    if (reduced) map.jumpTo(target)
    else map.easeTo({ ...target, duration: 500 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, regionKey])

  if (failed) return <StaticMap {...{ grid, layer, frameYear, scale, projection, regions, dark, opacity, onInspect, onSelect }} note={failed} />
  return (
    <div
      ref={el}
      className="h-full w-full"
      role="application"
      aria-label={onSelect ? 'Interactive map. Drag to rotate or pan, zoom in for detail, and click to select an area. Region selectors are available above.' : 'Interactive map. Drag to pan, scroll to zoom, click a grid cell to read its value.'}
    />
  )
}

/** Non-WebGL fallback: the same real grid drawn on a 2D canvas in a plain latitude–longitude projection. */
function StaticMap({ grid, layer, frameYear, scale, regions, dark, onInspect, onSelect, note }: MapViewProps & { note?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const t = theme(dark)
    const W = c.width
    const H = c.height
    const px = W / GRID.nlon
    ctx.fillStyle = t.ocean
    ctx.fillRect(0, 0, W, H)
    if (grid) {
      for (let j = 0; j < GRID.nlat; j++)
        for (let i = 0; i < GRID.nlon; i++) {
          const v = cellValue(grid, layer, frameYear, j * GRID.nlon + i)
          if (v === null) ctx.fillStyle = t.nodata
          else {
            const [r, g, b] = colorAt(scale, v)
            ctx.fillStyle = `rgb(${r},${g},${b})`
          }
          ctx.fillRect(i * px, H - (j + 1) * px, px + 0.5, px + 0.5)
        }
    }
    const X = (lon: number) => ((lon + 180) / 360) * W
    const Y = (lat: number) => ((90 - lat) / 180) * H
    ctx.strokeStyle = t.coast
    ctx.globalAlpha = 0.8
    ctx.lineWidth = 0.8
    for (const line of COAST.coordinates) {
      ctx.beginPath()
      line.forEach(([x, y], k) => {
        if (k && Math.abs(x - line[k - 1][0]) > 180) ctx.moveTo(X(x), Y(y))
        else if (k) ctx.lineTo(X(x), Y(y))
        else ctx.moveTo(X(x), Y(y))
      })
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    ctx.lineWidth = 2
    for (const r of regions) {
      ctx.strokeStyle = r.slot === 'a' ? t.a : t.b
      ctx.setLineDash(r.slot === 'a' ? [] : [6, 4])
      for (const g of regionOutline(r.bounds)) {
        ctx.beginPath()
        g.coordinates.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))))
        ctx.stroke()
      }
    }
    ctx.setLineDash([])
  }, [grid, layer, frameYear, scale, regions, dark])

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-plot">
      <canvas
        ref={ref}
        width={1080}
        height={540}
        className="max-h-full max-w-full"
        role="img"
        aria-label="Static latitude–longitude map of the selected layer with region outlines"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const lon = ((e.clientX - r.left) / r.width) * 360 - 180
          const lat = 90 - ((e.clientY - r.top) / r.height) * 180
          onSelect?.(lon, lat)
          const idx = cellIndex(lon, lat)
          if (idx === null || !grid) return
          onInspect({
            lon: -179 + (idx % GRID.nlon) * GRID.cell,
            lat: -89 + Math.floor(idx / GRID.nlon) * GRID.cell,
            value: cellValue(grid, layer, frameYear, idx),
            pinned: true,
          })
        }}
      />
      <p className="ta-micro absolute bottom-2 left-2 max-w-[90%] rounded bg-panel/90 px-2 py-1">
        WebGL is unavailable{note ? ` (${note})` : ''}, so this is a static latitude–longitude map. The globe and pan/zoom are off;
        the chart, regions, timeline and evidence all still work.
      </p>
    </div>
  )
}

export function cellText(info: CellInfo, unit: string, digits: number): string {
  const lat = `${Math.abs(info.lat)}°${info.lat >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(info.lon)}°${info.lon >= 0 ? 'E' : 'W'}`
  return `${lat}, ${lon} · ${info.value === null ? 'no data' : `${signed(info.value, digits)} ${unit}`}`
}
