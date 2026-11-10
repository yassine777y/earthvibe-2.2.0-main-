"use client";

import { useMemo } from "react";
import { useApp } from "./Providers";
import { ExternalLink } from "./parts";
import { useSeries } from "@/lib/hooks";
import type { Lang } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/messages";

const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "fr", label: "Français" },
];

function Logo() {
  return (
    <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="22" fill="var(--c-panel)" stroke="var(--c-ice)" strokeWidth="2" />
      <circle cx="24" cy="24" r="15" fill="none" stroke="var(--c-ocean)" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="9" fill="none" stroke="var(--c-ocean)" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="5" fill="var(--c-warm-strong)" />
      <path d="M33 8a19 19 0 0 1 7 8" stroke="var(--c-ice)" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Header() {
  const { t, lang, setLang, theme, toggleTheme } = useApp();
  return (
    <>
      <a href="#main" className="skip-link">
        {t("nav.skip")}
      </a>
      <header className="site-header">
        <div className="wrap header-row">
          <a href="#top" className="brand" aria-label={t("brand.aria")}>
            <Logo />
            <span>Earth Jukebox</span>
          </a>
          <nav aria-label={t("nav.label")} className="nav">
            <a href="#explore">{t("nav.explore")}</a>
            <a href="#gallery">{t("nav.gallery")}</a>
            <a href="#image-lab">{t("nav.imageLab")}</a>
            <a href="#method">{t("nav.method")}</a>
          </nav>
          <div className="header-tools">
            <div className="seg seg-sm" role="group" aria-label={t("nav.language")}>
              {LANGS.map((l) => (
                <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>
                  {l.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-icon" onClick={toggleTheme} aria-label={theme === "dark" ? t("nav.themeToLight") : t("nav.themeToDark")}>
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="4.5" fill="currentColor" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                  <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" fill="currentColor" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

function lerpColor(stops: [number, string][], v: number): string {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const f = (v - p0) / (p1 - p0 || 1);
      const a = hex(c0), b = hex(c1);
      return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * f)).join(",")})`;
    }
  }
  return stops[stops.length - 1][1];
}

const STRIPE_STOPS: [number, string][] = [
  [0, "#1F5F73"],
  [0.35, "#5FC4CF"],
  [0.55, "#F2E6D3"],
  [0.78, "#FF7A3D"],
  [1, "#B3240B"],
];

type AnnualPoint = { year: number; value: number; color: string };

function useAnnualTemperature() {
  const { state } = useSeries("temperature", {});
  const annual = useMemo<AnnualPoint[]>(() => {
    if (state.status !== "ready") return [];
    const byYear = new Map<string, number[]>();
    for (const r of state.data.records) {
      const y = r.date.slice(0, 4);
      byYear.set(y, [...(byYear.get(y) ?? []), r.value]);
    }
    const points = [...byYear.entries()]
      .filter(([, v]) => v.length === 12)
      .map(([y, v]) => ({ year: Number(y), value: v.reduce((a, b) => a + b, 0) / 12 }));
    if (points.length === 0) return [];
    const lo = Math.min(...points.map((p) => p.value));
    const hi = Math.max(...points.map((p) => p.value));
    return points.map((p) => ({ ...p, color: lerpColor(STRIPE_STOPS, (p.value - lo) / (hi - lo || 1)) }));
  }, [state]);
  return { annual, error: state.status === "error" };
}

function signed(fmt: (n: number, d?: number) => string, n: number) {
  return `${n > 0 ? "+" : ""}${fmt(n, 2)}`;
}

function WarmingStripes({ annual, error }: { annual: AnnualPoint[]; error: boolean }) {
  const { t, fmtNumber } = useApp();
  if (error) return <p className="note hero-stripes-note">{t("hero.stripes.error")}</p>;
  if (annual.length === 0) return <div className="stripes stripes-loading" aria-hidden="true" />;
  const lo = Math.min(...annual.map((a) => a.value));
  const hi = Math.max(...annual.map((a) => a.value));
  return (
    <figure className="stripes-fig">
      <div
        className="stripes"
        role="img"
        aria-label={t("hero.stripes.aria", {
          from: annual[0].year,
          to: annual[annual.length - 1].year,
          min: fmtNumber(lo, 2),
          max: fmtNumber(hi, 2),
        })}
        dir="ltr"
      >
        {annual.map((a) => (
          <span key={a.year} style={{ background: a.color }} />
        ))}
      </div>
      <figcaption className="note">
        {t("hero.stripes.caption", { from: annual[0].year, to: annual[annual.length - 1].year })}{" "}
        <ExternalLink href="https://data.giss.nasa.gov/gistemp/">NASA GISS GISTEMP v4</ExternalLink>
      </figcaption>
    </figure>
  );
}

const R_INNER = 66;
const R_OUTER = 190;

function ClimateRecord({ annual }: { annual: AnnualPoint[] }) {
  const n = annual.length;
  const groove = n > 0 ? (R_OUTER - R_INNER) / n : 0;
  const placeholderRings = Array.from({ length: 12 }, (_, i) => R_INNER + 6 + i * 10);
  return (
    <>
      <svg className="record" viewBox="0 0 400 400" aria-hidden="true" focusable="false" direction="ltr">
        <circle cx="200" cy="200" r="196" fill="var(--c-record)" />
        {n > 0
          ? annual.map((a, i) => (
              <circle
                key={a.year}
                cx="200"
                cy="200"
                r={R_INNER + groove * (i + 0.5)}
                fill="none"
                stroke={a.color}
                strokeWidth={groove * 1.05}
              />
            ))
          : null}
        {n > 0
          ? annual
              .filter((a) => a.year % 10 === 0)
              .map((a) => (
                <circle
                  key={`decade-${a.year}`}
                  cx="200"
                  cy="200"
                  r={R_INNER + groove * annual.indexOf(a)}
                  fill="none"
                  stroke="#05080f"
                  strokeOpacity="0.45"
                  strokeWidth="0.8"
                />
              ))
          : placeholderRings.map((r) => (
              <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="var(--c-groove)" strokeWidth="1" />
            ))}
        <circle cx="200" cy="200" r={R_INNER - 2} fill="var(--c-warm)" />
        <path id="ring" d="M200 200m-46 0a46 46 0 1 1 92 0a46 46 0 1 1-92 0" fill="none" />
        <text className="record-text">
          <textPath href="#ring" startOffset="0">
            {`EARTH · JUKEBOX · ${annual[0]?.year ?? 1880} → ${annual[n - 1]?.year ?? "NOW"} ·`}
          </textPath>
        </text>
        <circle cx="200" cy="200" r="8" fill="var(--c-bg)" />
      </svg>
      <svg className="record-overlay" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id="record-sheen" cx="30%" cy="25%" r="80%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="196" fill="url(#record-sheen)" />
        <g className="tonearm">
          <circle cx="362" cy="44" r="20" fill="var(--c-panel-raise)" stroke="var(--c-ice)" strokeWidth="2" />
          <circle cx="362" cy="44" r="6" fill="var(--c-ice)" />
          <path d="M362 44L300 150L286 206" stroke="var(--c-text)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <rect x="272" y="200" width="28" height="16" rx="3" transform="rotate(-15 286 208)" fill="var(--c-warm-strong)" />
        </g>
      </svg>
    </>
  );
}

function Ticker({ annual }: { annual: AnnualPoint[] }) {
  const { fmtNumber } = useApp();
  if (annual.length === 0) return null;
  const items = annual.filter((_, i) => i % 3 === 0 || i === annual.length - 1);
  const row = (copy: string) =>
    items.map((a) => (
      <span key={`${copy}-${a.year}`} className="ticker-item">
        <i style={{ background: a.color }} />
        {a.year} <b>{signed(fmtNumber, a.value)} °C</b>
      </span>
    ));
  return (
    <div className="ticker" aria-hidden="true" dir="ltr">
      <div className="ticker-track">
        {row("a")}
        {row("b")}
      </div>
    </div>
  );
}

export function Hero() {
  const { t, fmtNumber } = useApp();
  const { annual, error } = useAnnualTemperature();
  const warmest = annual.length ? annual.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  const first = annual[0];
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-aurora" aria-hidden="true" />
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="onair" aria-hidden="true" />
            {t("hero.eyebrow")}
          </p>
          <h1 id="hero-title">
            <span className="h1-line">Earth</span>
            <span className="h1-line h1-accent">Jukebox</span>
          </h1>
          <p className="hero-lead">{t("hero.lead")}</p>
          <p className="hero-actions">
            <a href="#explore" className="btn btn-primary btn-lg">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
                <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
              </svg>
              {t("hero.cta")}
            </a>
            <a href="#image-lab" className="btn btn-ghost btn-lg">
              {t("hero.cta2")}
            </a>
          </p>
          {warmest && first && (
            <dl className="hero-stats">
              <div>
                <dt>{t("hero.stat.years")}</dt>
                <dd>{fmtNumber(annual.length, 0)}</dd>
              </div>
              <div>
                <dt>{t("hero.stat.first", { year: first.year })}</dt>
                <dd className="stat-cool">{signed(fmtNumber, first.value)} °C</dd>
              </div>
              <div>
                <dt>{t("hero.stat.warmest", { year: warmest.year })}</dt>
                <dd className="stat-warm">{signed(fmtNumber, warmest.value)} °C</dd>
              </div>
            </dl>
          )}
          <p className="disclaimer-pill">{t("disclaimer.short")}</p>
        </div>
        <div className="hero-art">
          <div className="record-stage">
            <ClimateRecord annual={annual} />
          </div>
          {annual.length > 0 && (
            <p className="record-legend">
              {t("hero.record.legend", { from: annual[0].year, to: annual[annual.length - 1].year })}
            </p>
          )}
        </div>
      </div>
      <Ticker annual={annual} />
      <div className="wrap">
        <WarmingStripes annual={annual} error={error} />
      </div>
    </section>
  );
}

export function Method() {
  const { t } = useApp();
  const steps: MessageKey[] = ["method.step1", "method.step2", "method.step3", "method.step4"];
  return (
    <section className="section" id="method" aria-labelledby="method-h">
      <div className="wrap">
        <span className="section-index" aria-hidden="true">04</span>
          <h2 id="method-h">{t("method.title")}</h2>
        <p className="lead">{t("method.lead")}</p>
        <ol className="steps">
          {steps.map((k, i) => (
            <li key={k}>
              <span className="step-no" aria-hidden="true">{i + 1}</span>
              <p>{t(k)}</p>
            </li>
          ))}
        </ol>
        <div className="grid-3">
          {(["temperature", "seaice", "ocean"] as const).map((id) => (
            <article className="panel" key={id}>
              <h3>{t(`topic.${id}.title` as MessageKey)}</h3>
              <p>{t(`method.${id}` as MessageKey)}</p>
            </article>
          ))}
        </div>
        <div className="grid-2">
          <article className="panel">
            <h3>{t("method.honesty.title")}</h3>
            <ul className="list">
              {[1, 2, 3, 4].map((n) => (
                <li key={n}>{t(`method.honesty.${n}` as MessageKey)}</li>
              ))}
            </ul>
          </article>
          <article className="panel">
            <h3>{t("method.a11y.title")}</h3>
            <ul className="list">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n}>{t(`method.a11y.${n}` as MessageKey)}</li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const { t } = useApp();
  return (
    <footer className="site-footer">
      <div className="wrap">
        <p className="disclaimer-box" role="note">
          <strong>{t("disclaimer.title")}</strong> {t("disclaimer.long")}
        </p>
        <h2 className="footer-h">{t("footer.citations")}</h2>
        <ul className="citations">
          <li>
            <strong>GISTEMP v4 — </strong>
            GISTEMP Team: GISS Surface Temperature Analysis (GISTEMP), version 4. NASA Goddard Institute for Space Studies. <ExternalLink href="https://data.giss.nasa.gov/gistemp/">data.giss.nasa.gov/gistemp</ExternalLink>. Lenssen, N., et al. (2019), J. Geophys. Res. Atmos., 124, 6307–6326, doi:10.1029/2018JD029522.
          </li>
          <li>
            <strong>Sea Ice Index v4 (G02135) — </strong>
            Fetterer, F., Knowles, K., Meier, W. N., Savoie, M., Windnagel, A. K., &amp; Stafford, T. National Snow and Ice Data Center, Boulder, Colorado USA. <ExternalLink href="https://doi.org/10.7265/a98x-0f50">doi:10.7265/a98x-0f50</ExternalLink> · <ExternalLink href="https://nsidc.org/data/g02135">nsidc.org/data/g02135</ExternalLink>
          </li>
          <li>
            <strong>NASA GIBS / Worldview — </strong>
            We acknowledge the use of imagery provided by services from NASA&apos;s Global Imagery Browse Services (GIBS), part of NASA&apos;s Earth Observing System Data and Information System (EOSDIS). <ExternalLink href="https://worldview.earthdata.nasa.gov/">worldview.earthdata.nasa.gov</ExternalLink> · <ExternalLink href="https://nasa-gibs.github.io/gibs-api-docs/">GIBS API docs</ExternalLink>
          </li>
          <li>
            <strong>NASA Earth Information Center — </strong>
            <ExternalLink href="https://earth.gov/">earth.gov</ExternalLink> · <ExternalLink href="https://svs.gsfc.nasa.gov/5480/">SVS 5480</ExternalLink> · <ExternalLink href="https://podaac.jpl.nasa.gov/dataset/MUR-JPL-L4-GLOB-v4.1">PO.DAAC MUR SST</ExternalLink> · <ExternalLink href="https://oceancolor.gsfc.nasa.gov/">NASA OceanColor</ExternalLink>
          </li>
        </ul>
        <p className="note">{t("footer.built")}</p>
      </div>
    </footer>
  );
}
