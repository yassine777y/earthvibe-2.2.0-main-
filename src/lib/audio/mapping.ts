/**
 * Pure data → sound mapping. Everything the listener hears is derived here from loaded values,
 * so the mapping can be unit-tested and documented. Musical choices are NOT scientific measurements.
 */
import type { Band } from "@/lib/server/image-analysis";

export type Mode = "temperature" | "seaice" | "image";

export type Frame = {
  /** ISO date (series) or band label (image) */
  label: string;
  /** block mean of the data value (series) or band brightness (image) */
  value: number;
  /** 0..1 position of the value inside the stable scale */
  norm: number;
  /** pentatonic scale degree 0..DEGREES-1 */
  degree: number;
  /** -1..1 rate of change relative to the full scale range */
  rate: number;
  /** number of harmonic layers (sea ice) 1..4 */
  layers: number;
  /** pulses per note 1..4 (rate of change / texture) */
  pulses: number;
  /** index range of source records covered by this frame (series) */
  recStart: number;
  recEnd: number;
  hue?: number;
  saturation?: number;
  warmth?: number;
  contrast?: number;
  /** -1..1 horizontal position, used only for optional stereo sweep */
  pan?: number;
};

export type Track = {
  mode: Mode;
  frames: Frame[];
  stride: number;
  /** degree that corresponds to a zero anomaly (temperature only) */
  zeroDegree: number | null;
  panAllowed: boolean;
};

export const DEGREES = 15; // three octaves of a major pentatonic scale
export const FRAMES_PER_SECOND: Record<Mode, number> = { temperature: 6, seaice: 6, image: 2.5 };
export const MAX_SERIES_FRAMES = 160;
const PENTATONIC = [0, 2, 4, 7, 9];
const BASE_FREQ = 110; // A2

export function degreeToFreq(degree: number): number {
  const d = Math.max(0, Math.min(DEGREES - 1, Math.round(degree)));
  const semis = Math.floor(d / 5) * 12 + PENTATONIC[d % 5];
  return BASE_FREQ * 2 ** (semis / 12);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Scale = { min: number; max: number; zero: number | null };

export function normalize(v: number, scale: Scale): number {
  const span = scale.max - scale.min;
  return span > 0 ? clamp((v - scale.min) / span, 0, 1) : 0.5;
}

export function buildSeriesFrames(
  records: { date: string; value: number }[],
  scale: Scale,
  mode: "temperature" | "seaice",
): Track {
  const n = records.length;
  const stride = Math.max(1, Math.ceil(n / MAX_SERIES_FRAMES));
  const frames: Frame[] = [];
  for (let i = 0; i < n; i += stride) {
    const slice = records.slice(i, Math.min(n, i + stride));
    const mean = slice.reduce((a, r) => a + r.value, 0) / slice.length;
    const norm = normalize(mean, scale);
    frames.push({
      label: slice[Math.floor(slice.length / 2)].date,
      value: mean,
      norm,
      degree: Math.round(norm * (DEGREES - 1)),
      rate: 0,
      layers: 1 + Math.round(norm * 3),
      pulses: 1,
      recStart: i,
      recEnd: Math.min(n, i + stride) - 1,
    });
  }
  const span = scale.max - scale.min || 1;
  frames.forEach((f, i) => {
    const a = frames[Math.max(0, i - 2)].value;
    const b = frames[Math.min(frames.length - 1, i + 2)].value;
    f.rate = clamp((b - a) / (0.25 * span), -1, 1);
    f.pulses = 1 + Math.round(Math.abs(f.rate) * 3);
  });
  const zeroDegree =
    mode === "temperature" && scale.zero !== null ? Math.round(normalize(scale.zero, scale) * (DEGREES - 1)) : null;
  return { mode, frames, stride, zeroDegree, panAllowed: false };
}

export function buildImageFrames(bands: Band[], panAllowed: boolean): Track {
  const n = bands.length;
  const frames: Frame[] = bands.map((b, i) => ({
    label: String(i + 1),
    value: b.brightness,
    norm: b.brightness,
    degree: Math.round(clamp(b.brightness, 0, 1) * (DEGREES - 1)),
    rate: 0,
    layers: 1,
    pulses: b.contrast < 0.15 ? 1 : b.contrast < 0.35 ? 2 : 3,
    recStart: i,
    recEnd: i,
    hue: b.hue,
    saturation: b.saturation,
    warmth: b.warmth,
    contrast: b.contrast,
    pan: n > 1 ? (i / (n - 1)) * 2 - 1 : 0,
  }));
  return { mode: "image", frames, stride: 1, zeroDegree: null, panAllowed };
}

/** Index of the frame covering a given record index. */
export function frameIndexForRecord(track: Track, recordIndex: number): number {
  return clamp(Math.floor(recordIndex / track.stride), 0, track.frames.length - 1);
}
