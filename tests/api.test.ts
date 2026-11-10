import { describe, expect, it, vi } from "vitest";
import { createMemoryStore, fetchAllowed, getCached, SourceUnavailableError } from "@/lib/server/cache";
import { ApiError, buildSeries, parseSeriesQuery } from "@/lib/server/datasets";
import { listVisualizations, getVisualizationImageUrl } from "@/lib/server/visualizations";
import { GET as seriesGET } from "@/app/api/datasets/[id]/series/route";
import { GET as vizGET } from "@/app/api/visualizations/route";
import { GET as imageGET } from "@/app/api/visualizations/[id]/image/route";
import { gistempFixture, nsidcFixture, textResponse } from "./fixtures";

const okFetch = (async (url: RequestInfo | URL) => {
  const u = String(url);
  if (u.includes("GLB.Ts")) return textResponse(gistempFixture());
  const m = /_(\d\d)_extent/.exec(u);
  return textResponse(nsidcFixture(Number(m![1]), u.includes("/south/") ? "S" : "N"));
}) as typeof fetch;

const failFetch = (async () => {
  throw new Error("network down");
}) as typeof fetch;

describe("query validation", () => {
  const q = (s: string) => new URLSearchParams(s);
  it("rejects malformed dates", () => {
    expect(() => parseSeriesQuery("temperature", q("start=2020-13-45"))).toThrow(ApiError);
    expect(() => parseSeriesQuery("temperature", q("start=yesterday"))).toThrow(/YYYY-MM-DD/);
  });
  it("rejects start after end", () => {
    expect(() => parseSeriesQuery("temperature", q("start=2020-01-01&end=2010-01-01"))).toThrow(/must not be after/);
  });
  it("only accepts regions for sources that support them", () => {
    expect(() => parseSeriesQuery("temperature", q("region=north"))).toThrow(/does not support a region/);
    expect(parseSeriesQuery("seaice", q("region=south")).region).toBe("south");
    expect(() => parseSeriesQuery("seaice", q("region=mars"))).toThrow(ApiError);
    expect(parseSeriesQuery("seaice", q("")).region).toBe("north");
  });
  it("validates the month filter", () => {
    expect(() => parseSeriesQuery("seaice", q("month=13"))).toThrow(ApiError);
    expect(() => parseSeriesQuery("temperature", q("month=3"))).toThrow(ApiError);
    expect(parseSeriesQuery("seaice", q("month=9")).month).toBe(9);
  });
});

describe("buildSeries provenance and normalization", () => {
  it("returns units, baseline, provenance and not-live flags for temperature", async () => {
    const store = createMemoryStore();
    const res = await buildSeries("temperature", { start: "1885-01-01", end: "1886-12-31", region: null, month: null }, { store, fetchImpl: okFetch });
    expect(res.units).toBe("°C");
    expect(res.referencePeriod).toBe("1951–1980 mean");
    expect(res.temporalResolution).toBe("monthly");
    expect(res.records).toHaveLength(24);
    expect(res.records[0].date).toBe("1885-01-01");
    expect(res.source.producer).toMatch(/GISS/);
    expect(res.source.url).toBe("https://data.giss.nasa.gov/gistemp/");
    expect(res.cache.status).toBe("live");
    expect(res.isLive).toBe(false);
    expect(new Date(res.retrievedAt).getTime()).not.toBeNaN();
    expect(res.scale.zero).toBe(0);
    // scale is independent of the requested range
    expect(res.scale.min).toBeLessThan(res.stats!.min + 1e-9);
  });

  it("attributes sea ice to NSIDC, merges 12 monthly files and honours region/month", async () => {
    const store = createMemoryStore();
    const all = await buildSeries("seaice", { start: null, end: null, region: "south", month: null }, { store, fetchImpl: okFetch });
    expect(all.source.notNasaProduced).toBe(true);
    expect(all.source.producer).toMatch(/NSIDC/);
    expect(all.region?.id).toBe("south");
    expect(all.units).toBe("million km²");
    expect(all.records.length).toBe(12 * 12 - 1); // 12 years x 12 months minus the missing Dec 1987
    const sep = await buildSeries("seaice", { start: null, end: null, region: "south", month: 9 }, { store, fetchImpl: okFetch });
    expect(sep.records.every((r) => r.date.slice(5, 7) === "09")).toBe(true);
    expect(sep.cache.status).toBe("cached");
  });

  it("refuses to invent numeric ocean data", async () => {
    await expect(buildSeries("ocean", { start: null, end: null, region: null, month: null })).rejects.toMatchObject({ status: 422, code: "numeric_series_unavailable" });
  });
});

describe("cache behaviour", () => {
  it("serves a fresh cache without calling upstream, then stale when upstream fails", async () => {
    const store = createMemoryStore();
    let now = new Date("2026-01-01T00:00:00Z");
    const produce = vi.fn(async () => ({ v: 1 }));
    const a = await getCached({ key: "k", ttlMs: 3600_000, upstreamUrl: "https://x", produce, store, now: () => now });
    expect(a.status).toBe("live");
    const b = await getCached({ key: "k", ttlMs: 3600_000, upstreamUrl: "https://x", produce, store, now: () => now });
    expect(b.status).toBe("cached");
    expect(produce).toHaveBeenCalledTimes(1);

    now = new Date("2026-01-01T05:00:00Z");
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    const c = await getCached({ key: "k", ttlMs: 3600_000, upstreamUrl: "https://x", produce: failing, store, now: () => now });
    expect(c.status).toBe("stale");
    expect(c.warnings).toContain("upstream_unreachable_serving_stale_cache");
    expect(c.ageSeconds).toBe(5 * 3600);
    expect(c.data).toEqual({ v: 1 });
  });

  it("raises SourceUnavailableError (no invented data) with nothing cached", async () => {
    await expect(
      getCached({ key: "none", ttlMs: 1, upstreamUrl: "https://example.org/src", produce: async () => Promise.reject(new Error("x")), store: createMemoryStore() }),
    ).rejects.toBeInstanceOf(SourceUnavailableError);
  });

  it("does not cache invalid upstream payloads", async () => {
    const store = createMemoryStore();
    const bad = async () => {
      throw new Error("parse failed");
    };
    await expect(getCached({ key: "bad", ttlMs: 1000, upstreamUrl: "https://x", produce: bad, store })).rejects.toBeInstanceOf(SourceUnavailableError);
    expect(await store.get("bad")).toBeNull();
  });
});

describe("upstream allow-list", () => {
  it("never fetches hosts that are not pre-approved", async () => {
    await expect(fetchAllowed("https://evil.example.com/x.csv", { fetchImpl: okFetch })).rejects.toThrow(/not allowed/);
    await expect(fetchAllowed("http://data.giss.nasa.gov/x", { fetchImpl: okFetch })).rejects.toThrow(/not allowed/);
  });
  it("produces a failing upstream as an error, not data", async () => {
    await expect(buildSeries("temperature", { start: null, end: null, region: null, month: null }, { store: createMemoryStore(), fetchImpl: failFetch })).rejects.toBeInstanceOf(SourceUnavailableError);
  });
});

describe("HTTP routes", () => {
  const call = (path: string) => seriesGET(new Request(`http://localhost${path}`), { params: Promise.resolve({ id: path.split("/")[3] }) });

  it("returns 400 with a structured error for invalid input", async () => {
    const res = await call("/api/datasets/temperature/series?start=bad");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_date");
  });
  it("returns 404 for unknown datasets", async () => {
    const res = await call("/api/datasets/nope/series");
    expect(res.status).toBe(404);
  });
  it("returns 422 for the image-only ocean topic", async () => {
    const res = await call("/api/datasets/ocean/series");
    expect(res.status).toBe(422);
  });
  it("lists verified visualizations with source details and no internal URLs", async () => {
    const body = await (await vizGET(new Request("http://localhost/api/visualizations"))).json();
    expect(body.visualizations.length).toBeGreaterThanOrEqual(5);
    for (const v of body.visualizations) {
      expect(v.sourcePageUrl).toMatch(/^https:\/\//);
      expect(v.attribution.length).toBeGreaterThan(5);
      expect(v).not.toHaveProperty("gibsUrl");
      if (v.sourceType === "NASA Worldview/GIBS") expect(v.layer).toBeTruthy();
    }
    expect(listVisualizations().some((v) => v.sourceType === "NASA EIC")).toBe(true);
  });
  it("only exposes pre-configured GIBS image URLs and rejects unknown ids", async () => {
    expect(getVisualizationImageUrl("gibs-ghrsst-mur-sst")).toMatch(/^https:\/\/gibs\.earthdata\.nasa\.gov\/wms\//);
    expect(getVisualizationImageUrl("https://evil.example.com/a.jpg")).toBeNull();
    const res = await imageGET(new Request("http://localhost/x"), { params: Promise.resolve({ id: "https://evil.example.com/a.jpg" }) });
    expect(res.status).toBe(404);
  });
});
