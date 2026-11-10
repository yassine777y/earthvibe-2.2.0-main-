/**
 * Provenance-aware cache for normalized upstream data.
 *
 *  - fresh entry (younger than ttl)  -> served as "cached"
 *  - otherwise we try upstream       -> served as "live" (just retrieved) and stored
 *  - upstream fails, old entry exists -> served as "stale" with a warning
 *  - upstream fails, nothing cached   -> SourceUnavailableError (never invented data)
 *
 * Storage is PostgreSQL via Drizzle; if the DB is unreachable we degrade to process memory.
 */

export type CacheEntry = { body: string; upstreamUrl: string; retrievedAt: Date };

export interface CacheStore {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
}

export type CacheStatus = "live" | "cached" | "stale";

export type Cached<T> = {
  data: T;
  retrievedAt: string;
  status: CacheStatus;
  ageSeconds: number;
  warnings: string[];
};

export class SourceUnavailableError extends Error {
  constructor(
    message: string,
    public readonly sourceUrl: string,
    public readonly cause2?: unknown,
  ) {
    super(message);
    this.name = "SourceUnavailableError";
  }
}

const memory = new Map<string, CacheEntry>();

export const memoryStore: CacheStore = {
  async get(key) {
    return memory.get(key) ?? null;
  },
  async set(key, entry) {
    memory.set(key, entry);
  },
};

export function createMemoryStore(): CacheStore {
  const m = new Map<string, CacheEntry>();
  return {
    async get(key) {
      return m.get(key) ?? null;
    },
    async set(key, entry) {
      m.set(key, entry);
    },
  };
}

/** DB-backed store that falls back to memory when PostgreSQL is not reachable. */
export const defaultStore: CacheStore = {
  async get(key) {
    try {
      const [{ db }, { sourceCache }, { eq }] = await Promise.all([
        import("@/db"),
        import("@/db/schema"),
        import("drizzle-orm"),
      ]);
      const rows = await db.select().from(sourceCache).where(eq(sourceCache.key, key)).limit(1);
      if (rows[0]) {
        return { body: rows[0].body, upstreamUrl: rows[0].upstreamUrl, retrievedAt: rows[0].retrievedAt };
      }
    } catch {
      /* fall through to memory */
    }
    return memoryStore.get(key);
  },
  async set(key, entry) {
    await memoryStore.set(key, entry);
    try {
      const [{ db }, { sourceCache }] = await Promise.all([import("@/db"), import("@/db/schema")]);
      await db
        .insert(sourceCache)
        .values({ key, body: entry.body, upstreamUrl: entry.upstreamUrl, retrievedAt: entry.retrievedAt })
        .onConflictDoUpdate({
          target: sourceCache.key,
          set: { body: entry.body, upstreamUrl: entry.upstreamUrl, retrievedAt: entry.retrievedAt },
        });
    } catch {
      /* memory copy is still available */
    }
  },
};

export type GetCachedOptions<T> = {
  key: string;
  ttlMs: number;
  upstreamUrl: string;
  /** Fetches and *validates/parses* upstream data. Must throw if the data is not valid. */
  produce: () => Promise<T>;
  store?: CacheStore;
  now?: () => Date;
  /** Bypass a fresh cache entry (used by the "retry" action). */
  force?: boolean;
};

export async function getCached<T>(opts: GetCachedOptions<T>): Promise<Cached<T>> {
  const store = opts.store ?? defaultStore;
  const now = opts.now ?? (() => new Date());
  const entry = await store.get(opts.key);
  const ageOf = (e: CacheEntry) => Math.max(0, Math.round((now().getTime() - e.retrievedAt.getTime()) / 1000));

  if (entry && !opts.force && now().getTime() - entry.retrievedAt.getTime() < opts.ttlMs) {
    return {
      data: JSON.parse(entry.body) as T,
      retrievedAt: entry.retrievedAt.toISOString(),
      status: "cached",
      ageSeconds: ageOf(entry),
      warnings: [],
    };
  }

  try {
    const data = await opts.produce();
    const fresh: CacheEntry = { body: JSON.stringify(data), upstreamUrl: opts.upstreamUrl, retrievedAt: now() };
    await store.set(opts.key, fresh);
    return { data, retrievedAt: fresh.retrievedAt.toISOString(), status: "live", ageSeconds: 0, warnings: [] };
  } catch (err) {
    if (entry) {
      return {
        data: JSON.parse(entry.body) as T,
        retrievedAt: entry.retrievedAt.toISOString(),
        status: "stale",
        ageSeconds: ageOf(entry),
        warnings: ["upstream_unreachable_serving_stale_cache"],
      };
    }
    throw new SourceUnavailableError(
      `The upstream source could not be reached and no cached copy exists.`,
      opts.upstreamUrl,
      err,
    );
  }
}

/** Only these hosts may ever be contacted by the backend. */
export const ALLOWED_HOSTS = new Set([
  "data.giss.nasa.gov",
  "noaadata.apps.nsidc.org",
  "gibs.earthdata.nasa.gov",
]);

export type FetchLike = typeof fetch;

export async function fetchAllowed(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number; fetchImpl?: FetchLike; accept?: string } = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname)) {
    throw new Error(`Host not allowed: ${u.hostname}`);
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(url, {
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    redirect: "error",
    headers: { "User-Agent": "EarthJukebox/1.0 (student project; not an official NASA product)", Accept: opts.accept ?? "*/*" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstream responded ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > (opts.maxBytes ?? 8_000_000)) throw new Error("Upstream response too large");
  return { bytes: buf, contentType: res.headers.get("content-type") ?? "" };
}

export async function fetchTextAllowed(url: string, opts: Parameters<typeof fetchAllowed>[1] = {}): Promise<string> {
  const { bytes } = await fetchAllowed(url, { ...opts, maxBytes: opts?.maxBytes ?? 3_000_000 });
  return new TextDecoder("utf-8").decode(bytes);
}
