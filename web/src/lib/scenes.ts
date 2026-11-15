// Homepage presets. Each owns an immutable region id, source series, media, bounds, credit and accent.
// Credits come from a read of the linked NASA pages on 2026-11-15; `creditNote` records what could not be confirmed.

export interface Scene {
  id: 'arctic' | 'antarctic' | 's-subtropics'
  name: string
  band: string
  regionId: string // gistemp-zonal region
  compareWith: string | null
  photo: string
  place: string
  accent: string
  focus: string // object-position
  credit: { title: string; url: string; line: string; acquired: string; note: string | null }
}

export const SCENES: Scene[] = [
  {
    id: 'arctic', name: 'Arctic', band: '64°N–90°N', regionId: 'zonal:64N-90N', compareWith: 'zonal:90S-64S',
    photo: '/scenes/greenland.webp', place: 'Sverdrup Glacier, Greenland', accent: '#b4e8ff', focus: 'center 55%',
    credit: {
      title: 'Undercutting Sverdrup Glacier',
      url: 'https://science.nasa.gov/earth/earth-observatory/undercutting-sverdrup-glacier-147776/',
      line: 'NASA Earth Observatory image by Joshua Stevens, using Landsat data from the U.S. Geological Survey',
      acquired: 'September 2020 · Landsat 8 OLI',
      note: 'The local file is an unannotated crop; it has not been matched pixel-for-pixel to the image on the source page.',
    },
  },
  {
    id: 'antarctic', name: 'Antarctic', band: '64°S–90°S', regionId: 'zonal:90S-64S', compareWith: 'zonal:64N-90N',
    photo: '/scenes/antarctic.webp', place: 'Near Larsen C Ice Shelf', accent: '#d3e2ff', focus: 'center 60%',
    credit: {
      title: 'A Neat Slice of Ice in Antarctica',
      url: 'https://science.nasa.gov/earth/earth-observatory/a-neat-slice-of-ice-in-antarctica-92937/',
      line: 'Photograph by NASA/Jeremy Harbeck',
      acquired: '16 October 2018 · Operation IceBridge flight',
      note: null,
    },
  },
  {
    id: 's-subtropics', name: 'Southern subtropics', band: '24°S–44°S', regionId: 'zonal:44S-24S', compareWith: null,
    photo: '/scenes/namib.webp', place: 'Sossusvlei, Namib Desert', accent: '#ffd9ad', focus: 'center 50%',
    credit: {
      title: 'Tsauchab River and Sossus Vlei Lakebed, Namibia',
      url: 'https://science.nasa.gov/earth/earth-observatory/tsauchab-river-and-sossus-vlei-lakebed-namibia-42396/',
      line: 'Astronaut photograph ISS022-E-15154, NASA Johnson Space Center (ISS Crew Earth Observations)',
      acquired: '24 December 2009 · International Space Station',
      note: 'The source page carries no formal credit line; this wording paraphrases its provenance statement.',
    },
  },
]

export function atlasHref(s: Scene): string {
  const p = new URLSearchParams({ d: 'gistemp-zonal', a: s.regionId, b: s.compareWith ?? '', y0: '2001', y1: '2024', f: '2024' })
  return `/atlas?${p.toString()}`
}
