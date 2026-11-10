import sharp from "sharp";
import { ApiError } from "./datasets";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_DIMENSION = 8000; // px per side
export const MAX_PIXELS = 40_000_000;
export const BAND_COUNT = 28;

export type ImageFormat = "png" | "jpeg" | "webp";

export type Band = {
  index: number;
  /** 0..1 mean luminance of the band */
  brightness: number;
  /** 0..360 saturation-weighted circular mean hue */
  hue: number;
  /** 0..1 mean HSV saturation */
  saturation: number;
  /** -1..1 mean (red - blue); positive = warmer colours */
  warmth: number;
  /** 0..1 spread of luminance inside the band (texture) */
  contrast: number;
};

export type ImageFeatures = {
  kind: "visual-image-features";
  notice: string;
  format: ImageFormat;
  width: number;
  height: number;
  bandCount: number;
  bands: Band[];
  summary: { brightness: number; saturation: number; warmth: number; contrast: number };
};

const NOTICE =
  "These are visual features computed from the picture's pixels (brightness, hue, saturation, warmth, contrast). They are NOT scientific measurements.";

/** Validate the real file content (magic bytes), not the filename or declared MIME type. */
export function detectImageFormat(b: Uint8Array): ImageFormat | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";
  return null;
}

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export async function analyzeImage(bytes: Uint8Array): Promise<ImageFeatures> {
  if (bytes.byteLength === 0) throw new ApiError(400, "empty_file", "The uploaded file is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, "file_too_large", `Images must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`, { maxBytes: MAX_UPLOAD_BYTES });
  }
  const format = detectImageFormat(bytes);
  if (!format) {
    throw new ApiError(415, "unsupported_image_type", "Only PNG, JPEG and WebP images are accepted (the file content was not recognised).", { allowed: ["png", "jpeg", "webp"] });
  }

  try {
    const input = Buffer.from(bytes);
    const meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) throw new ApiError(400, "invalid_image", "The image could not be decoded.");
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      throw new ApiError(413, "image_too_large", `Image dimensions must not exceed ${MAX_DIMENSION}×${MAX_DIMENSION} pixels.`, { maxDimension: MAX_DIMENSION });
    }

    const colW = 8;
    const W = BAND_COUNT * colW;
    const H = 96;
    const { data } = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: "error" })
      .flatten({ background: "#000000" })
      .toColourspace("srgb")
      .resize(W, H, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const bands: Band[] = [];
    for (let bi = 0; bi < BAND_COUNT; bi++) {
      let n = 0, sumL = 0, sumL2 = 0, sumS = 0, sumW = 0, sx = 0, sy = 0;
      for (let y = 0; y < H; y++) {
        for (let x = bi * colW; x < (bi + 1) * colW; x++) {
          const o = (y * W + x) * 3;
          const r = data[o] / 255, g = data[o + 1] / 255, b = data[o + 2] / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
          const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const s = max === 0 ? 0 : d / max;
          let h = 0;
          if (d > 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
          }
          const wgt = s * max;
          sx += Math.cos((h * Math.PI) / 180) * wgt;
          sy += Math.sin((h * Math.PI) / 180) * wgt;
          sumL += L; sumL2 += L * L; sumS += s; sumW += r - b; n++;
        }
      }
      const meanL = sumL / n;
      let hue = (Math.atan2(sy, sx) * 180) / Math.PI;
      if (hue < 0) hue += 360;
      if (Math.abs(sx) + Math.abs(sy) < 1e-6) hue = 0;
      bands.push({
        index: bi,
        brightness: round(meanL),
        hue: round(hue, 1),
        saturation: round(sumS / n),
        warmth: round(sumW / n),
        contrast: round(Math.min(1, Math.sqrt(Math.max(0, sumL2 / n - meanL * meanL)) * 2)),
      });
    }
    const avg = (k: keyof Omit<Band, "index" | "hue">) => round(bands.reduce((a, b) => a + b[k], 0) / bands.length);
    return {
      kind: "visual-image-features",
      notice: NOTICE,
      format,
      width,
      height,
      bandCount: BAND_COUNT,
      bands,
      summary: { brightness: avg("brightness"), saturation: avg("saturation"), warmth: avg("warmth"), contrast: avg("contrast") },
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, "invalid_image", "The file looks like an image but could not be decoded safely.");
  }
}
