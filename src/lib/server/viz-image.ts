import { getCached, fetchAllowed, type Cached } from "./cache";
import { getVisualizationImageUrl } from "./visualizations";
import { ApiError } from "./datasets";

type Stored = { b64: string; contentType: string };

/** Fetches (and caches) the pre-configured GIBS image of a catalogue entry. Never accepts a URL. */
export async function loadVisualizationImage(id: string): Promise<Cached<Stored>> {
  const url = getVisualizationImageUrl(id);
  if (!url) throw new ApiError(404, "visualization_not_found", "No embeddable image exists for this visualization id.");
  return getCached<Stored>({
    key: `gibs-image-${id}`,
    ttlMs: 24 * 60 * 60 * 1000,
    upstreamUrl: url,
    produce: async () => {
      const { bytes, contentType } = await fetchAllowed(url, { maxBytes: 4_000_000, accept: "image/jpeg" });
      if (!contentType.startsWith("image/jpeg")) throw new Error("Unexpected content type from GIBS");
      return { b64: Buffer.from(bytes).toString("base64"), contentType: "image/jpeg" };
    },
  });
}
