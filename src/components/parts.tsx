"use client";

import { memo, useCallback, useState } from "react";
import { useApp } from "./Providers";
import type { ClientApiError } from "@/lib/hooks";
import type { SeriesResponse } from "@/lib/server/datasets";
import type { Visualization } from "@/lib/server/visualizations";
import type { MessageKey } from "@/lib/i18n/messages";

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { t } = useApp();
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="link">
      {children}
      <span className="sr-only"> ({t("common.opensNewTab")})</span>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false" className="ext-icon">
        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

export function ErrorNotice({ error, sourceUrl, onRetry }: { error: ClientApiError; sourceUrl: string; onRetry: () => void }) {
  const { t } = useApp();
  const msg: MessageKey =
    error.code === "network_error" ? "err.network" : error.code === "source_unavailable" ? "err.source" : "err.generic";
  const url = typeof error.details?.sourceUrl === "string" ? (error.details.sourceUrl as string) : sourceUrl;
  return (
    <div className="notice notice-error" role="alert">
      <strong>{t("err.title")}</strong>
      <p>{t(msg)}</p>
      <p className="notice-actions">
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          {t("common.retry")}
        </button>
        <ExternalLink href={url}>{t("err.openSource")}</ExternalLink>
      </p>
    </div>
  );
}

export function LoadingNotice({ label }: { label: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function vizKey(id: string, part: "title" | "caption"): MessageKey {
  return `viz.${id}.${part}` as MessageKey;
}

export function VisualizationFigure({ viz, priority = false, children }: { viz: Visualization; priority?: boolean; children?: React.ReactNode }) {
  const { t, fmtDate } = useApp();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const title = t(vizKey(viz.id, "title"));
  const dateText = viz.imageDate ? fmtDate(viz.imageDate, "full") : null;

  return (
    <figure className="viz">
      {viz.hasImage ? (
        <div className={`viz-frame ${viz.equirectangular ? "" : "viz-square"}`}>
          {!loaded && !failed && <div className="viz-skeleton" aria-hidden="true" />}
          {failed ? (
            <div className="notice notice-error" role="alert">
              <strong>{t("viz.imageError")}</strong>
              <p className="notice-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setFailed(false);
                    setLoaded(false);
                    setAttempt((a) => a + 1);
                  }}
                >
                  {t("common.retry")}
                </button>
                <ExternalLink href={viz.sourcePageUrl}>{t("err.openSource")}</ExternalLink>
              </p>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={attempt}
              src={`/api/visualizations/${viz.id}/image${attempt ? `?r=${attempt}` : ""}`}
              alt={t("viz.alt", { title, date: dateText ?? "" })}
              loading={priority ? "eager" : "lazy"}
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className="viz-img"
            />
          )}
        </div>
      ) : (
        <div className="viz-linkcard">
          <span className="badge badge-ice">{t("viz.linkOnly")}</span>
          <p>{t("viz.linkOnlyNote")}</p>
          <ExternalLink href={viz.sourcePageUrl}>{t("viz.openPage")}</ExternalLink>
        </div>
      )}
      <figcaption>
        <div className="viz-head">
          <h3>{title}</h3>
          <span className="badge badge-ocean">{viz.sourceType}</span>
        </div>
        <p>{t(vizKey(viz.id, "caption"))}</p>
        <dl className="meta">
          <div>
            <dt>{t("viz.officialTitle")}</dt>
            <dd>{viz.title}</dd>
          </div>
          {dateText && (
            <div>
              <dt>{t("viz.date")}</dt>
              <dd>{dateText}</dd>
            </div>
          )}
          <div>
            <dt>{t("viz.provider")}</dt>
            <dd>{viz.provider}</dd>
          </div>
          {viz.layer && (
            <div>
              <dt>{t("viz.layer")}</dt>
              <dd>
                <code>{viz.layer}</code>
              </dd>
            </div>
          )}
        </dl>
        {viz.relationToData === "context-not-same-product" && <p className="note">{t("viz.contextNote")}</p>}
        <p className="note">{viz.attribution}</p>
        <p>
          <ExternalLink href={viz.sourcePageUrl}>{t("viz.sourcePage")}</ExternalLink>
        </p>
        {children}
      </figcaption>
    </figure>
  );
}

export function CacheBadge({ status, ageSeconds }: { status: "live" | "cached" | "stale"; ageSeconds: number }) {
  const { t, lang } = useApp();
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  const age =
    ageSeconds < 90
      ? rtf.format(0, "second")
      : ageSeconds < 5400
        ? rtf.format(-Math.round(ageSeconds / 60), "minute")
        : ageSeconds < 129600
          ? rtf.format(-Math.round(ageSeconds / 3600), "hour")
          : rtf.format(-Math.round(ageSeconds / 86400), "day");
  const cls = status === "stale" ? "badge-warn" : status === "cached" ? "badge-ice" : "badge-ocean";
  const icon = status === "stale" ? "⚠" : status === "cached" ? "◷" : "●";
  return (
    <span className={`badge ${cls}`}>
      <span aria-hidden="true">{icon}</span> {t(`cache.${status}` as MessageKey, { age })}
    </span>
  );
}

export function SourcePanel({ data }: { data: SeriesResponse }) {
  const { t, lang, fmtDate } = useApp();
  const retrieved = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.retrievedAt));
  const limits = [1, 2, 3].map((n) => `lim.${data.datasetId}.${n}` as MessageKey);
  return (
    <section className="panel" aria-labelledby={`src-${data.datasetId}`}>
      <h3 id={`src-${data.datasetId}`}>{t("source.title")}</h3>
      <div className="badge-row">
        <CacheBadge status={data.cache.status} ageSeconds={data.cache.ageSeconds} />
        <span className="badge badge-ghost">{t("source.notLive")}</span>
        {data.source.notNasaProduced && <span className="badge badge-warn">{t("source.notNasa")}</span>}
      </div>
      {data.warnings.map((w) => (
        <p key={w} className="notice notice-warn" role="status">
          {t(`warn.${w}` as MessageKey)}
        </p>
      ))}
      <dl className="meta">
        <div>
          <dt>{t("source.dataset")}</dt>
          <dd>{data.source.name}</dd>
        </div>
        <div>
          <dt>{t("source.producer")}</dt>
          <dd>{data.source.producer}</dd>
        </div>
        <div>
          <dt>{t("source.units")}</dt>
          <dd>{data.units}</dd>
        </div>
        <div>
          <dt>{t("source.resolution")}</dt>
          <dd>{data.month ? t("source.resolution.month") : t("source.resolution.monthly")}</dd>
        </div>
        {data.referencePeriod && (
          <div>
            <dt>{t("source.reference")}</dt>
            <dd>{t("source.reference.value")}</dd>
          </div>
        )}
        <div>
          <dt>{t("source.coverage")}</dt>
          <dd>
            {fmtDate(data.availableRange.start, "month")} – {fmtDate(data.availableRange.end, "month")}
          </dd>
        </div>
        <div>
          <dt>{t("source.retrieved")}</dt>
          <dd>{retrieved}</dd>
        </div>
        <div>
          <dt>{t("source.citation")}</dt>
          <dd>{data.source.citation}</dd>
        </div>
      </dl>
      <p className="link-row">
        <ExternalLink href={data.source.url}>{t("source.page")}</ExternalLink>
        {data.source.dataUrl && <ExternalLink href={data.source.dataUrl}>{t("source.data")}</ExternalLink>}
      </p>
      <h4>{t("source.limits")}</h4>
      <ul className="list">
        {limits.map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ul>
    </section>
  );
}

const Rows = memo(function Rows({ records, fmt }: { records: { date: string; value: number }[]; fmt: (r: { date: string; value: number }) => [string, string] }) {
  return (
    <tbody>
      {records.map((r) => {
        const [d, v] = fmt(r);
        return (
          <tr key={r.date}>
            <th scope="row">
              <time dateTime={r.date}>{d}</time>
            </th>
            <td>{v}</td>
          </tr>
        );
      })}
    </tbody>
  );
});

export const DataTable = memo(function DataTable({ records, unit, caption }: { records: { date: string; value: number }[]; unit: string; caption: string }) {
  const { t, fmtDate, fmtNumber } = useApp();
  const [open, setOpen] = useState(false);
  const fmt = useCallback(
    (r: { date: string; value: number }): [string, string] => [fmtDate(r.date, "monthShort"), fmtNumber(r.value, 2)],
    [fmtDate, fmtNumber],
  );
  return (
    <details className="panel details" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        {t("table.title")} <span className="muted">({t("table.rows", { count: fmtNumber(records.length, 0) })})</span>
      </summary>
      {open && (
        <div className="table-scroll" tabIndex={0} role="region" aria-label={t("table.region")}>
          <table className="data-table">
            <caption>{caption}</caption>
            <thead>
              <tr>
                <th scope="col">{t("table.date")}</th>
                <th scope="col">
                  {t("table.value")} ({unit})
                </th>
              </tr>
            </thead>
            <Rows records={records} fmt={fmt} />
          </table>
        </div>
      )}
    </details>
  );});
