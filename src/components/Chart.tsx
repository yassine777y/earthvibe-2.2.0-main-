"use client";

import { useId, useMemo } from "react";
import { useApp } from "./Providers";

type Rec = { date: string; value: number };

export function Chart({
  records,
  hasZero,
  unit,
  cursor,
  onSeek,
  summary,
  tone,
}: {
  records: Rec[];
  hasZero: boolean;
  unit: string;
  cursor: number | null;
  onSeek: (recordIndex: number) => void;
  summary: string;
  tone: "warm" | "ice";
}) {
  const { fmtNumber, fmtDate, t } = useApp();
  const uid = useId().replace(/:/g, "");
  const W = 800, H = 320, ml = 56, mr = 14, mt = 16, mb = 34;
  const n = records.length;

  const geo = useMemo(() => {
    if (n === 0) return null;
    let lo = Infinity, hi = -Infinity;
    for (const r of records) {
      if (r.value < lo) lo = r.value;
      if (r.value > hi) hi = r.value;
    }
    if (hasZero) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    const pad = (hi - lo || 1) * 0.08;
    lo -= pad;
    hi += pad;
    const x = (i: number) => ml + (n === 1 ? 0.5 : i / (n - 1)) * (W - ml - mr);
    const y = (v: number) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb);
    const line = records.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(r.value).toFixed(1)}`).join("");
    const baseY = hasZero ? y(0) : H - mb;
    const area = `${line}L${x(n - 1).toFixed(1)} ${baseY.toFixed(1)}L${x(0).toFixed(1)} ${baseY.toFixed(1)}Z`;
    const yTicks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * k) / 4);
    const xTickCount = Math.min(6, n);
    const xTicks = Array.from({ length: xTickCount }, (_, k) => (xTickCount === 1 ? 0 : Math.round((k * (n - 1)) / (xTickCount - 1))));
    return { x, y, line, area, baseY, yTicks, xTicks };
  }, [records, n, hasZero]);

  if (!geo) return null;
  const cur = cursor !== null ? Math.max(0, Math.min(n - 1, cursor)) : null;
  const stroke = tone === "warm" ? "var(--c-warm-strong)" : "var(--c-ice-strong)";
  const fill = tone === "warm" ? "var(--c-warm-fill)" : "var(--c-ice-fill)";

  return (
    <div className="chart-wrap" dir="ltr" role="group" aria-label={t("chart.title")} tabIndex={0}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={summary}
        className="chart"
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const f = (px - ml) / (W - ml - mr);
          onSeek(Math.round(Math.max(0, Math.min(1, f)) * (n - 1)));
        }}
      >
        <defs>
          <pattern id={`hatch-${uid}`} patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--c-cool-fill)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--c-cool-strong)" strokeWidth="2" />
          </pattern>
          <clipPath id={`above-${uid}`}>
            <rect x={ml} y={0} width={W - ml - mr} height={Math.max(0, geo.baseY)} />
          </clipPath>
          <clipPath id={`below-${uid}`}>
            <rect x={ml} y={geo.baseY} width={W - ml - mr} height={H} />
          </clipPath>
        </defs>

        {geo.yTicks.map((v, k) => (
          <g key={k}>
            <line x1={ml} x2={W - mr} y1={geo.y(v)} y2={geo.y(v)} className="chart-grid" />
            <text x={ml - 8} y={geo.y(v) + 4} textAnchor="end" className="chart-tick">
              {fmtNumber(v, Math.abs(v) < 10 ? 1 : 0)}
            </text>
          </g>
        ))}
        {geo.xTicks.map((i, k) => (
          <text key={k} x={geo.x(i)} y={H - 10} textAnchor="middle" className="chart-tick">
            {fmtDate(records[i].date, "year")}
          </text>
        ))}
        <text x={12} y={H / 2} className="chart-unit" transform={`rotate(-90 12 ${H / 2})`} textAnchor="middle">
          {unit}
        </text>

        {hasZero ? (
          <>
            <path d={geo.area} fill={fill} clipPath={`url(#above-${uid})`} />
            <path d={geo.area} fill={`url(#hatch-${uid})`} clipPath={`url(#below-${uid})`} opacity="0.85" />
            <line x1={ml} x2={W - mr} y1={geo.baseY} y2={geo.baseY} className="chart-zero" />
            <text x={W - mr - 4} y={geo.baseY - 6} textAnchor="end" className="chart-zero-label">
              {t("chart.baseline")}
            </text>
          </>
        ) : (
          <path d={geo.area} fill={fill} />
        )}
        <path d={geo.line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />

        {cur !== null && (
          <g>
            <line x1={geo.x(cur)} x2={geo.x(cur)} y1={mt} y2={H - mb} className="chart-cursor" />
            <circle cx={geo.x(cur)} cy={geo.y(records[cur].value)} r="6" className="chart-dot" />
          </g>
        )}
      </svg>
    </div>
  );
}
