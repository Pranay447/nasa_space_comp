import type { Feature, FeatureCollection, LineString, MultiPolygon, Polygon } from 'geojson'
import { GRID } from './api'
import type { Bounds } from './types'

const STEP = 2 // degrees between intermediate vertices so edges follow parallels on the globe

function span(from: number, to: number): number[] {
  const out: number[] = []
  const n = Math.max(1, Math.ceil(Math.abs(to - from) / STEP))
  for (let i = 0; i <= n; i++) out.push(from + ((to - from) * i) / n)
  return out
}

/** Counter-clockwise exterior ring (RFC 7946) for a lon/lat box that does not cross the antimeridian. */
function ring(w: number, s: number, e: number, n: number): number[][] {
  // Web maps cannot represent the pole itself; stop just short so the ring stays valid.
  const S = Math.max(s, -89.999)
  const N = Math.min(n, 89.999)
  return [
    ...span(w, e).map((x) => [x, S]),
    ...span(S, N).slice(1).map((y) => [e, y]),
    ...span(e, w).slice(1).map((x) => [x, N]),
    ...span(N, S).slice(1).map((y) => [w, y]),
  ]
}

export const crossesAntimeridian = (b: Bounds) => b.west > b.east
export const isFullBand = (b: Bounds) => b.west === -180 && b.east === 180

/** Region fill, split at the antimeridian when west > east. */
export function regionPolygon(b: Bounds): Polygon | MultiPolygon {
  if (!crossesAntimeridian(b)) return { type: 'Polygon', coordinates: [ring(b.west, b.south, b.east, b.north)] }
  return {
    type: 'MultiPolygon',
    coordinates: [[ring(b.west, b.south, 180, b.north)], [ring(-180, b.south, b.east, b.north)]],
  }
}

/** Outline as separate lines so no seam is drawn along ±180° for full bands or split boxes. */
export function regionOutline(b: Bounds): LineString[] {
  const lines: number[][][] = []
  const lats = [b.south, b.north].filter((y) => Math.abs(y) < 90).map((y) => y)
  const lonSpans: [number, number][] = crossesAntimeridian(b)
    ? [[b.west, 180], [-180, b.east]]
    : [[b.west, b.east]]
  for (const y of lats) for (const [w, e] of lonSpans) lines.push(span(w, e).map((x) => [x, y]))
  if (!isFullBand(b)) {
    const S = Math.max(b.south, -89.999)
    const N = Math.min(b.north, 89.999)
    for (const x of [b.west, b.east]) lines.push(span(S, N).map((y) => [x, y]))
  }
  return lines.map((coordinates) => ({ type: 'LineString', coordinates }))
}

/** A point inside the region to aim the camera at; latitude limited so Mercator can show it. */
export function regionCenter(b: Bounds): [number, number] {
  let lon = crossesAntimeridian(b) ? (b.west + b.east + 360) / 2 : (b.west + b.east) / 2
  if (lon > 180) lon -= 360
  const lat = Math.max(-78, Math.min(78, (b.south + b.north) / 2))
  return [isFullBand(b) ? 0 : lon, lat]
}

/** 2° grid cells as polygons. Feature id = lat index * 180 + lon index. Values are attached later. */
export function gridCells(): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = []
  for (let j = 0; j < GRID.nlat; j++) {
    const s = Math.max(-90 + j * GRID.cell, -89.999)
    const n = Math.min(-90 + (j + 1) * GRID.cell, 89.999)
    for (let i = 0; i < GRID.nlon; i++) {
      const w = -180 + i * GRID.cell
      const e = w + GRID.cell
      features.push({
        type: 'Feature',
        id: j * GRID.nlon + i,
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

export function cellIndex(lon: number, lat: number): number | null {
  if (lat < -90 || lat > 90) return null
  const x = ((((lon + 180) % 360) + 360) % 360) / GRID.cell
  const i = Math.min(GRID.nlon - 1, Math.floor(x))
  const j = Math.min(GRID.nlat - 1, Math.floor((lat + 90) / GRID.cell))
  return j * GRID.nlon + i
}

export function graticule(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = []
  for (let lon = -180; lon <= 180; lon += 30)
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: span(-85, 85).map((y) => [lon, y]) } })
  for (let lat = -60; lat <= 60; lat += 30)
    features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: span(-180, 180).map((x) => [x, lat]) } })
  return { type: 'FeatureCollection', features }
}

const ns = (v: number) => `${Math.abs(v)}°${v >= 0 ? 'N' : 'S'}`
const ew = (v: number) => `${Math.abs(v)}°${v >= 0 ? 'E' : 'W'}`
export function boundsText(b: Bounds): string {
  const lat = `${ns(b.south)}–${ns(b.north)}`
  return isFullBand(b) ? `${lat}, all longitudes` : `${lat}, ${ew(b.west)}–${ew(b.east)}`
}
