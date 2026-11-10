"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "./Providers";
import { Chart } from "./Chart";
import { Transport } from "./Transport";
import { ComparePanel } from "./ComparePanel";
import { DataTable, ErrorNotice, LoadingNotice, SourcePanel, VisualizationFigure, ExternalLink } from "./parts";
import { usePlayer, useSeries } from "@/lib/hooks";
import { buildSeriesFrames } from "@/lib/audio/mapping";
import { describeFrame } from "@/lib/describe";
import type { SeriesResponse } from "@/lib/server/datasets";
import type { Visualization } from "@/lib/server/visualizations";
import type { MessageKey } from "@/lib/i18n/messages";

const SOURCE_FALLBACK = { temperature: "https://data.giss.nasa.gov/gistemp/", seaice: "https://nsidc.org/data/g02135" };

function endOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(d).padStart(2, "0")}`;
}

export function Explorer({ topic, visuals }: { topic: "temperature" | "seaice"; visuals: Visualization[] }) {
  const { t, fmtNumber, fmtDate } = useApp();
  const [range, setRange] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [region, setRegion] = useState<"north" | "south">("north");
  const [month, setMonth] = useState<number | null>(null);
  const [rangeError, setRangeError] = useState(false);
  const { state, retry } = useSeries(topic, { ...range, region: topic === "seaice" ? region : null, month });
  const [shown, setShown] = useState<SeriesResponse | null>(null);

  useEffect(() => {
    if (state.status === "ready") setShown(state.data);
  }, [state]);

  const unit = topic === "temperature" ? "°C" : t("unit.mkm2");
  const tone = topic === "temperature" ? "warm" : "ice";
  const records = shown?.records ?? [];
  const track = useMemo(
    () => (shown && shown.records.length > 0 ? buildSeriesFrames(shown.records, shown.scale, topic) : null),
    [shown, topic],
  );
  const player = usePlayer(track);

  const frameIdx = track ? Math.min(track.frames.length - 1, Math.floor(player.position)) : 0;
  const frame = track?.frames[frameIdx];
  const recIdx = track ? Math.min(records.length - 1, Math.floor(Math.min(player.position, track.frames.length - 0.001) * track.stride)) : null;
  const sign = (v: number) => (topic === "temperature" && v > 0 ? "+" : "");
  const valueText = frame ? `${sign(frame.value)}${fmtNumber(frame.value, 2)} ${unit}` : "";
  const dateText = frame ? fmtDate(frame.label, "monthShort") : "";

  const description =
    frame && track
      ? describeFrame({
          t,
          mode: topic,
          frame,
          dateText,
          valueText: `${sign(frame.value)}${fmtNumber(frame.value, 2)}`,
          unit,
          frameCount: track.frames.length,
          frameIndex: frameIdx,
          fmtPct: (n) => fmtNumber(n, 0),
        })
      : "";

  const bounds = shown?.availableRange ?? null;
  const vizId = topic === "temperature" ? "gibs-airs-surface-air-temperature" : region === "north" ? "gibs-arctic-sea-ice-concentration" : "gibs-antarctic-sea-ice-concentration";
  const viz = visuals.find((v) => v.id === vizId);
  const linked = visuals.filter((v) => v.topic === topic && !v.hasImage);

  const summary = useMemo(() => {
    if (!shown || !shown.stats) return "";
    let minR = shown.records[0], maxR = shown.records[0];
    for (const r of shown.records) {
      if (r.value < minR.value) minR = r;
      if (r.value > maxR.value) maxR = r;
    }
    const u = topic === "temperature" ? "°C" : t("unit.mkm2");
    return t("chart.summary", {
      title: t(`topic.${topic}.title` as MessageKey),
      count: fmtNumber(shown.records.length, 0),
      start: fmtDate(shown.records[0].date, "monthShort"),
      end: fmtDate(shown.records[shown.records.length - 1].date, "monthShort"),
      min: `${fmtNumber(minR.value, 2)} ${u}`,
      minDate: fmtDate(minR.date, "monthShort"),
      max: `${fmtNumber(maxR.value, 2)} ${u}`,
      maxDate: fmtDate(maxR.date, "monthShort"),
      mean: `${fmtNumber(shown.stats.mean, 2)} ${u}`,
      first: `${fmtNumber(shown.stats.first.value, 2)} ${u}`,
      last: `${fmtNumber(shown.stats.last.value, 2)} ${u}`,
    });
  }, [shown, topic, t, fmtNumber, fmtDate]);

  function applyRange(startYM: string | null, endYM: string | null) {
    const s = startYM ?? range.start?.slice(0, 7) ?? bounds?.start.slice(0, 7) ?? null;
    const e = endYM ?? range.end?.slice(0, 7) ?? bounds?.end.slice(0, 7) ?? null;
    if (!s || !e || !/^\d{4}-\d{2}$/.test(s) || !/^\d{4}-\d{2}$/.test(e)) return;
    if (s > e) {
      setRangeError(true);
      return;
    }
    setRangeError(false);
    setRange({ start: `${s}-01`, end: endOfMonth(e) });
  }
  function preset(years: number | null) {
    setRangeError(false);
    if (!years || !bounds) return setRange({ start: null, end: null });
    const endY = Number(bounds.end.slice(0, 4));
    setRange({ start: `${endY - years + 1}-01-01`, end: null });
  }

  const regionLabels = { north: t("region.north"), south: t("region.south") };
  const loading = state.status === "loading";
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="explorer" aria-busy={loading}>
      <div className="explorer-top">
        <div>{viz ? <VisualizationFigure viz={viz} priority /> : null}</div>

        <section className="panel player-panel" aria-labelledby={`player-${topic}`}>
          <h3 id={`player-${topic}`}>{t("player.title")}</h3>
          <p className="badge badge-warm sound-badge">{t("player.badge.data")}</p>
          <div className="readout" aria-label={t("player.now")}>
            <span className="readout-label">{t("player.now")}</span>
            <span className="readout-date">{dateText || "—"}</span>
            <span className="readout-value">{valueText || "—"}</span>
          </div>
          <Transport player={player} track={track} valueText={`${dateText} ${valueText}`} idPrefix={`tr-${topic}`} />
          <div className="hearing">
            <h4>{t("player.hearing")}</h4>
            <p>{description || t("player.hearing.idle")}</p>
          </div>
        </section>
      </div>

      <section className="panel" aria-labelledby={`chart-${topic}`}>
        <h3 id={`chart-${topic}`}>{t("chart.title")}</h3>

        <div className="controls">
          <div className="field">
            <label htmlFor={`from-${topic}`}>{t("range.from")}</label>
            <input
              id={`from-${topic}`}
              className="input"
              type="month"
              min={bounds?.start.slice(0, 7)}
              max={bounds?.end.slice(0, 7)}
              value={(range.start ?? bounds?.start ?? "").slice(0, 7)}
              onChange={(e) => applyRange(e.target.value, null)}
              aria-invalid={rangeError}
              disabled={!bounds}
            />
          </div>
          <div className="field">
            <label htmlFor={`to-${topic}`}>{t("range.to")}</label>
            <input
              id={`to-${topic}`}
              className="input"
              type="month"
              min={bounds?.start.slice(0, 7)}
              max={bounds?.end.slice(0, 7)}
              value={(range.end ?? bounds?.end ?? "").slice(0, 7)}
              onChange={(e) => applyRange(null, e.target.value)}
              aria-invalid={rangeError}
              disabled={!bounds}
            />
          </div>
          <div className="field">
            <span className="label-like" id={`presets-${topic}`}>{t("range.presets")}</span>
            <div className="seg" role="group" aria-labelledby={`presets-${topic}`}>
              <button type="button" onClick={() => preset(null)}>{t("range.full")}</button>
              <button type="button" onClick={() => preset(50)} disabled={!bounds}>{t("range.50")}</button>
              <button type="button" onClick={() => preset(10)} disabled={!bounds}>{t("range.10")}</button>
            </div>
          </div>

          {topic === "seaice" ? (
            <>
              <div className="field">
                <label htmlFor="region-sel">{t("region.label")}</label>
                <select id="region-sel" className="select" value={region} onChange={(e) => setRegion(e.target.value as "north" | "south")}>
                  <option value="north">{regionLabels.north}</option>
                  <option value="south">{regionLabels.south}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="month-sel">{t("month.label")}</label>
                <select id="month-sel" className="select" value={month ?? ""} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">{t("month.all")}</option>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      {fmtDate(`2001-${String(m).padStart(2, "0")}-01`, "monthName")}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="region-dis">{t("region.label")}</label>
              <select id="region-dis" className="select" disabled aria-describedby="region-why">
                <option>{t("region.global")}</option>
              </select>
            </div>
          )}
        </div>
        {topic === "temperature" && (
          <p id="region-why" className="note">
            {t("region.disabledWhy")}
          </p>
        )}
        {rangeError && (
          <p className="field-error" role="alert">
            {t("range.invalid")}
          </p>
        )}

        {state.status === "error" && !shown && <ErrorNotice error={state.error} sourceUrl={SOURCE_FALLBACK[topic]} onRetry={retry} />}
        {state.status === "error" && shown && <ErrorNotice error={state.error} sourceUrl={SOURCE_FALLBACK[topic]} onRetry={retry} />}
        {state.status !== "error" && !shown && <LoadingNotice label={t("common.loading")} />}
        {loading && shown && <LoadingNotice label={t("common.loading")} />}

        {shown && records.length === 0 && <p className="notice notice-warn">{t("chart.empty")}</p>}
        {shown && records.length > 0 && (
          <>
            <p className="chart-summary">{summary}</p>
            <Chart
              records={records}
              hasZero={topic === "temperature"}
              unit={unit}
              cursor={recIdx}
              onSeek={(i) => track && player.seek(i / track.stride)}
              summary={summary}
              tone={tone}
            />
            <p className="note">{t("chart.clickToSeek")}</p>
          </>
        )}
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby={`map-${topic}`}>
          <h3 id={`map-${topic}`}>{t("map.title")}</h3>
          <ul className="list">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>{t(`map.${topic}.${n}` as MessageKey)}</li>
            ))}
          </ul>
          {shown && (
            <>
              <p className="scale-note">
                {t("map.scale", { min: fmtNumber(shown.scale.min, 2), max: fmtNumber(shown.scale.max, 2), unit })}
              </p>
              <div className="pitch-legend" aria-hidden="true">
                <span>{t("pitch.low")} · {fmtNumber(shown.scale.min, 1)}</span>
                <span className="pitch-bar" />
                <span>{fmtNumber(shown.scale.max, 1)} · {t("pitch.high")}</span>
              </div>
            </>
          )}
          <p className="note">{t("map.disclaimer")}</p>
        </section>

        {bounds && (
          <ComparePanel
            key={`${topic}-${region}-${month}`}
            datasetId={topic}
            region={topic === "seaice" ? region : null}
            month={month}
            range={range}
            bounds={bounds}
            unit={unit}
            tone={tone}
            regionLabels={topic === "seaice" ? regionLabels : null}
          />
        )}
      </div>

      {shown && records.length > 0 && (
        <DataTable
          records={records}
          unit={unit}
          caption={t("table.caption", { title: t(`topic.${topic}.title` as MessageKey), unit })}
        />
      )}

      {shown && <SourcePanel data={shown} />}

      {linked.length > 0 && (
        <section className="panel">
          <h3>{t("linked.title")}</h3>
          <ul className="list">
            {linked.map((v) => (
              <li key={v.id}>
                <ExternalLink href={v.sourcePageUrl}>{t(`viz.${v.id}.title` as MessageKey)}</ExternalLink> — <span className="muted">{v.sourceType}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
