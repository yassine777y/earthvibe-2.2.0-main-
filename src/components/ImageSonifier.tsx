"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useApp } from "./Providers";
import { Transport } from "./Transport";
import { ExternalLink, LoadingNotice } from "./parts";
import { analyzeImage, ClientApiError, usePlayer, type AnalyzeResult } from "@/lib/hooks";
import { buildImageFrames } from "@/lib/audio/mapping";
import { describeFrame } from "@/lib/describe";
import type { Visualization } from "@/lib/server/visualizations";
import type { MessageKey } from "@/lib/i18n/messages";

type Source = { kind: "catalog"; id: string } | { kind: "upload" };

const KNOWN_ERRORS = ["file_too_large", "image_too_large", "unsupported_image_type", "invalid_image", "empty_file"];

export function ImageSonifier({
  presets,
  allowUpload,
  request,
  idPrefix,
}: {
  presets: Visualization[];
  allowUpload: boolean;
  request?: { id: string; nonce: number } | null;
  idPrefix: string;
}) {
  const { t, fmtNumber, fmtDate, announce } = useApp();
  const [source, setSource] = useState<Source>(allowUpload ? { kind: "upload" } : { kind: "catalog", id: presets[0]?.id ?? "" });
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ClientApiError | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const inputId = useId();

  const runCatalog = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const r = await analyzeImage({ visualizationId: id });
        setResult(r);
        announce(t("img.announce.ready"));
      } catch (e) {
        setResult(null);
        setError(e instanceof ClientApiError ? e : new ClientApiError("network_error", "", null, 0));
      } finally {
        setLoading(false);
      }
    },
    [announce, t],
  );

  const setPreviewUrl = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  };

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  // initial catalogue analysis (ocean panel) and external requests (gallery "sonify" buttons)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!allowUpload && presets[0]) void runCatalog(presets[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!request) return;
    setPreviewUrl(null);
    setSource({ kind: "catalog", id: request.id });
    void runCatalog(request.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.nonce]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setSource({ kind: "upload" });
    setError(null);
    setResult(null);
    if (file.size > 8 * 1024 * 1024) {
      setError(new ClientApiError("file_too_large", "", null, 413));
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setLoading(true);
    try {
      const r = await analyzeImage({ file });
      setResult(r);
      announce(t("img.announce.ready"));
    } catch (e) {
      setPreviewUrl(null);
      setError(e instanceof ClientApiError ? e : new ClientApiError("network_error", "", null, 0));
    } finally {
      setLoading(false);
    }
  }

  const activeViz = source.kind === "catalog" ? presets.find((p) => p.id === source.id) ?? null : null;
  const track = useMemo(
    () => (result ? buildImageFrames(result.features.bands, !!(result.source.type === "catalog" && result.source.visualization.equirectangular)) : null),
    [result],
  );
  const player = usePlayer(track);
  const n = track?.frames.length ?? 0;
  const idx = track ? Math.min(n - 1, Math.floor(player.position)) : 0;
  const frame = track?.frames[idx];
  const pct = n > 0 ? Math.min(100, (Math.min(player.position, n) / n) * 100) : 0;
  const imgSrc = source.kind === "upload" ? preview : activeViz ? `/api/visualizations/${activeViz.id}/image` : null;
  const description =
    frame && track
      ? describeFrame({ t, mode: "image", frame, dateText: "", valueText: "", unit: "", frameCount: n, frameIndex: idx, fmtPct: (v) => fmtNumber(v, 0) })
      : "";

  const errKey: MessageKey | null = error
    ? ((KNOWN_ERRORS.includes(error.code) ? `img.err.${error.code}` : error.code === "network_error" ? "err.network" : "err.generic") as MessageKey)
    : null;

  return (
    <div className="imagelab">
      <div className="imagelab-head">
        <span className="badge badge-warm">{t("img.badge")}</span>
        <p className="note">{t("img.notScience")}</p>
      </div>

      <div className="seg seg-wrap" role="group" aria-label={t("img.chooseSource")}>
        {allowUpload && (
          <button
            type="button"
            aria-pressed={source.kind === "upload"}
            onClick={() => {
              setSource({ kind: "upload" });
              setResult(null);
              setError(null);
              setPreviewUrl(null);
            }}
          >
            {t("img.upload")}
          </button>
        )}
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={source.kind === "catalog" && source.id === p.id}
            onClick={() => {
              setPreviewUrl(null);
              setSource({ kind: "catalog", id: p.id });
              void runCatalog(p.id);
            }}
          >
            {t(`viz.${p.id}.title` as MessageKey)}
          </button>
        ))}
      </div>

      {source.kind === "upload" && (
        <div className="dropzone">
          <label htmlFor={inputId} className="btn btn-primary">
            {t("img.choose")}
          </label>
          <input
            id={inputId}
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="file-input"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="note">{t("img.limits")}</p>
          <p className="note">{t("img.privacy")}</p>
        </div>
      )}

      {loading && <LoadingNotice label={t("img.analyzing")} />}
      {error && errKey && (
        <div className="notice notice-error" role="alert">
          <strong>{t("err.title")}</strong>
          <p>{t(errKey)}</p>
          {source.kind === "catalog" && activeViz && (
            <p className="notice-actions">
              <button type="button" className="btn btn-primary" onClick={() => void runCatalog(activeViz.id)}>
                {t("common.retry")}
              </button>
              <ExternalLink href={activeViz.sourcePageUrl}>{t("err.openSource")}</ExternalLink>
            </p>
          )}
        </div>
      )}

      {imgSrc && result && (
        <div className="imagelab-grid">
          <div>
            <div className="scan" dir="ltr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgSrc} alt={source.kind === "upload" ? t("img.alt.upload") : t("viz.alt", { title: t(`viz.${activeViz?.id}.title` as MessageKey), date: activeViz?.imageDate ? fmtDate(activeViz.imageDate, "full") : "" })} />
              <span className="scan-line" style={{ left: `${pct}%` }} aria-hidden="true" />
            </div>
            <div className="bandbars" dir="ltr" aria-hidden="true">
              {result.features.bands.map((b, i) => (
                <span
                  key={i}
                  className={`bandbar ${i === idx && (player.playing || player.position > 0) ? "bandbar-on" : ""}`}
                  style={{ height: `${8 + b.brightness * 92}%`, background: `hsl(${b.hue} ${20 + b.saturation * 60}% ${30 + b.brightness * 40}%)` }}
                />
              ))}
            </div>
            <p className="note">{t("img.bandsNote", { count: result.features.bandCount })}</p>
            {activeViz && (
              <div className="note">
                <p>
                  <span className="badge badge-ocean">{activeViz.sourceType}</span> {t(`viz.${activeViz.id}.title` as MessageKey)}
                  {activeViz.imageDate ? ` — ${fmtDate(activeViz.imageDate, "full")}` : ""}
                </p>
                <p>{activeViz.attribution}</p>
                <p>
                  <ExternalLink href={activeViz.sourcePageUrl}>{t("viz.sourcePage")}</ExternalLink>
                </p>
              </div>
            )}
          </div>

          <div className="panel">
            <h4>{t("img.player")}</h4>
            <Transport player={player} track={track} valueText={t("img.bandOf", { index: idx + 1, count: n })} idPrefix={`${idPrefix}-img`} />
            <div className="hearing">
              <h4>{t("player.hearing")}</h4>
              <p>{description || t("player.hearing.idle")}</p>
            </div>
            <ul className="list">
              {[1, 2, 3, 4].map((k) => (
                <li key={k}>{t(`map.image.${k}` as MessageKey)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result && (
        <details className="panel details">
          <summary>{t("img.table.title")}</summary>
          <div className="table-scroll" tabIndex={0} role="region" aria-label={t("img.table.title")}>
            <table className="data-table">
              <caption>{t("img.table.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("img.col.band")}</th>
                  <th scope="col">{t("img.col.brightness")}</th>
                  <th scope="col">{t("img.col.hue")}</th>
                  <th scope="col">{t("img.col.saturation")}</th>
                  <th scope="col">{t("img.col.warmth")}</th>
                  <th scope="col">{t("img.col.contrast")}</th>
                </tr>
              </thead>
              <tbody>
                {result.features.bands.map((b) => (
                  <tr key={b.index}>
                    <th scope="row">{fmtNumber(b.index + 1, 0)}</th>
                    <td>{fmtNumber(b.brightness * 100, 0)}%</td>
                    <td>{fmtNumber(b.hue, 0)}°</td>
                    <td>{fmtNumber(b.saturation * 100, 0)}%</td>
                    <td>{fmtNumber(b.warmth, 2)}</td>
                    <td>{fmtNumber(b.contrast, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
