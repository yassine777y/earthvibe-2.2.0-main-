"use client";

import { useApp } from "./Providers";
import { Oscilloscope } from "./Oscilloscope";
import type { PlayerApi } from "@/lib/hooks";
import type { Track } from "@/lib/audio/mapping";

const Icon = {
  play: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" />
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="14" height="14" rx="1.5" fill="currentColor" />
    </svg>
  ),
  volume: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M4 9v6h4l5 4V5L8 9zM16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  muted: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" />
      <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

const SPEEDS = [0.5, 0.75, 1, 1.5, 2, 3];

export function Transport({
  player,
  track,
  valueText,
  idPrefix,
}: {
  player: PlayerApi;
  track: Track | null;
  /** accessible text for the current position, e.g. "July 1998" */
  valueText: string;
  idPrefix: string;
}) {
  const { t, announce, fmtNumber } = useApp();
  const n = track?.frames.length ?? 0;
  const disabled = n === 0;
  const idx = Math.min(Math.max(0, n - 1), Math.floor(player.position));

  return (
    <div className="transport" role="group" aria-label={t("player.controls")}>
      <Oscilloscope getAnalyser={player.getAnalyser} playing={player.playing} />
      <div className="transport-main">
        {player.playing ? (
          <button
            type="button"
            className="btn btn-primary btn-round"
            onClick={() => {
              player.pause();
              announce(t("player.announce.paused", { value: valueText }));
            }}
            disabled={disabled}
          >
            {Icon.pause}
            <span>{t("player.pause")}</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-round"
            onClick={() => {
              void player.play();
              announce(t("player.announce.playing"));
            }}
            disabled={disabled}
          >
            {Icon.play}
            <span>{player.ended ? t("player.replay") : t("player.play")}</span>
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            player.stop();
            announce(t("player.announce.stopped"));
          }}
          disabled={disabled || (!player.playing && player.position === 0)}
        >
          {Icon.stop}
          <span>{t("player.stop")}</span>
        </button>
      </div>

      <div className="field">
        <label htmlFor={`${idPrefix}-seek`}>{t("player.timeline")}</label>
        <input
          id={`${idPrefix}-seek`}
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          step={1}
          value={idx}
          disabled={disabled}
          onChange={(e) => player.seek(Number(e.target.value))}
          aria-valuetext={valueText}
          className="slider"
          style={{ ["--fill" as string]: `${n > 1 ? (idx / (n - 1)) * 100 : 0}%` }}
        />
      </div>

      <div className="transport-row">
        <div className="field">
          <label htmlFor={`${idPrefix}-speed`}>{t("player.speed")}</label>
          <select id={`${idPrefix}-speed`} value={player.speed} onChange={(e) => player.setSpeed(Number(e.target.value))} className="select">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {fmtNumber(s, s % 1 === 0 ? 0 : 2)}×
              </option>
            ))}
          </select>
        </div>
        <div className="field field-grow">
          <label htmlFor={`${idPrefix}-vol`}>{t("player.volume")}</label>
          <div className="vol-row">
            <button
              type="button"
              className="btn btn-icon"
              aria-pressed={player.muted}
              aria-label={player.muted ? t("player.unmute") : t("player.mute")}
              onClick={() => player.setMuted(!player.muted)}
            >
              {player.muted ? Icon.muted : Icon.volume}
            </button>
            <input
              id={`${idPrefix}-vol`}
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(player.volume * 100)}
              onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
              aria-valuetext={`${Math.round(player.volume * 100)}%`}
              className="slider"
              style={{ ["--fill" as string]: `${player.volume * 100}%` }}
            />
          </div>
        </div>
      </div>

      {track?.panAllowed && (
        <label className="check">
          <input type="checkbox" checked={player.stereo} onChange={(e) => player.setStereo(e.target.checked)} />
          <span>
            {t("player.stereo")} <small>{t("player.stereo.hint")}</small>
          </span>
        </label>
      )}
      {player.audioError && (
        <p className="notice notice-error" role="alert">
          {t("player.audioError")}
        </p>
      )}
    </div>
  );
}
