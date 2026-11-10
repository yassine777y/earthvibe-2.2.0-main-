import { ApiError } from "./datasets";
import { SourceUnavailableError } from "./cache";

/** CORS is same-origin by default. Extra origins must be listed explicitly in CORS_ALLOWED_ORIGINS. */
export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = req.headers.get("origin");
  if (origin && allowed.includes(origin)) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
  }
  return {};
}

export function json(req: Request, body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(corsHeaders(req))) headers.set(k, v);
  headers.set("X-Content-Type-Options", "nosniff");
  return Response.json(body, { ...init, headers });
}

export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof ApiError) {
    return json(req, { error: { code: err.code, message: err.message, details: err.details ?? null } }, { status: err.status });
  }
  if (err instanceof SourceUnavailableError) {
    return json(
      req,
      {
        error: {
          code: "source_unavailable",
          message: err.message,
          details: { sourceUrl: err.sourceUrl, retry: true },
        },
      },
      { status: 503 },
    );
  }
  console.error("Unexpected API error", err);
  return json(req, { error: { code: "internal_error", message: "Unexpected server error.", details: null } }, { status: 500 });
}
