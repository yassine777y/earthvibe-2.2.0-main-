import {
  getCached,
  fetchTextAllowed,
  SourceUnavailableError,
  type Cached,
  type CacheStore,
  type FetchLike,
} from "./cache";
import { parseGistempCsv, parseNsidcMonthlyCsv, type DataRecord } from "./parsers";

export const GISTEMP_URL = "https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv";
export const NSIDC_BASE = "https://noaadata.apps.nsidc.org/NOAA/G02135";
const TTL_MS = 12 * 60 * 60 * 1000;

export type DatasetId = "temperature" | "seaice" | "ocean";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type SourceInfo = {
  name: string;
  producer: string;
  citation: string;
  url: string;
  dataUrl: string | null;
  notNasaProduced: boolean;
};

const GISTEMP_SOURCE: SourceInfo = {
  name: "GISS Surface Temperature Analysis (GISTEMP) v4 — Land-Ocean Global Means",
  producer: "NASA Goddard Institute for Space Studies (GISS)",
  citation:
    "GISTEMP Team: GISS Surface Temperature Analysis (GISTEMP), version 4. NASA Goddard Institute for Space Studies. https://data.giss.nasa.gov/gistemp/ — and Lenssen, N., et al. (2019), Improvements in the GISTEMP uncertainty model, J. Geophys. Res. Atmos., 124, 6307–6326, doi:10.1029/2018JD029522.",
  url: "https://data.giss.nasa.gov/gistemp/",
  dataUrl: GISTEMP_URL,
  notNasaProduced: false,
};

const NSIDC_SOURCE: SourceInfo = {
  name: "Sea Ice Index, Version 4 (G02135) — monthly sea-ice extent",
  producer:
    "National Snow and Ice Data Center (NSIDC), University of Colorado Boulder. Distributed through the NASA NSIDC DAAC ecosystem; this is an NSIDC product, not a NASA-produced one.",
  citation:
    "Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K., & Stafford, T. Sea Ice Index (G02135). National Snow and Ice Data Center, Boulder, Colorado USA. https://doi.org/10.7265/a98x-0f50 (see https://nsidc.org/data/g02135 for the current recommended citation).",
  url: "https://nsidc.org/data/g02135",
  dataUrl: `${NSIDC_BASE}/north/monthly/data/`,
  notNasaProduced: true,
};

const OCEAN_SOURCE: SourceInfo = {
  name: "NASA Worldview / GIBS ocean sea-surface-temperature imagery",
  producer: "NASA PO.DAAC (GHRSST MUR L4 SST, JPL) and NASA OceanColor / MODIS Aqua, served by NASA GIBS (EOSDIS)",
  citation:
    "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS).",
  url: "https://worldview.earthdata.nasa.gov/",
  dataUrl: null,
  notNasaProduced: false,
};

export type DatasetMeta = {
  id: DatasetId;
  topic: DatasetId;
  title: string;
  description: string;
  availability: "numeric" | "image-derived";
  variable: string | null;
  units: string | null;
  temporalResolution: string;
  referencePeriod: string | null;
  regions: { id: string; label: string }[] | null;
  supportsMonthFilter: boolean;
  source: SourceInfo;
  limitations: string[];
};

export const DATASETS: DatasetMeta[] = [
  {
    id: "temperature",
    topic: "temperature",
    title: "Global surface temperature anomaly",
    description:
      "Monthly global-mean land-ocean surface temperature anomaly from NASA GISS GISTEMP v4, 1880 to the latest published month.",
    availability: "numeric",
    variable: "Surface temperature anomaly",
    units: "°C",
    temporalResolution: "monthly",
    referencePeriod: "1951–1980 mean",
    regions: null,
    supportsMonthFilter: false,
    source: GISTEMP_SOURCE,
    limitations: [
      "Global mean only; the file does not provide regional breakdowns.",
      "Values are anomalies relative to the 1951–1980 average, not absolute temperatures.",
      "GISTEMP is periodically re-processed; recent months can be revised. This is not a live feed.",
    ],
  },
  {
    id: "seaice",
    topic: "seaice",
    title: "Sea-ice extent",
    description:
      "Monthly sea-ice extent (area with at least 15% ice concentration) for the Arctic and Antarctic from NSIDC's Sea Ice Index, 1979 onward.",
    availability: "numeric",
    variable: "Sea-ice extent",
    units: "million km²",
    temporalResolution: "monthly",
    referencePeriod: null,
    regions: [
      { id: "north", label: "Arctic (Northern Hemisphere)" },
      { id: "south", label: "Antarctic (Southern Hemisphere)" },
    ],
    supportsMonthFilter: true,
    source: NSIDC_SOURCE,
    limitations: [
      "Passive-microwave satellite record starting November 1978; monthly values start in 1979.",
      "A small number of months are missing in the source (for example December 1987 – January 1988) and are left out, never filled in.",
      "Extent is the area of ocean with at least 15% ice; it is not ice volume or thickness.",
    ],
  },
  {
    id: "ocean",
    topic: "ocean",
    title: "Ocean sea-surface temperature (imagery)",
    description:
      "No numeric ocean time series could be accessed publicly without credentials, so this topic uses verified NASA GIBS sea-surface-temperature imagery for image-derived sonification.",
    availability: "image-derived",
    variable: null,
    units: null,
    temporalResolution: "single-date image",
    referencePeriod: null,
    regions: null,
    supportsMonthFilter: false,
    source: OCEAN_SOURCE,
    limitations: [
      "Image colours are a visual colour-map of data, not direct measurements; the sound reflects the picture's pattern.",
      "Numeric ocean series from PO.DAAC generally require a free NASA Earthdata login, which this demo avoids.",
    ],
  },
];

export function getDatasetMeta(id: string): DatasetMeta | undefined {
  return DATASETS.find((d) => d.id === id);
}

export type SeriesQuery = {
  start: string | null;
  end: string | null;
  region: "north" | "south" | null;
  month: number | null;
};

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseSeriesQuery(id: DatasetId, params: URLSearchParams): SeriesQuery {
  const meta = getDatasetMeta(id)!;
  const start = params.get("start");
  const end = params.get("end");
  for (const [name, v] of [["start", start], ["end", end]] as const) {
    if (v !== null && !validDate(v)) {
      throw new ApiError(400, "invalid_date", `Query parameter '${name}' must be a valid date in YYYY-MM-DD format.`, { parameter: name });
    }
  }
  if (start && end && start > end) {
    throw new ApiError(400, "invalid_range", "'start' must not be after 'end'.");
  }
  let region: SeriesQuery["region"] = null;
  const regionParam = params.get("region");
  if (regionParam !== null) {
    if (!meta.regions) {
      throw new ApiError(400, "region_not_supported", `Dataset '${id}' does not support a region parameter; its source only provides one global series.`);
    }
    if (regionParam !== "north" && regionParam !== "south") {
      throw new ApiError(400, "invalid_region", "Region must be 'north' or 'south'.", { allowed: ["north", "south"] });
    }
    region = regionParam;
  } else if (meta.regions) {
    region = "north";
  }
  let month: number | null = null;
  const monthParam = params.get("month");
  if (monthParam !== null) {
    if (!meta.supportsMonthFilter) {
      throw new ApiError(400, "month_not_supported", `Dataset '${id}' does not support a month filter.`);
    }
    const m = Number(monthParam);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      throw new ApiError(400, "invalid_month", "Month must be an integer from 1 to 12.");
    }
    month = m;
  }
  return { start, end, region, month };
}

type Deps = { store?: CacheStore; fetchImpl?: FetchLike; force?: boolean; now?: () => Date };

export async function loadTemperature(deps: Deps = {}): Promise<Cached<DataRecord[]>> {
  return getCached<DataRecord[]>({
    key: "gistemp-v4-glb-monthly",
    ttlMs: TTL_MS,
    upstreamUrl: GISTEMP_URL,
    store: deps.store,
    force: deps.force,
    now: deps.now,
    produce: async () => parseGistempCsv(await fetchTextAllowed(GISTEMP_URL, { fetchImpl: deps.fetchImpl })),
  });
}

export async function loadSeaIce(region: "north" | "south", deps: Deps = {}): Promise<Cached<DataRecord[]>> {
  const letter = region === "north" ? "N" : "S";
  return getCached<DataRecord[]>({
    key: `nsidc-g02135-v4-${region}-monthly-extent`,
    ttlMs: TTL_MS,
    upstreamUrl: `${NSIDC_BASE}/${region}/monthly/data/`,
    store: deps.store,
    force: deps.force,
    now: deps.now,
    produce: async () => {
      const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
      const parts = await Promise.all(
        months.map(async (mm) => {
          const url = `${NSIDC_BASE}/${region}/monthly/data/${letter}_${mm}_extent_v4.0.csv`;
          return parseNsidcMonthlyCsv(await fetchTextAllowed(url, { fetchImpl: deps.fetchImpl }));
        }),
      );
      return parts.flat().sort((a, b) => a.date.localeCompare(b.date));
    },
  });
}

export type SeriesResponse = {
  datasetId: DatasetId;
  title: string;
  variable: string | null;
  units: string | null;
  temporalResolution: string;
  referencePeriod: string | null;
  region: { id: string; label: string } | null;
  month: number | null;
  query: { start: string | null; end: string | null };
  availableRange: { start: string; end: string };
  records: DataRecord[];
  stats: { count: number; min: number; max: number; mean: number; first: DataRecord; last: DataRecord } | null;
  /** Stable value range of the *whole* record, used so audio pitch is comparable between date ranges. */
  scale: { min: number; max: number; zero: number | null; basis: string };
  source: SourceInfo;
  retrievedAt: string;
  cache: { status: "live" | "cached" | "stale"; ageSeconds: number };
  isLive: false;
  warnings: string[];
  limitations: string[];
};

export async function buildSeries(id: DatasetId, q: SeriesQuery, deps: Deps = {}): Promise<SeriesResponse> {
  const meta = getDatasetMeta(id)!;
  if (meta.availability !== "numeric") {
    throw new ApiError(
      422,
      "numeric_series_unavailable",
      "No public numeric series is implemented for this topic; use the image-derived sonification of the verified NASA GIBS imagery instead.",
      { sourceUrl: meta.source.url },
    );
  }
  const loaded = id === "temperature" ? await loadTemperature(deps) : await loadSeaIce(q.region ?? "north", deps);
  let all = loaded.data;
  if (q.month) all = all.filter((r) => Number(r.date.slice(5, 7)) === q.month);
  if (all.length === 0) {
    throw new SourceUnavailableError("The source contained no values for this selection.", meta.source.url);
  }
  const records = all.filter((r) => (!q.start || r.date >= q.start) && (!q.end || r.date <= q.end));
  const values = all.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const warnings = [...loaded.warnings];
  if (records.length === 0) warnings.push("no_records_in_selected_range");

  let stats: SeriesResponse["stats"] = null;
  if (records.length) {
    const vs = records.map((r) => r.value);
    stats = {
      count: records.length,
      min: Math.min(...vs),
      max: Math.max(...vs),
      mean: vs.reduce((a, b) => a + b, 0) / vs.length,
      first: records[0],
      last: records[records.length - 1],
    };
  }
  const regionMeta = q.region ? meta.regions?.find((r) => r.id === q.region) ?? null : null;
  return {
    datasetId: id,
    title: regionMeta ? `${meta.title} — ${regionMeta.label}` : meta.title,
    variable: meta.variable,
    units: meta.units,
    temporalResolution: q.month ? "monthly values for a single calendar month (one value per year)" : meta.temporalResolution,
    referencePeriod: meta.referencePeriod,
    region: regionMeta,
    month: q.month,
    query: { start: q.start, end: q.end },
    availableRange: { start: all[0].date, end: all[all.length - 1].date },
    records,
    stats,
    scale: {
      min,
      max,
      zero: id === "temperature" ? 0 : null,
      basis: "full source record for this selection (all dates), independent of the chosen date range",
    },
    source: {
      ...meta.source,
      dataUrl: id === "seaice" ? `${NSIDC_BASE}/${q.region}/monthly/data/` : meta.source.dataUrl,
    },
    retrievedAt: loaded.retrievedAt,
    cache: { status: loaded.status, ageSeconds: loaded.ageSeconds },
    isLive: false,
    warnings,
    limitations: meta.limitations,
  };
}
