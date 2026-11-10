"use client";

import { useMemo, useState } from "react";
import { useApp } from "./Providers";
import { Explorer } from "./Explorer";
import { ImageSonifier } from "./ImageSonifier";
import { ExternalLink, LoadingNotice, VisualizationFigure } from "./parts";
import { useVisualizations } from "@/lib/hooks";
import type { Visualization } from "@/lib/server/visualizations";
import type { MessageKey } from "@/lib/i18n/messages";

type Topic = "temperature" | "seaice" | "ocean";

const TOPICS: { id: Topic; code: string; kind: "numeric" | "image"; icon: React.ReactNode }[] = [
  {
    id: "temperature",
    code: "A1",
    kind: "numeric",
    icon: (
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
        <path d="M13 5a3 3 0 016 0v13.2a6 6 0 11-6 0z" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="16" cy="23" r="3" fill="currentColor" />
        <path d="M16 11v12" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
  {
    id: "seaice",
    code: "B2",
    kind: "numeric",
    icon: (
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
        <path d="M16 3v26M5 9.5l22 13M27 9.5l-22 13M11 5l5 4 5-4M11 27l5-4 5 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "ocean",
    code: "C3",
    kind: "image",
    icon: (
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
        <path d="M3 12c3-4 5 4 8 0s5 4 8 0 5 4 8 0M3 19c3-4 5 4 8 0s5 4 8 0 5 4 8 0M3 26c3-4 5 4 8 0s5 4 8 0 5 4 8 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
];

function OceanPanel({ visuals }: { visuals: Visualization[] }) {
  const { t } = useApp();
  const presets = visuals.filter((v) => v.topic === "ocean" && v.hasImage);
  const linked = visuals.filter((v) => v.topic === "ocean" && !v.hasImage);
  return (
    <div className="explorer">
      <section className="panel" aria-labelledby="ocean-why">
        <h3 id="ocean-why">{t("ocean.why.title")}</h3>
        <p>{t("ocean.why.body")}</p>
        <ul className="list">
          <li>{t("ocean.why.1")}</li>
          <li>{t("ocean.why.2")}</li>
          <li>{t("ocean.why.3")}</li>
        </ul>
        <p className="link-row">
          <ExternalLink href="https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1">PO.DAAC — GHRSST MUR SST</ExternalLink>
          <ExternalLink href="https://oceancolor.gsfc.nasa.gov/">NASA OceanColor</ExternalLink>
          <ExternalLink href="https://worldview.earthdata.nasa.gov/">NASA Worldview</ExternalLink>
        </p>
        <p className="note">{t("ocean.noCompare")}</p>
      </section>
      <section className="panel" aria-labelledby="ocean-sonify">
        <h3 id="ocean-sonify">{t("ocean.sonify.title")}</h3>
        <ImageSonifier presets={presets} allowUpload={false} idPrefix="ocean" />
      </section>
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

export function Experience() {
  const { t } = useApp();
  const [topic, setTopic] = useState<Topic>("temperature");
  const [filter, setFilter] = useState<"all" | Topic>("all");
  const [request, setRequest] = useState<{ id: string; nonce: number } | null>(null);
  const { state, retry } = useVisualizations();
  const visuals = useMemo(() => (state.status === "ready" ? state.data : []), [state]);
  const imageVisuals = visuals.filter((v) => v.hasImage);

  return (
    <div>
      <section className="section" id="explore" aria-labelledby="explore-h">
        <div className="wrap">
          <span className="section-index" aria-hidden="true">01</span>
          <h2 id="explore-h">{t("explore.title")}</h2>
          <p className="lead">{t("explore.lead")}</p>

          <div className="topics" role="group" aria-label={t("explore.choose")}>
            {TOPICS.map((tp) => (
              <button
                key={tp.id}
                type="button"
                className={`topic topic-${tp.id}`}
                aria-pressed={topic === tp.id}
                onClick={() => setTopic(tp.id)}
              >
                <span className="topic-code" aria-hidden="true">{tp.code}</span>
                <span className="topic-icon">{tp.icon}</span>
                <span className="topic-title">{t(`topic.${tp.id}.title` as MessageKey)}</span>
                <span className="topic-desc">{t(`topic.${tp.id}.lead` as MessageKey)}</span>
                <span className="topic-tag">
                  {tp.kind === "numeric" ? "◉ " : "▣ "}
                  {t(`topic.${tp.id}.tag` as MessageKey)}
                </span>
              </button>
            ))}
          </div>

          {state.status === "loading" && <LoadingNotice label={t("common.loading")} />}
          {state.status === "error" && (
            <div className="notice notice-error" role="alert">
              <strong>{t("err.title")}</strong>
              <p>{t("err.network")}</p>
              <p className="notice-actions">
                <button type="button" className="btn btn-primary" onClick={retry}>{t("common.retry")}</button>
              </p>
            </div>
          )}

          {state.status === "ready" && (
            <div key={topic} className="topic-body" role="region" aria-label={t(`topic.${topic}.title` as MessageKey)}>
              <h3 className="topic-heading">{t(`topic.${topic}.title` as MessageKey)}</h3>
              {topic === "ocean" ? <OceanPanel visuals={visuals} /> : <Explorer topic={topic} visuals={visuals} />}
            </div>
          )}
        </div>
      </section>

      <section className="section section-alt" id="gallery" aria-labelledby="gallery-h">
        <div className="wrap">
          <span className="section-index" aria-hidden="true">02</span>
          <h2 id="gallery-h">{t("gallery.title")}</h2>
          <p className="lead">{t("gallery.lead")}</p>
          <div className="seg seg-wrap" role="group" aria-label={t("gallery.filter")}>
            {(["all", "temperature", "seaice", "ocean"] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? t("gallery.all") : t(`topic.${f}.title` as MessageKey)}
              </button>
            ))}
          </div>
          {state.status === "loading" && <LoadingNotice label={t("common.loading")} />}
          <div className="gallery">
            {visuals
              .filter((v) => filter === "all" || v.topic === filter)
              .map((v) => (
                <div key={v.id} className="panel gallery-card">
                  <VisualizationFigure viz={v}>
                    {v.hasImage && (
                      <p>
                        <a
                          href="#image-lab"
                          className="btn btn-ghost"
                          onClick={() => setRequest({ id: v.id, nonce: Date.now() })}
                        >
                          {t("gallery.sonify")}
                        </a>
                      </p>
                    )}
                  </VisualizationFigure>
                </div>
              ))}
          </div>
        </div>
      </section>

      <section className="section" id="image-lab" aria-labelledby="lab-h">
        <div className="wrap">
          <span className="section-index" aria-hidden="true">03</span>
          <h2 id="lab-h">{t("lab.title")}</h2>
          <p className="lead">{t("lab.lead")}</p>
          <div className="panel">
            <ImageSonifier presets={imageVisuals} allowUpload request={request} idPrefix="lab" />
          </div>
        </div>
      </section>
    </div>
  );
}
