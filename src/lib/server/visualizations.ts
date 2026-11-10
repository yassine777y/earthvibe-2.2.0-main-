/**
 * Curated, verified NASA visualisations.
 *
 * Every entry with `image` is a documented NASA GIBS WMS GetMap request that was checked to return a
 * JPEG on the date this project was written. Entries without `image` are official NASA pages that are
 * only linked (not embedded). The backend only ever fetches the pre-configured URLs below.
 */
export type SourceType = "NASA Worldview/GIBS" | "NASA EIC" | "NASA SVS (Earth Information Center collection)" | "NASA Science";

export type Visualization = {
  id: string;
  topic: "temperature" | "seaice" | "ocean";
  title: string;
  sourceType: SourceType;
  sourcePageUrl: string;
  imageDate: string | null;
  layer: string | null;
  provider: string;
  attribution: string;
  hasImage: boolean;
  equirectangular: boolean;
  /** Plain-language note about how this visual relates to the numeric dataset. */
  relationToData: "context-not-same-product" | "none";
};

type Internal = Visualization & { gibsUrl?: string };

const GIBS_ATTRIBUTION =
  "Imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS).";

function gibsWms(opts: { epsg: "4326" | "3413" | "3031"; layers: string; date: string; w: number; h: number }): string {
  const bbox = opts.epsg === "4326" ? "-180,-90,180,90" : "-4194304,-4194304,4194304,4194304";
  const q = new URLSearchParams({
    SERVICE: "WMS",
    REQUEST: "GetMap",
    VERSION: "1.1.1",
    STYLES: "",
    SRS: `EPSG:${opts.epsg}`,
    BBOX: bbox,
    WIDTH: String(opts.w),
    HEIGHT: String(opts.h),
    FORMAT: "image/jpeg",
    LAYERS: opts.layers,
    TIME: opts.date,
  });
  return `https://gibs.earthdata.nasa.gov/wms/epsg${opts.epsg}/best/wms.cgi?${q.toString()}`;
}

function worldviewLink(layers: string, date: string): string {
  return `https://worldview.earthdata.nasa.gov/?l=${encodeURIComponent(layers)}&t=${date}`;
}

const CATALOG: Internal[] = [
  {
    id: "gibs-airs-surface-air-temperature",
    topic: "temperature",
    title: "AIRS monthly surface air temperature (day)",
    sourceType: "NASA Worldview/GIBS",
    sourcePageUrl: worldviewLink("AIRS_L3_Surface_Air_Temperature_Monthly_Day", "2024-07-01"),
    imageDate: "2024-07-01",
    layer: "AIRS_L3_Surface_Air_Temperature_Monthly_Day",
    provider: "NASA AIRS (Atmospheric Infrared Sounder), Aqua satellite",
    attribution: GIBS_ATTRIBUTION,
    hasImage: true,
    equirectangular: true,
    relationToData: "context-not-same-product",
    gibsUrl: gibsWms({ epsg: "4326", layers: "AIRS_L3_Surface_Air_Temperature_Monthly_Day", date: "2024-07-01", w: 1024, h: 512 }),
  },
  {
    id: "gibs-arctic-sea-ice-concentration",
    topic: "seaice",
    title: "Arctic sea-ice concentration (AMSR-U2 12 km)",
    sourceType: "NASA Worldview/GIBS",
    sourcePageUrl: worldviewLink("AMSRU2_Sea_Ice_Concentration_12km", "2024-09-15"),
    imageDate: "2024-09-15",
    layer: "BlueMarble_ShadedRelief_Bathymetry + AMSRU2_Sea_Ice_Concentration_12km",
    provider: "NASA NSIDC DAAC (AMSR-E/AMSR2 unified sea-ice concentration), shown over Blue Marble",
    attribution: GIBS_ATTRIBUTION,
    hasImage: true,
    equirectangular: false,
    relationToData: "context-not-same-product",
    gibsUrl: gibsWms({ epsg: "3413", layers: "BlueMarble_ShadedRelief_Bathymetry,AMSRU2_Sea_Ice_Concentration_12km", date: "2024-09-15", w: 768, h: 768 }),
  },
  {
    id: "gibs-antarctic-sea-ice-concentration",
    topic: "seaice",
    title: "Antarctic sea-ice concentration (AMSR-U2 12 km)",
    sourceType: "NASA Worldview/GIBS",
    sourcePageUrl: worldviewLink("AMSRU2_Sea_Ice_Concentration_12km", "2024-09-15"),
    imageDate: "2024-09-15",
    layer: "BlueMarble_ShadedRelief_Bathymetry + AMSRU2_Sea_Ice_Concentration_12km",
    provider: "NASA NSIDC DAAC (AMSR-E/AMSR2 unified sea-ice concentration), shown over Blue Marble",
    attribution: GIBS_ATTRIBUTION,
    hasImage: true,
    equirectangular: false,
    relationToData: "context-not-same-product",
    gibsUrl: gibsWms({ epsg: "3031", layers: "BlueMarble_ShadedRelief_Bathymetry,AMSRU2_Sea_Ice_Concentration_12km", date: "2024-09-15", w: 768, h: 768 }),
  },
  {
    id: "gibs-ghrsst-mur-sst",
    topic: "ocean",
    title: "GHRSST MUR sea-surface temperature",
    sourceType: "NASA Worldview/GIBS",
    sourcePageUrl: worldviewLink("GHRSST_L4_MUR_Sea_Surface_Temperature", "2024-09-15"),
    imageDate: "2024-09-15",
    layer: "GHRSST_L4_MUR_Sea_Surface_Temperature",
    provider: "NASA JPL / PO.DAAC (GHRSST Level 4 MUR global foundation SST)",
    attribution: GIBS_ATTRIBUTION,
    hasImage: true,
    equirectangular: true,
    relationToData: "none",
    gibsUrl: gibsWms({ epsg: "4326", layers: "GHRSST_L4_MUR_Sea_Surface_Temperature", date: "2024-09-15", w: 1024, h: 512 }),
  },
  {
    id: "gibs-modis-aqua-sst-monthly",
    topic: "ocean",
    title: "MODIS Aqua monthly sea-surface temperature (4 km, night)",
    sourceType: "NASA Worldview/GIBS",
    sourcePageUrl: worldviewLink("MODIS_Aqua_L3_SST_MidIR_4km_Night_Monthly", "2024-07-01"),
    imageDate: "2024-07-01",
    layer: "MODIS_Aqua_L3_SST_MidIR_4km_Night_Monthly",
    provider: "NASA OceanColor / MODIS Aqua",
    attribution: GIBS_ATTRIBUTION,
    hasImage: true,
    equirectangular: true,
    relationToData: "none",
    gibsUrl: gibsWms({ epsg: "4326", layers: "MODIS_Aqua_L3_SST_MidIR_4km_Night_Monthly", date: "2024-07-01", w: 1024, h: 512 }),
  },
  {
    id: "eic-sea-level-dashboard",
    topic: "ocean",
    title: "Earth Information Center — Sea Level Dashboard",
    sourceType: "NASA EIC",
    sourcePageUrl: "https://earth.gov/sealevel",
    imageDate: null,
    layer: null,
    provider: "NASA Earth Information Center (earth.gov)",
    attribution: "NASA Earth Information Center. Linked page only; no image is embedded.",
    hasImage: false,
    equirectangular: false,
    relationToData: "none",
  },
  {
    id: "svs-global-sea-ice",
    topic: "seaice",
    title: "Science on a Sphere: Global Sea Ice (SVS 5480)",
    sourceType: "NASA SVS (Earth Information Center collection)",
    sourcePageUrl: "https://svs.gsfc.nasa.gov/5480/",
    imageDate: "2025-02-09",
    layer: null,
    provider: "NASA Scientific Visualization Studio (tagged Earth Information Center)",
    attribution: "NASA Scientific Visualization Studio. Linked page only; the date is the SVS release date.",
    hasImage: false,
    equirectangular: false,
    relationToData: "none",
  },
  {
    id: "science-ocean-climate-change",
    topic: "ocean",
    title: "The Ocean and Climate Change (NASA Science)",
    sourceType: "NASA Science",
    sourcePageUrl: "https://science.nasa.gov/earth/explore/the-ocean-and-climate-change/",
    imageDate: null,
    layer: null,
    provider: "NASA Science",
    attribution: "NASA Science. Linked page only; no image is embedded.",
    hasImage: false,
    equirectangular: false,
    relationToData: "none",
  },
];

export function listVisualizations(): Visualization[] {
  return CATALOG.map(({ gibsUrl: _omit, ...rest }) => {
    void _omit;
    return rest;
  });
}

export function getVisualization(id: string): Visualization | undefined {
  return listVisualizations().find((v) => v.id === id);
}

/** Pre-configured upstream image URL for a catalogue entry (never user-supplied). */
export function getVisualizationImageUrl(id: string): string | null {
  return CATALOG.find((v) => v.id === id)?.gibsUrl ?? null;
}
