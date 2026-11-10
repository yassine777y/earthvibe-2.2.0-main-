"use client";

import { useState } from "react";
import { useApp } from "./Providers";
import { useSeries } from "@/lib/hooks";

type Item = { label: string; mean: number | null; n: number; loading: boolean; error: boolean };

function Bars({ items, unit, tone, signed }: { items: Item[]; unit: string; tone: "warm" | "ice"; signed: boolean }) {
  const { fmtNumber, t } = useApp();
  const vals = items.map((i) => i.mean).filter((v): v is number => v !== null);
  const maxAbs = Math.max(0.0001, ...vals.map((v) => Math.abs(v)));
  return (
    <ul className="bars">
      {items.map((it) => (
        <li key={it.label}>
          <div className="bars-label">
            <span>{it.label}</span>
            <strong>
              {it.loading ? t("common.loading") : it.error || it.mean === null ? t("compare.noData") : `${fmtNumber(it.mean, 2)} ${unit}`}
            </strong>
          </div>
          <div className="bars-track" aria-hidden="true">
            {it.mean !== null && !it.loading && (
              <span
                className={`bars-fill ${tone === "warm" ? "bars-warm" : "bars-ice"} ${signed && it.mean < 0 ? "bars-neg" : ""}`}
                style={{ width: `${Math.max(2, (Math.abs(it.mean) / maxAbs) * 100)}%` }}
              />
            )}
          </div>
          {it.n > 0 && <small className="muted">{t("compare.values", { count: fmtNumber(it.n, 0) })}</small>}
        </li>
      ))}
    </ul>
  );
}

function toItem(label: string, s: ReturnType<typeof useSeries>["state"]): Item {
  if (s.status === "ready") return { label, mean: s.data.stats?.mean ?? null, n: s.data.stats?.count ?? 0, loading: false, error: !s.data.stats };
  if (s.status === "error") return { label, mean: null, n: 0, loading: false, error: true };
  return { label, mean: null, n: 0, loading: s.status === "loading", error: false };
}

export function ComparePanel({
  datasetId,
  region,
  month,
  range,
  bounds,
  unit,
  tone,
  regionLabels,
}: {
  datasetId: "temperature" | "seaice";
  region: string | null;
  month: number | null;
  range: { start: string | null; end: string | null };
  bounds: { start: string; end: string };
  unit: string;
  tone: "warm" | "ice";
  regionLabels: Record<string, string> | null;
}) {
  const { t, fmtNumber } = useApp();
  const minY = Number(bounds.start.slice(0, 4));
  const maxY = Number(bounds.end.slice(0, 4));
  const [mode, setMode] = useState<"periods" | "regions">("periods");
  const [a0, setA0] = useState(String(datasetId === "temperature" ? 1951 : minY));
  const [a1, setA1] = useState(String(datasetId === "temperature" ? 1980 : minY + 9));
  const [b0, setB0] = useState(String(maxY - 9));
  const [b1, setB1] = useState(String(maxY));

  const okYear = (v: string) => /^\d{4}$/.test(v) && Number(v) >= minY && Number(v) <= maxY;
  const okPair = (x: string, y: string) => okYear(x) && okYear(y) && Number(x) <= Number(y);
  const aOk = okPair(a0, a1);
  const bOk = okPair(b0, b1);
  const periodsActive = mode === "periods";

  const A = useSeries(periodsActive && aOk ? datasetId : null, { start: `${a0}-01-01`, end: `${a1}-12-31`, region, month });
  const B = useSeries(periodsActive && bOk ? datasetId : null, { start: `${b0}-01-01`, end: `${b1}-12-31`, region, month });
  const regionsActive = mode === "regions" && datasetId === "seaice";
  const N = useSeries(regionsActive ? "seaice" : null, { start: range.start, end: range.end, region: "north", month });
  const S = useSeries(regionsActive ? "seaice" : null, { start: range.start, end: range.end, region: "south", month });

  const labelA = `${t("compare.periodA")}: ${a0}–${a1}`;
  const labelB = `${t("compare.periodB")}: ${b0}–${b1}`;
  const items = [toItem(labelA, A.state), toItem(labelB, B.state)];
  const regionItems = [toItem(regionLabels?.north ?? "north", N.state), toItem(regionLabels?.south ?? "south", S.state)];

  let sentence = "";
  if (periodsActive && items[0].mean !== null && items[1].mean !== null) {
    const diff = items[1].mean - items[0].mean;
    sentence = t(diff >= 0 ? "compare.sentence.higher" : "compare.sentence.lower", {
      a: `${a0}–${a1}`,
      b: `${b0}–${b1}`,
      diff: `${fmtNumber(Math.abs(diff), 2)} ${unit}`,
    });
  }
  if (regionsActive && regionItems[0].mean !== null && regionItems[1].mean !== null) {
    sentence = t("compare.sentence.regions", {
      north: fmtNumber(regionItems[0].mean, 2),
      south: fmtNumber(regionItems[1].mean, 2),
      unit,
    });
  }

  return (
    <section className="panel" aria-labelledby="compare-h">
      <h3 id="compare-h">{t("compare.title")}</h3>
      {datasetId === "seaice" && (
        <div className="seg" role="group" aria-label={t("compare.mode")}>
          <button type="button" aria-pressed={mode === "periods"} onClick={() => setMode("periods")}>
            {t("compare.periods")}
          </button>
          <button type="button" aria-pressed={mode === "regions"} onClick={() => setMode("regions")}>
            {t("compare.regions")}
          </button>
        </div>
      )}
      {datasetId === "temperature" && <p className="note">{t("compare.regionsDisabled")}</p>}

      {periodsActive ? (
        <>
          <p className="muted">{t("compare.desc")}</p>
          <div className="compare-inputs">
            {[
              { name: t("compare.periodA"), v0: a0, v1: a1, s0: setA0, s1: setA1, ok: aOk },
              { name: t("compare.periodB"), v0: b0, v1: b1, s0: setB0, s1: setB1, ok: bOk },
            ].map((p) => (
              <fieldset key={p.name} className="fieldset">
                <legend>{p.name}</legend>
                <div className="year-pair">
                  <label>
                    <span>{t("compare.from")}</span>
                    <input className="input" inputMode="numeric" value={p.v0} onChange={(e) => p.s0(e.target.value)} aria-invalid={!p.ok} />
                  </label>
                  <label>
                    <span>{t("compare.to")}</span>
                    <input className="input" inputMode="numeric" value={p.v1} onChange={(e) => p.s1(e.target.value)} aria-invalid={!p.ok} />
                  </label>
                </div>
                {!p.ok && <p className="field-error">{t("compare.invalid", { min: minY, max: maxY })}</p>}
              </fieldset>
            ))}
          </div>
          <Bars items={items} unit={unit} tone={tone} signed={datasetId === "temperature"} />
        </>
      ) : (
        <>
          <p className="muted">{t("compare.regionsDesc")}</p>
          <Bars items={regionItems} unit={unit} tone={tone} signed={false} />
        </>
      )}
      {sentence && (
        <p className="compare-sentence" role="status">
          {sentence}
        </p>
      )}
    </section>
  );
}
