import type { Frame, Mode } from "@/lib/audio/mapping";
import type { MessageKey } from "@/lib/i18n/messages";

type T = (key: MessageKey, params?: Record<string, string | number>) => string;

const pitchKey = (norm: number): MessageKey => (norm < 0.34 ? "pitch.low" : norm < 0.67 ? "pitch.mid" : "pitch.high");

/** Short plain-language description of what the listener is hearing at a given frame. */
export function describeFrame(opts: {
  t: T;
  mode: Mode;
  frame: Frame;
  dateText: string;
  valueText: string;
  unit: string;
  frameCount: number;
  frameIndex: number;
  fmtPct: (n: number) => string;
}): string {
  const { t, mode, frame, dateText, valueText, unit, fmtPct } = opts;
  const trend: MessageKey =
    frame.rate > 0.15 ? "trend.up" : frame.rate < -0.15 ? "trend.down" : "trend.flat";
  if (mode === "temperature") {
    const rel: MessageKey = frame.value > 0.05 ? "rel.above" : frame.value < -0.05 ? "rel.below" : "rel.near";
    return t("desc.temperature", {
      date: dateText,
      value: valueText,
      unit,
      relation: t(rel),
      pitch: t(pitchKey(frame.norm)),
      trend: t(trend),
      pulses: frame.pulses,
    });
  }
  if (mode === "seaice") {
    return t("desc.seaice", {
      date: dateText,
      value: valueText,
      unit,
      pct: fmtPct(frame.norm * 100),
      layers: frame.layers,
      trend: t(trend),
      pulses: frame.pulses,
    });
  }
  const warm: MessageKey = (frame.warmth ?? 0) > 0.08 ? "tone.warm" : (frame.warmth ?? 0) < -0.08 ? "tone.cool" : "tone.neutral";
  return t("desc.image", {
    index: opts.frameIndex + 1,
    count: opts.frameCount,
    brightness: fmtPct(frame.norm * 100),
    tone: t(warm),
    saturation: fmtPct((frame.saturation ?? 0) * 100),
    pitch: t(pitchKey(frame.norm)),
    pulses: frame.pulses,
  });
}
