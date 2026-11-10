import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { BAND_COUNT, analyzeImage, detectImageFormat } from "@/lib/server/image-analysis";
import { POST } from "@/app/api/images/analyze/route";

async function gradient(format: "png" | "jpeg" | "webp" = "png", w = 140, h = 40): Promise<Buffer> {
  // left half black, right half warm orange
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 3;
      if (x >= w / 2) [raw[o], raw[o + 1], raw[o + 2]] = [255, 140, 30];
    }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })[format]().toBuffer();
}

describe("analyzeImage", () => {
  it("returns 28 bands of visual features labelled as non-scientific", async () => {
    const f = await analyzeImage(await gradient());
    expect(f.kind).toBe("visual-image-features");
    expect(f.notice).toMatch(/NOT scientific/);
    expect(f.bands).toHaveLength(BAND_COUNT);
    expect(f.width).toBe(140);
    const left = f.bands[2];
    const right = f.bands[25];
    expect(right.brightness).toBeGreaterThan(left.brightness + 0.3);
    expect(right.warmth).toBeGreaterThan(0.5);
    expect(right.hue).toBeGreaterThan(15);
    expect(right.hue).toBeLessThan(45);
    expect(right.saturation).toBeGreaterThan(0.7);
    expect(left.saturation).toBe(0);
  });

  it("accepts JPEG and WebP by content", async () => {
    expect((await analyzeImage(await gradient("jpeg"))).format).toBe("jpeg");
    expect((await analyzeImage(await gradient("webp"))).format).toBe("webp");
  });

  it("rejects non-images even with an image-like name", async () => {
    await expect(analyzeImage(new TextEncoder().encode("<svg onload=alert(1)></svg>"))).rejects.toMatchObject({ status: 415 });
    await expect(analyzeImage(new TextEncoder().encode("GIF89a...."))).rejects.toMatchObject({ code: "unsupported_image_type" });
  });

  it("rejects empty, oversized and truncated files", async () => {
    await expect(analyzeImage(new Uint8Array())).rejects.toMatchObject({ code: "empty_file" });
    await expect(analyzeImage(new Uint8Array(9 * 1024 * 1024))).rejects.toMatchObject({ status: 413 });
    const png = await gradient();
    await expect(analyzeImage(png.subarray(0, 40))).rejects.toMatchObject({ code: "invalid_image" });
  });

  it("rejects images with excessive dimensions", async () => {
    const wide = await sharp({ create: { width: 8100, height: 8, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(analyzeImage(wide)).rejects.toMatchObject({ code: "image_too_large" });
  });

  it("detects formats from magic bytes", async () => {
    expect(detectImageFormat(await gradient("png"))).toBe("png");
    expect(detectImageFormat(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("POST /api/images/analyze", () => {
  const post = (form: FormData) => POST(new Request("http://localhost/api/images/analyze", { method: "POST", body: form }));

  it("analyses an uploaded PNG", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(await gradient())], "x.png", { type: "image/png" }));
    const res = await post(form);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source.type).toBe("user-upload");
    expect(body.features.bands).toHaveLength(BAND_COUNT);
  });

  it("rejects a text file disguised as a PNG", async () => {
    const form = new FormData();
    form.set("file", new File(["hello"], "evil.png", { type: "image/png" }));
    const res = await post(form);
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("unsupported_image_type");
  });

  it("does not accept arbitrary URLs", async () => {
    const form = new FormData();
    form.set("url", "https://evil.example.com/a.png");
    expect((await post(form)).status).toBe(400);
    const form2 = new FormData();
    form2.set("visualizationId", "https://evil.example.com/a.png");
    expect((await post(form2)).status).toBe(404);
  });

  it("requires multipart", async () => {
    const res = await POST(new Request("http://localhost/api/images/analyze", { method: "POST", body: "x", headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(415);
  });
});
