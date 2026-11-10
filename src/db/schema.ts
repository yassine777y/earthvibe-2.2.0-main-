import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Cache of *normalized, validated* responses derived from real upstream sources.
 * Every row keeps its retrieval time and the upstream URL(s) for provenance.
 */
export const sourceCache = pgTable("source_cache", {
  key: text("key").primaryKey(),
  body: text("body").notNull(),
  upstreamUrl: text("upstream_url").notNull(),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
});
