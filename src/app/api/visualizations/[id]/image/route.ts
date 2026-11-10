import { errorResponse } from "@/lib/server/http";
import { loadVisualizationImage } from "@/lib/server/viz-image";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const img = await loadVisualizationImage(id);
    return new Response(Buffer.from(img.data.b64, "base64"), {
      headers: {
        "Content-Type": img.data.contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "X-EarthJukebox-Cache": img.status,
        "X-EarthJukebox-Retrieved-At": img.retrievedAt,
      },
    });
  } catch (err) {
    return errorResponse(req, err);
  }
}
