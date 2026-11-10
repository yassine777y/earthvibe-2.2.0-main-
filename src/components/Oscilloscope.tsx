"use client";

import { useEffect, useRef } from "react";

/**
 * Decorative live waveform of the audio actually leaving the engine.
 * Purely visual (aria-hidden): every value is already exposed as text by the readout and table.
 */
export function Oscilloscope({ getAnalyser, playing }: { getAnalyser: () => AnalyserNode | null; playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let buf: Uint8Array<ArrayBuffer> | null = null;
    const styles = getComputedStyle(canvas);
    const warm = styles.getPropertyValue("--c-warm-strong").trim() || "#ff8a4c";
    const ice = styles.getPropertyValue("--c-ice").trim() || "#8fe3e8";
    const grid = styles.getPropertyValue("--c-line").trim() || "rgba(143,227,232,.2)";

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += w / 12) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const analyser = getAnalyser();
      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      gradient.addColorStop(0, ice);
      gradient.addColorStop(1, warm);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2.25;
      ctx.shadowColor = warm;
      ctx.shadowBlur = playing ? 12 : 0;
      ctx.beginPath();

      if (analyser && playing) {
        if (!buf || buf.length !== analyser.fftSize) buf = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        const gain = 0.85 / Math.max(peak / 128, 0.08);
        const step = buf.length / w;
        for (let x = 0; x < w; x++) {
          const v = ((buf[Math.floor(x * step)] - 128) / 128) * gain;
          const y = h / 2 + v * (h / 2);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        for (let x = 0; x < w; x++) {
          const y = h / 2 + Math.sin(x / 18) * 2.5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (playing && !reduceMotion) raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [getAnalyser, playing]);

  return (
    <div className={`scope${playing ? " scope-on" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="scope-canvas" />
      <span className="scope-label">{playing ? "● SIGNAL" : "○ STANDBY"}</span>
    </div>
  );
}
