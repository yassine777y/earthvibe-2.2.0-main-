import { listVisualizations } from "@/lib/server/visualizations";
import { json } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return json(req, { visualizations: listVisualizations() });
}
