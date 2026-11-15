# Third-party notices

## NASA data

- GISTEMP Team, 2026: GISS Surface Temperature Analysis (GISTEMP), version 4. NASA Goddard Institute for Space Studies. https://data.giss.nasa.gov/gistemp/
  - Zonal annual means `ZonAnn.Ts+dSST.txt` (snapshot SHA-256 `e489c207215be7210d2f42141681dfd5640f049b704e7ad288b3dcc71114525b`)
  - Gridded `gistemp1200_GHCNv4_ERSSTv5.nc.gz` (SHA-256 `f7788db9044d0f0e3f9561ad5d0fd82e59cdfdb82ea8a10244f78f2cb032a3c7`)
- GPM IMERG Final Monthly V07, doi:10.5067/GPM/IMERG/3B-MONTH/07, via NASA Giovanni. Wired into the app but not yet acquired (Earthdata Login required). See README.

## Homepage images

Credits come from a read of the linked NASA pages on 2026-11-15 (`web/src/lib/scenes.ts`).

1. **Undercutting Sverdrup Glacier** (Sverdrup Glacier, Greenland). NASA Earth Observatory image by Joshua Stevens, using Landsat data from the U.S. Geological Survey. Acquired September 2020, Landsat 8 OLI.
   https://science.nasa.gov/earth/earth-observatory/undercutting-sverdrup-glacier-147776/
   Note: The local file is an unannotated crop; it has not been matched pixel-for-pixel to the image on the source page.
2. **A Neat Slice of Ice in Antarctica** (near Larsen C Ice Shelf). Photograph by NASA/Jeremy Harbeck. Acquired 16 October 2018, Operation IceBridge flight.
   https://science.nasa.gov/earth/earth-observatory/a-neat-slice-of-ice-in-antarctica-92937/
3. **Tsauchab River and Sossus Vlei Lakebed, Namibia** (Sossusvlei, Namib Desert). Astronaut photograph ISS022-E-15154, NASA Johnson Space Center (ISS Crew Earth Observations). Acquired 24 December 2009, International Space Station.
   https://science.nasa.gov/earth/earth-observatory/tsauchab-river-and-sossus-vlei-lakebed-namibia-42396/
   Note: The source page carries no formal credit line; this wording paraphrases its provenance statement.

## Map data

Natural Earth (public domain), via the `world-atlas` package (ISC).

## Fonts

| Font | Package | Licence |
|---|---|---|
| Instrument Sans | `@fontsource-variable/instrument-sans` | SIL Open Font License 1.1 (Copyright 2022 The Instrument Sans Project Authors) |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` | SIL Open Font License 1.1 (Copyright 2017 IBM Corp.) |
| Geist | `@fontsource-variable/geist` | OFL-1.1 (from package.json) |

## JavaScript runtime dependencies (web/package.json)

The licence is the `license` field of each installed package.

| Package | Licence |
|---|---|
| @base-ui/react | MIT |
| @radix-ui/react-label | MIT |
| @tabler/icons-react | MIT |
| class-variance-authority | Apache-2.0 |
| clsx | MIT |
| cn | MIT |
| d3-contour | ISC |
| echarts | Apache-2.0 |
| echarts-gl | MIT |
| lucide-react | ISC |
| maplibre-gl | BSD-3-Clause |
| motion | MIT |
| react | MIT |
| react-dom | MIT |
| react-router-dom | MIT |
| shadcn | MIT |
| tailwind-merge | MIT |
| topojson-client | ISC |
| tw-animate-css | MIT |
| world-atlas | ISC |
| zustand | MIT |

## Python packages

The licence is taken from each installed package's `.dist-info/METADATA`.

| Package | Version | Licence |
|---|---|---|
| numpy | 2.4.6 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| scipy | 1.17.1 | see package (BSD-style copyright text in METADATA) |
| pandas | 3.1.1 | BSD-3-Clause |
| xarray | 2026.9.0 | Apache-2.0 |
| netCDF4 | 1.7.5.1.post1 | MIT |
| statsmodels | 0.15.0 | BSD-3-Clause |
| fastapi | 0.163.0 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |
| pytest (test only) | 9.2.0 | MIT |
| httpx (test only) | 0.28.1 | BSD-3-Clause |
