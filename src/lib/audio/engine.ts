/**
 * Browser-side Web Audio engine. Sound is generated live from the loaded frames while the user plays;
 * nothing is pre-recorded and nothing starts without a user action.
 */
import { FRAMES_PER_SECOND, degreeToFreq, type Frame, type Track } from "./mapping";

export type EngineState = { position: number; playing: boolean; ended: boolean };

type Partial = { ratio: number; gain: number; type: OscillatorType };

const MASTER_CEILING = 0.45; // keeps the loudest possible output comfortable

export class JukeboxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private track: Track | null = null;
  private pos = 0;
  private lastTriggered = -1;
  private lastTs = 0;
  private playing = false;
  private ended = false;
  private speed = 1;
  private volume = 0.6;
  private muted = false;
  private stereo = false;

  constructor(private onChange: (s: EngineState) => void) {}

  load(track: Track | null) {
    this.stopInternal(true);
    this.track = track;
    this.pos = 0;
    this.ended = false;
    this.emit();
  }

  private emit() {
    this.onChange({ position: this.pos, playing: this.playing, ended: this.ended });
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("audio_unsupported");
    const ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : this.volume * MASTER_CEILING;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    master.connect(comp).connect(analyser).connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.analyser = analyser;
    return ctx;
  }

  /** Read-only tap on the output so the UI can draw the waveform that is actually being played. */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  async play() {
    if (!this.track || this.track.frames.length === 0) return;
    const ctx = this.ensureContext();
    if (ctx.state === "suspended") await ctx.resume();
    if (this.playing) return;
    const n = this.track.frames.length;
    if (this.pos >= n - 0.001) this.pos = 0;
    this.ended = false;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master!);
    this.startDrone();
    this.lastTriggered = Math.floor(this.pos) - 1;
    this.lastTs = performance.now();
    this.playing = true;
    this.timer = setInterval(() => this.tick(), 40);
    this.emit();
  }

  pause() {
    this.stopInternal(false);
    this.emit();
  }

  stop() {
    this.stopInternal(true);
    this.pos = 0;
    this.ended = false;
    this.emit();
  }

  private stopInternal(_reset: boolean) {
    void _reset;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    if (this.ctx && this.bus) {
      const bus = this.bus;
      const t = this.ctx.currentTime;
      bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(0, t, 0.03);
      const drone = this.droneOsc;
      setTimeout(() => {
        try {
          drone?.stop();
        } catch {
          /* already stopped */
        }
        bus.disconnect();
      }, 300);
    }
    this.bus = null;
    this.droneOsc = null;
  }

  seek(position: number) {
    if (!this.track) return;
    const n = this.track.frames.length;
    this.pos = Math.max(0, Math.min(n - 0.001, position));
    this.ended = false;
    this.lastTriggered = Math.floor(this.pos) - 1;
    this.lastTs = performance.now();
    this.emit();
  }

  setSpeed(s: number) {
    this.speed = s;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMaster();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyMaster();
  }

  setStereo(on: boolean) {
    this.stereo = on;
  }

  private applyMaster() {
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * MASTER_CEILING, this.ctx.currentTime, 0.03);
    }
  }

  dispose() {
    this.stopInternal(true);
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  private tick() {
    if (!this.track || !this.playing) return;
    const now = performance.now();
    const dt = (now - this.lastTs) / 1000;
    this.lastTs = now;
    const fps = FRAMES_PER_SECOND[this.track.mode];
    this.pos += dt * fps * this.speed;
    const n = this.track.frames.length;
    while (this.lastTriggered + 1 <= this.pos && this.lastTriggered + 1 < n) {
      this.lastTriggered += 1;
      this.trigger(this.track.frames[this.lastTriggered]);
    }
    if (this.pos >= n) {
      // let the final note ring briefly, then stop
      this.pos = n;
      this.ended = true;
      const bus = this.bus;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.playing = false;
      if (this.ctx && bus) {
        const t = this.ctx.currentTime;
        bus.gain.setTargetAtTime(0, t + 1.2, 0.3);
        const drone = this.droneOsc;
        setTimeout(() => {
          try {
            drone?.stop();
          } catch {
            /* noop */
          }
          bus.disconnect();
        }, 2500);
      }
      this.bus = null;
      this.droneOsc = null;
    }
    this.emit();
  }

  private startDrone() {
    if (!this.ctx || !this.bus || !this.track || this.track.mode !== "temperature" || this.track.zeroDegree === null) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = degreeToFreq(this.track.zeroDegree) / 2;
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.3);
    osc.connect(g).connect(this.bus);
    osc.start();
    this.droneOsc = osc;
  }

  private note(opts: {
    freq: number;
    start: number;
    dur: number;
    peak: number;
    partials: Partial[];
    cutoff?: number;
    pan?: number;
  }) {
    if (!this.ctx || !this.bus) return;
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, opts.start);
    env.gain.linearRampToValueAtTime(opts.peak, opts.start + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.dur);
    let tail: AudioNode = env;
    if (opts.cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = opts.cutoff;
      lp.Q.value = 0.5;
      env.connect(lp);
      tail = lp;
    }
    if (this.stereo && typeof opts.pan === "number" && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.8, Math.min(0.8, opts.pan));
      tail.connect(p);
      tail = p;
    }
    tail.connect(this.bus);
    for (const part of opts.partials) {
      const osc = ctx.createOscillator();
      const pg = ctx.createGain();
      osc.type = part.type;
      osc.frequency.value = opts.freq * part.ratio;
      pg.gain.value = part.gain;
      osc.connect(pg).connect(env);
      osc.start(opts.start);
      osc.stop(opts.start + opts.dur + 0.05);
    }
  }

  private trigger(frame: Frame) {
    if (!this.ctx || !this.track) return;
    const t0 = this.ctx.currentTime + 0.03;
    const period = 1 / (FRAMES_PER_SECOND[this.track.mode] * this.speed);
    const soft: Partial[] = [
      { ratio: 1, gain: 1, type: "sine" },
      { ratio: 2, gain: 0.18, type: "triangle" },
    ];
    const pulses = frame.pulses;
    const sub = period / pulses;

    if (this.track.mode === "temperature") {
      const dir = frame.rate > 0.05 ? 1 : frame.rate < -0.05 ? -1 : 0;
      for (let k = 0; k < pulses; k++) {
        this.note({
          freq: degreeToFreq(frame.degree + dir * k),
          start: t0 + k * sub,
          dur: Math.min(1.3, Math.max(0.28, sub * 2)),
          peak: 0.34 / (1 + 0.35 * (pulses - 1)),
          partials: soft,
        });
      }
    } else if (this.track.mode === "seaice") {
      const stack = [0, 2, 4, 6];
      const root = 3;
      const cutoff = 450 + frame.norm * 3200;
      for (let k = 0; k < pulses; k++) {
        for (let v = 0; v < frame.layers; v++) {
          this.note({
            freq: degreeToFreq(root + stack[v]),
            start: t0 + k * sub,
            dur: Math.min(1.6, Math.max(0.35, sub * 2.2)),
            peak: (0.3 / Math.sqrt(frame.layers)) * (k === 0 ? 1 : 0.6),
            partials: [
              { ratio: 1, gain: 1, type: v % 2 ? "triangle" : "sine" },
              { ratio: 2, gain: 0.12, type: "sine" },
            ],
            cutoff,
          });
        }
      }
    } else {
      const warmth = frame.warmth ?? 0;
      const sat = frame.saturation ?? 0;
      const sector = Math.min(4, Math.floor(((frame.hue ?? 0) / 360) * 5));
      const cutoff = 500 + ((warmth + 1) / 2) * 3500;
      for (let k = 0; k < pulses; k++) {
        const start = t0 + k * sub;
        const dur = Math.min(1.1, Math.max(0.3, sub * 2.2));
        this.note({
          freq: degreeToFreq(frame.degree),
          start,
          dur,
          peak: 0.3 / (1 + 0.3 * (pulses - 1)),
          partials: [{ ratio: 1, gain: 1, type: sat > 0.5 ? "triangle" : "sine" }],
          cutoff,
          pan: frame.pan,
        });
        if (sat > 0.12) {
          this.note({
            freq: degreeToFreq(frame.degree + 2 + sector),
            start,
            dur,
            peak: 0.16 * Math.min(1, sat * 1.5),
            partials: [{ ratio: 1, gain: 1, type: "sine" }],
            cutoff,
            pan: frame.pan,
          });
        }
      }
    }
  }
}
