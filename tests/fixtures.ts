/** Synthetic fixtures — used ONLY in automated tests. They mimic the layout of the real files. */
export function gistempFixture(): string {
  const header = "Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON";
  const rows: string[] = [];
  for (let y = 1880; y <= 1900; y++) {
    const months = Array.from({ length: 12 }, (_, i) => ((y - 1890) / 100 + i / 1000).toFixed(2).replace(/^(-?)0\./, "$1."));
    rows.push(`${y},${months.join(",")},-.10,***,-.12,-.11,-.09,-.08`);
  }
  // incomplete current year with missing values, as in the real file
  rows.push("1901,.01,.02,***,***,***,***,***,***,***,***,***,***,***,***,.00,***,***,***");
  rows.push(header); // the real file repeats the header every 20 years
  return ["Land-Ocean: Global Means", header, ...rows].join("\n");
}

export function nsidcFixture(month: number, region: "N" | "S" = "N"): string {
  const lines = ["year, mo,source_dataset, region, extent,   area"];
  for (let y = 1979; y <= 1990; y++) {
    if (y === 1987 && month === 12) {
      lines.push(`${y}, ${String(month).padStart(2)},         -9999,      ${region},  -9999,  -9999`);
      continue;
    }
    const extent = (15 - (y - 1979) * 0.1 - (month > 6 ? 5 : 0)).toFixed(2);
    lines.push(`${y}, ${String(month).padStart(2)},    NSIDC-0051,      ${region},  ${extent},  ${(Number(extent) - 3).toFixed(2)}`);
  }
  return lines.join("\n");
}

export function textResponse(body: string): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/csv" } });
}
