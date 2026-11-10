/**
 * Parsers for the real upstream file formats. Pure functions (no I/O) so they can be tested
 * with small fixtures that mimic the genuine file layout.
 */

export type DataRecord = { date: string; value: number };

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * NASA GISS GISTEMP v4 "Land-Ocean: Global Means" CSV (GLB.Ts+dSST.csv).
 * Layout: a title line, then a header `Year,Jan,...,Dec,J-D,D-N,DJF,...`, then one row per year.
 * Missing values are written as `***`. Values are temperature anomalies in °C relative to 1951-1980.
 */
export function parseGistempCsv(text: string): DataRecord[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => /^Year\s*,\s*Jan\s*,/i.test(l));
  if (headerIdx < 0) throw new ParseError("GISTEMP header row (Year,Jan,...) not found");
  const header = lines[headerIdx].split(",").map((h) => h.trim());
  const monthCols = MONTHS.map((m) => header.indexOf(m));
  if (monthCols.some((c) => c < 0)) throw new ParseError("GISTEMP header is missing month columns");

  const records: DataRecord[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = line.split(",").map((c) => c.trim());
    const year = Number(cells[0]);
    if (!Number.isInteger(year) || year < 1800 || year > 2200) continue; // repeated header/footnote rows
    MONTHS.forEach((_, i) => {
      const raw = cells[monthCols[i]];
      if (raw === undefined || raw === "" || raw.includes("*")) return; // missing value
      const v = Number(raw);
      if (!Number.isFinite(v) || Math.abs(v) > 20) return; // not a plausible anomaly
      records.push({ date: `${year}-${pad(i + 1)}-01`, value: v });
    });
  }
  if (records.length < 100) throw new ParseError("GISTEMP file contained too few valid values");
  records.sort((a, b) => a.date.localeCompare(b.date));
  return records;
}

/**
 * NSIDC Sea Ice Index (G02135) monthly extent file, e.g. N_03_extent_v4.0.csv.
 * Header: `year, mo,source_dataset, region, extent,   area` (values padded with spaces).
 * Missing months are written as -9999. extent is in million square kilometres.
 */
export function parseNsidcMonthlyCsv(text: string): DataRecord[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex((l) => /^year\s*,\s*mo/i.test(l));
  if (headerIdx < 0) throw new ParseError("NSIDC header row (year, mo, ...) not found");
  const header = lines[headerIdx].split(",").map((h) => h.trim().toLowerCase());
  const iYear = header.indexOf("year");
  const iMonth = header.indexOf("mo");
  const iExtent = header.indexOf("extent");
  if (iYear < 0 || iMonth < 0 || iExtent < 0) throw new ParseError("NSIDC header is missing year/mo/extent");

  const records: DataRecord[] = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cells = line.split(",").map((c) => c.trim());
    const year = Number(cells[iYear]);
    const month = Number(cells[iMonth]);
    const extent = Number(cells[iExtent]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue;
    if (!Number.isFinite(extent) || extent < 0 || extent <= -9000) continue; // -9999 = missing
    if (extent > 40) continue;
    records.push({ date: `${year}-${pad(month)}-01`, value: extent });
  }
  if (records.length === 0) throw new ParseError("NSIDC file contained no valid values");
  return records;
}
