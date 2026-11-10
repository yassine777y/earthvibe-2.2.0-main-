import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { messages } from "@/lib/i18n/messages";
import { buildImageFrames, buildSeriesFrames, degreeToFreq, DEGREES, MAX_SERIES_FRAMES } from "@/lib/audio/mapping";
import { Providers } from "@/components/Providers";
import { Chart } from "@/components/Chart";

describe("i18n", () => {
  const keys = Object.keys(messages.en);
  it("has every key in English, Arabic and French", () => {
    for (const lang of ["ar", "fr"] as const) {
      expect(Object.keys(messages[lang]).sort()).toEqual([...keys].sort());
      for (const k of keys) expect((messages[lang] as Record<string, string>)[k].length).toBeGreaterThan(0);
    }
  });
  it("keeps the same {placeholders} in every language", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of keys) {
      for (const lang of ["ar", "fr"] as const) {
        expect(ph((messages[lang] as Record<string, string>)[k]), `${lang}:${k}`).toBe(ph((messages.en as Record<string, string>)[k]));
      }
    }
  });
});

describe("data → sound mapping", () => {
  const records = Array.from({ length: 1700 }, (_, i) => ({ date: `${1880 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`, value: -0.4 + i / 1700 }));
  const scale = { min: -0.5, max: 1.5, zero: 0 };

  it("limits the number of notes and keeps pitch inside the scale", () => {
    const t = buildSeriesFrames(records, scale, "temperature");
    expect(t.frames.length).toBeLessThanOrEqual(MAX_SERIES_FRAMES);
    for (const f of t.frames) {
      expect(f.degree).toBeGreaterThanOrEqual(0);
      expect(f.degree).toBeLessThan(DEGREES);
    }
  });
  it("maps warmer values to higher pitch and marks the zero baseline", () => {
    const t = buildSeriesFrames(records, scale, "temperature");
    expect(t.frames[t.frames.length - 1].degree).toBeGreaterThan(t.frames[0].degree);
    expect(t.zeroDegree).toBe(Math.round((0.5 / 2) * (DEGREES - 1)));
    expect(degreeToFreq(5)).toBeCloseTo(220, 5);
  });
  it("uses pulses for rate of change and never exceeds 4", () => {
    const t = buildSeriesFrames(records, scale, "temperature");
    for (const f of t.frames) expect(f.pulses).toBeGreaterThanOrEqual(1), expect(f.pulses).toBeLessThanOrEqual(4);
    const flat = buildSeriesFrames(records.map((r) => ({ ...r, value: 0.2 })), scale, "temperature");
    expect(flat.frames.every((f) => f.pulses === 1)).toBe(true);
  });
  it("maps more sea ice to more harmonic layers", () => {
    const ice = [{ date: "2000-01-01", value: 2 }, { date: "2001-01-01", value: 15 }];
    const t = buildSeriesFrames(ice, { min: 2, max: 15, zero: null }, "seaice");
    expect(t.frames[0].layers).toBe(1);
    expect(t.frames[1].layers).toBe(4);
  });
  it("builds one frame per image band and only pans when allowed", () => {
    const bands = Array.from({ length: 28 }, (_, i) => ({ index: i, brightness: i / 27, hue: 20, saturation: 0.5, warmth: 0.2, contrast: 0.1 }));
    const t = buildImageFrames(bands, false);
    expect(t.frames).toHaveLength(28);
    expect(t.panAllowed).toBe(false);
    expect(t.frames[0].degree).toBe(0);
    expect(t.frames[27].degree).toBe(DEGREES - 1);
  });
});

describe("Chart accessibility", () => {
  it("exposes an accessible summary and a baseline label", () => {
    const html = renderToString(
      <Providers>
        <Chart
          records={[{ date: "2000-01-01", value: 0.4 }, { date: "2001-01-01", value: 0.5 }, { date: "2002-01-01", value: -0.1 }]}
          hasZero
          unit="°C"
          cursor={1}
          onSeek={() => undefined}
          summary="Summary text for screen readers"
          tone="warm"
        />
      </Providers>,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Summary text for screen readers"');
    expect(html).toContain("1951–1980");
  });
});
