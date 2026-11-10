import { ApiError } from "@/lib/server/datasets";
import { errorResponse, json } from "@/lib/server/http";
import { MAX_UPLOAD_BYTES, analyzeImage } from "@/lib/server/image-analysis";
import { getVisualization } from "@/lib/server/visualizations";
import { loadVisualizationImage } from "@/lib/server/viz-image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Accepts EITHER a multipart `file` upload OR a `visualizationId` from the curated catalogue.
 * Arbitrary URLs are never accepted or fetched. The image is processed in memory and discarded.
 */
export async function POST(req: Request) {
  try {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      throw new ApiError(413, "file_too_large", `Images must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`);
    }
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().startsWith("multipart/form-data")) {
      throw new ApiError(415, "expected_multipart", "Send multipart/form-data with a 'file' field or a 'visualizationId' field.");
    }
    const form = await req.formData();
    const file = form.get("file");
    const vizId = form.get("visualizationId");

    if (file instanceof File) {
      if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "file_too_large", `Images must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`);
      const features = await analyzeImage(new Uint8Array(await file.arrayBuffer()));
      return json(req, { source: { type: "user-upload" }, features });
    }
    if (typeof vizId === "string" && vizId) {
      const viz = getVisualization(vizId);
      if (!viz || !viz.hasImage) throw new ApiError(404, "visualization_not_found", "Unknown or non-embeddable visualization id.");
      const img = await loadVisualizationImage(vizId);
      const features = await analyzeImage(Buffer.from(img.data.b64, "base64"));
      return json(req, { source: { type: "catalog", visualization: viz, cache: img.status, retrievedAt: img.retrievedAt }, features });
    }
    throw new ApiError(400, "missing_input", "Provide a 'file' upload or a 'visualizationId'.");
  } catch (err) {
    return errorResponse(req, err);
  }
}
