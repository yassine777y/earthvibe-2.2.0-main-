import { ApiError, buildSeries, getDatasetMeta, parseSeriesQuery, type DatasetId } from "@/lib/server/datasets";
import { errorResponse, json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const meta = getDatasetMeta(id);
    if (!meta) throw new ApiError(404, "dataset_not_found", `Unknown dataset '${id}'.`, { available: ["temperature", "seaice", "ocean"] });
    const url = new URL(req.url);
    const query = parseSeriesQuery(id as DatasetId, url.searchParams);
    const series = await buildSeries(id as DatasetId, query, { force: url.searchParams.get("refresh") === "1" });
    return json(req, series, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    return errorResponse(req, err);
  }
}
