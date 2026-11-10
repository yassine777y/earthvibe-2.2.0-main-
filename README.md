# Earth Jukebox

Hear real NASA Earth data. Earth Jukebox pairs official NASA visualizations with sound generated live in your browser from real Earth data (global temperature, sea ice) or — where no public numeric series is practical (oceans) — from clearly labelled **image-derived** features of verified NASA imagery. It is available in **English, Arabic (RTL) and French**, has dark/light themes, and is built to be keyboard- and screen-reader-friendly.

> **Independent student project for the NASA Space Apps Challenge 2026. It is not an official NASA product and is not endorsed by NASA, NSIDC or any data provider.** Sounds are artistic mappings of data, not measurements.

## Architecture (and one deliberate deviation from the brief)

The brief suggested React + Vite and a Python FastAPI service. The repository this was built in is a **Next.js 16 (App Router) + TypeScript + PostgreSQL/Drizzle** project whose runtime and validation pipeline only run Next.js, so the same architecture was implemented inside it rather than adding a second runtime that could not be verified here:

| Concern | Brief | What was built |
|---|---|---|
| Frontend | React + Vite + TS | React 19 + TS in Next.js (client components for all interactive UI) |
| Backend | FastAPI | Next.js Route Handlers under `src/app/api/*` (same endpoints, validated inputs, typed JSON errors) |
| Image analysis | Python | [`sharp`](https://sharp.pixelplumbing.com/) in Node, in memory only |
| Cache | local cache | PostgreSQL table `source_cache` via Drizzle (falls back to process memory if the DB is down) |
| Audio | Web Audio API | Web Audio API in the browser (`src/lib/audio/*`) |
| Tests | pytest + frontend | Vitest (parsers, API, cache, image upload, mapping, i18n, chart a11y) |
| Deploy | Docker + Compose | `Dockerfile`, `docker-compose.yml` (web + Postgres) |

```
src/
  app/api/…            REST API (health, datasets, series, visualizations, image proxy, image analyze)
  lib/server/          parsers, provenance cache, dataset + visualization catalogue, image analysis
  lib/audio/           pure data→sound mapping + Web Audio engine
  lib/i18n/messages.ts EN / AR / FR dictionaries (type-checked for completeness)
  components/          Hero, topic picker, Explorer (chart/player/compare/table), Image lab, gallery…
db/init.sql            cache table for Docker
tests/                 Vitest suites (synthetic fixtures are used in tests only)
```

## Verified data sources and attribution

All endpoints below were requested successfully from the build sandbox while developing (November 2026).

| Topic | Source | Producer | Access | Notes |
|---|---|---|---|---|
| Global temperature | [GISTEMP v4 Land-Ocean Global Means CSV](https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv) (page: <https://data.giss.nasa.gov/gistemp/>) | NASA GISS | public HTTPS, no login | monthly anomaly in °C vs **1951–1980**; `***` (missing) values are skipped |
| Sea ice | [NSIDC Sea Ice Index v4 (G02135)](https://nsidc.org/data/g02135), monthly extent files `…/NOAA/G02135/{north\|south}/monthly/data/{N\|S}_MM_extent_v4.0.csv` | **NSIDC** (not NASA-produced; passive-microwave data archived through the NASA NSIDC DAAC ecosystem) | public HTTPS, no login | extent in million km²; 12 monthly files are merged; `-9999` months (e.g. Dec 1987) are left out |
| Oceans | NASA GIBS WMS imagery: `GHRSST_L4_MUR_Sea_Surface_Temperature` (JPL/PO.DAAC), `MODIS_Aqua_L3_SST_MidIR_4km_Night_Monthly` | NASA PO.DAAC / OceanColor via GIBS | public WMS, no login | **image-derived only**: no public numeric ocean series without an Earthdata login was implemented |
| Visual context | NASA GIBS: `AIRS_L3_Surface_Air_Temperature_Monthly_Day`, `AMSRU2_Sea_Ice_Concentration_12km` over `BlueMarble_ShadedRelief_Bathymetry` | NASA AIRS / NSIDC DAAC via GIBS | public WMS | labelled **NASA Worldview/GIBS**, not NASA EIC; described as visual context, not necessarily the same product as the numeric series |
| Linked official pages | [earth.gov/sealevel](https://earth.gov/sealevel) (NASA EIC), [SVS 5480 “Science on a Sphere: Global Sea Ice”](https://svs.gsfc.nasa.gov/5480/) (EIC collection), [NASA Science: The Ocean and Climate Change](https://science.nasa.gov/earth/explore/the-ocean-and-climate-change/) | NASA | links only | not embedded, not scraped |

Citations (also in the app footer):

- GISTEMP Team: *GISS Surface Temperature Analysis (GISTEMP), version 4*. NASA Goddard Institute for Space Studies. <https://data.giss.nasa.gov/gistemp/>. Lenssen, N., et al. (2019), J. Geophys. Res. Atmos., 124, 6307–6326, doi:10.1029/2018JD029522.
- Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K., & Stafford, T. *Sea Ice Index (G02135)*. NSIDC, Boulder, Colorado USA. <https://doi.org/10.7265/a98x-0f50> (check <https://nsidc.org/data/g02135> for the current recommended citation).
- We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS).

### Data integrity rules implemented

- No synthetic data in the app. Fixtures with fake values exist **only** in `tests/`.
- Responses are cached in PostgreSQL with retrieval time + upstream URL; the API reports `cache.status` = `live` (just fetched), `cached` or `stale` (upstream failed, last valid copy served, with a warning).
- Upstream failure with no cache → HTTP 503 `source_unavailable`; the UI shows an error, a **Try again** button and a link to the official source.
- Nothing is called "live": every response has `isLive: false` and the UI says "historical record · not a live feed".
- The backend only fetches hosts on an allow-list (`data.giss.nasa.gov`, `noaadata.apps.nsidc.org`, `gibs.earthdata.nasa.gov`) over HTTPS with timeouts, no redirects and size limits. There is **no URL proxy**; images are fetched only from URLs hard-coded in `src/lib/server/visualizations.ts`.

## Sound mappings

Sound is generated in the browser only after the user presses Play (no autoplay) with a gentle sine/triangle timbre, a compressor and a hard master-gain ceiling. Values are placed on a **stable scale taken from the whole source record** (shown next to the controls) so different date ranges are comparable. Notes come from a 3-octave major-pentatonic scale (A2 upward).

| Mode | Value → sound | Rate of change → sound |
|---|---|---|
| Temperature anomaly | pitch (warmer = higher); a quiet drone sits at the pitch of 0 °C (1951–1980 baseline) | number of pulses per note (1–4); rising trends step up the scale, falling trends step down. Loudness is never used for data |
| Sea-ice extent | number of harmonic layers (1–4) and filter brightness (more ice = fuller, brighter) | number of pulses per chord |
| Image (upload or NASA image) | left→right scan in 28 bands: brightness → pitch; red-vs-blue warmth → timbre brightness; hue → a second harmony note (weighted by saturation); contrast → pulses | – |

Long series are block-averaged into at most 160 notes (6 notes/s at 1×). The mapping lives in `src/lib/audio/mapping.ts` (pure, tested) and the sound design in `src/lib/audio/engine.ts`. Musical choices are not scientific measurements. Optional stereo sweep exists only for equirectangular NASA images (where horizontal position = longitude); it is off by default and everything works in mono.

## API

| Endpoint | Description |
|---|---|
| `GET /api/health` | health check (DB round-trip) |
| `GET /api/datasets` | topics with description, units, availability (`numeric` / `image-derived`), regions, source metadata, limitations |
| `GET /api/datasets/{temperature\|seaice\|ocean}/series?start=YYYY-MM-DD&end=YYYY-MM-DD` | normalized records + provenance. `seaice` also accepts `region=north\|south` and `month=1-12`. `region` on temperature → 400 (not supported). `ocean` → 422 (image-derived). `refresh=1` bypasses a fresh cache |
| `GET /api/visualizations` | curated, verified NASA visualization entries (title, source type, original page URL, date, layer, attribution) |
| `GET /api/visualizations/{id}/image` | cached copy of a catalogue GIBS image (ids only; never URLs) |
| `POST /api/images/analyze` | multipart `file` (PNG/JPEG/WebP ≤ 8 MB, ≤ 8000×8000 px, ≤ 40 MP, content-sniffed) **or** `visualizationId`; returns 28 bands of visual features. Processed in memory, never stored |

Series response (abridged):

```json
{
  "datasetId": "temperature", "title": "Global surface temperature anomaly",
  "units": "°C", "temporalResolution": "monthly", "referencePeriod": "1951–1980 mean",
  "availableRange": {"start": "1880-01-01", "end": "…"},
  "records": [{"date": "2020-01-01", "value": 1.18}],
  "stats": {"count": 6, "min": 0.91, "max": 1.23, "mean": 1.1, "first": {}, "last": {}},
  "scale": {"min": -0.81, "max": 1.48, "zero": 0, "basis": "…"},
  "source": {"name": "…", "producer": "…", "citation": "…", "url": "…", "dataUrl": "…", "notNasaProduced": false},
  "retrievedAt": "2026-11-05T22:31:43.891Z",
  "cache": {"status": "live|cached|stale", "ageSeconds": 0},
  "isLive": false, "warnings": [], "limitations": ["…"]
}
```

Errors always look like `{"error": {"code": "…", "message": "…", "details": {…}|null}}`. CORS is same-origin by default; set `CORS_ALLOWED_ORIGINS` (comma-separated) to allow additional origins.

## Run locally

Requirements: Node 20+ and PostgreSQL (the app still runs without it using an in-memory cache).

```bash
cp .env.example .env            # edit DATABASE_URL if needed
npm install
npx drizzle-kit push            # creates the source_cache table
npm run dev                     # http://localhost:3000   (API on the same origin)
```

Production build: `npm run build && npm start`.

## Tests and checks

```bash
npx vitest run                  # parsers, API, cache, image upload, mapping, i18n, chart a11y
npx tsc --noEmit
npm run build
curl localhost:3000/api/health  # smoke test (after npm start)
```

## Docker and deployment

```bash
docker compose up --build       # web on http://localhost:3000, Postgres with the cache table created from db/init.sql
```

Deployment guide:

1. Build the image (`docker build -t earth-jukebox .`) — build step is `npm run build`.
2. Provide **`DATABASE_URL`** (PostgreSQL ≥ 13; run `db/init.sql` once or `npx drizzle-kit push`). Without a database the API still works with a per-process memory cache.
3. Optionally set **`CORS_ALLOWED_ORIGINS`** if a separate front-end origin will call the API. Leave empty for same-origin.
4. The container needs **outbound HTTPS** to `data.giss.nasa.gov`, `noaadata.apps.nsidc.org` and `gibs.earthdata.nasa.gov`.
5. Put it behind HTTPS (reverse proxy) — the Web Audio API itself works on any origin, but uploads and tokens should be protected in transit. Health check: `GET /api/health`.

No API keys or paid services are required.

## Accessibility

- Semantic landmarks, skip link, logical focus order, visible 3 px focus ring (palette `#7FB3B8` in dark / `#0F3D3E` in light), all controls ≥ 44 px.
- Every chart has a text summary (`aria-label` + visible paragraph) **and** an equivalent data table; image sonification has a feature table.
- Playback state changes are announced via an `aria-live` region; the timeline slider exposes `aria-valuetext` (date/band).
- Colour is never the only signal: hatched area below the baseline, ✓ marks on selected controls, badges with icons/text, dashed vs solid borders.
- English / Arabic (`lang="ar"`, `dir="rtl"`) / French with localized dates and numbers via `Intl`; all UI strings, errors, chart summaries and audio descriptions are translated (a test enforces key and placeholder parity).
- Dark default, Light toggle, `prefers-color-scheme` respected when nothing is saved; `prefers-reduced-motion` disables animation; no flashing; no autoplay; volume, mute and speed controls.
- Contrast: the primary action `#C6601F` uses dark text `#0A0F14` (≈ 4.6:1). *Note:* the brief mentions `#0E0B1D` for dark text, which is not in the palette, so the palette's `#0A0F14` is used instead. Where the palette orange would be too low-contrast as small text (on dark panels / light backgrounds) slightly adjusted tints of the same hue are used.

## Known limitations

- **Oceans are image-derived only.** A numeric, login-free NASA ocean series was not implemented; the sound reflects the picture's colours, not measurements.
- **Sea-ice and temperature visuals are context**, from different products than the numeric series (labelled as such). Gallery images are pinned to fixed dates (2024) rather than following the playhead.
- EIC items are **linked pages only** — no stable EIC image endpoint was verified, so none is embedded. They are labelled NASA EIC / SVS (EIC collection) accordingly.
- GISTEMP is global-mean only; there is no regional or ocean/land split.
- The stack differs from the brief (Next.js route handlers instead of FastAPI/Vite; see above).
- Automated tests do not drive a real browser or real audio output: the Web Audio engine and screen-reader behaviour should be checked manually (below). Contrast ratios were calculated, not machine-audited with a tool.
- No rate limiting on `/api/images/analyze` beyond size/dimension limits; add one at the reverse proxy for public deployments.

## Manual QA checklist

- [ ] Load the page: nothing plays by itself; hero stripes appear (or a clear error).
- [ ] Temperature: press Play → sound starts, cursor and "Now playing" value move; Pause, Stop, Seek slider, Speed, Volume, Mute all work; clicking the chart seeks.
- [ ] Change the date range / presets: playback stops, chart, table and summary update; invalid range shows an error.
- [ ] Sea ice: switch Arctic/Antarctic and a calendar month; data, image and NSIDC attribution update; compare periods and "Arctic vs Antarctic" work.
- [ ] Temperature: the region control is disabled with an explanation.
- [ ] Oceans: explanation of why there is no numeric series; NASA SST image loads and plays as "Visual-image sonification".
- [ ] Gallery: each card shows title, source type, date, provider, attribution and a working source link; "Sonify this image" scrolls to the lab and analyses it.
- [ ] Image lab: upload PNG/JPEG/WebP → preview, scan line, band chart and table; upload a `.txt` renamed to `.png` → clear error.
- [ ] Switch EN → AR → FR: `lang`/`dir` change, layout mirrors in Arabic, no untranslated UI text.
- [ ] Toggle light/dark; reload keeps the choice; check focus ring is visible in both.
- [ ] Keyboard only: Tab through header, topics, controls, table (scrollable regions are focusable); screen reader announces play/pause/stop.
- [ ] Stop the network (or block the NASA hosts): cached data shows a "stale/cached" badge; with an empty cache an error + retry + source link appears and no data is invented.
- [ ] 200% zoom and a 360 px-wide viewport: no clipped content (chart scrolls horizontally).
