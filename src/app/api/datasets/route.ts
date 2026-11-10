import { DATASETS } from "@/lib/server/datasets";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return json(req, {
    datasets: DATASETS,
    note: "Historical/periodically-updated records. None of these responses is a live feed.",
  });
}
