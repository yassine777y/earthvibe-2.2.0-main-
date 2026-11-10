import { describe, expect, it } from "vitest";
import { ParseError, parseGistempCsv, parseNsidcMonthlyCsv } from "@/lib/server/parsers";
import { gistempFixture, nsidcFixture } from "./fixtures";

describe("parseGistempCsv", () => {
  const recs = parseGistempCsv(gistempFixture());

  it("skips the title line, repeated headers and missing (***) values", () => {
    expect(recs[0].date).toBe("1880-01-01");
    expect(recs.every((r) => Number.isFinite(r.value))).toBe(true);
    // 21 full years * 12 + 2 valid months of 1901
    expect(recs).toHaveLength(21 * 12 + 2);
    expect(recs.find((r) => r.date === "1901-03-01")).toBeUndefined();
  });

  it("parses negative values written like -.19", () => {
    const r = parseGistempCsv(gistempFixture().replace("1880,", "1880,-.19,").replace(/^(1880,-\.19,)[^,]*,/m, "$1"));
    expect(r[0].value).toBeCloseTo(-0.19, 2);
  });

  it("returns records sorted by date", () => {
    const sorted = [...recs].sort((a, b) => a.date.localeCompare(b.date));
    expect(recs).toEqual(sorted);
  });

  it("throws a ParseError on an unexpected file", () => {
    expect(() => parseGistempCsv("<html>not found</html>")).toThrow(ParseError);
  });
});

describe("parseNsidcMonthlyCsv", () => {
  it("parses padded columns and drops -9999 months", () => {
    const recs = parseNsidcMonthlyCsv(nsidcFixture(12));
    expect(recs.find((r) => r.date === "1987-12-01")).toBeUndefined();
    expect(recs[0]).toEqual({ date: "1979-12-01", value: expect.any(Number) });
    expect(recs).toHaveLength(11);
  });

  it("reads extent (million km²), not area", () => {
    const recs = parseNsidcMonthlyCsv(nsidcFixture(3));
    expect(recs[0].value).toBeCloseTo(15, 2);
  });

  it("throws when the header is missing", () => {
    expect(() => parseNsidcMonthlyCsv("1,2,3")).toThrow(ParseError);
  });
});
