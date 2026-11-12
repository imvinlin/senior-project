"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { CohortBar } from "@/components/CohortBar";
import { CohortShell, loading } from "@/components/CohortShell";
import { FilterFacetGroup } from "@/components/FilterSidebar";
import { useApi } from "@/lib/useApi";
import { useCohort } from "@/lib/useCohort";

const FACETS = ["species", "system", "cancer", "subtype", "tissue", "sex", "assay", "clade"] as const;
type Facet = (typeof FACETS)[number];
type Filters = Record<Facet, string[]>;
type CohortCounts = { cohort1_n: number; cohort2_n: number; identical: boolean; overlap: number };
type Result = {
  cohort1_n: number;
  cohort2_n: number;
  genes: { gene: string; mean_reference: number | null; mean_comparison: number | null; mean_difference: number | null; statistic: number | null; pval: number | null; padj: number | null }[];
  heatmap_genes: string[];
  heatmap_samples: string[];
  heatmap_values: (number | null)[][];
  heatmap_groups: string[];
  all_heatmap_samples: string[];
  all_heatmap_values: (number | null)[][];
  all_heatmap_groups: string[];
  pca: ({ run_accession: string; cohort: string; pc1: number; pc2: number } & Record<string, string | number>)[];
  pca_variance: number[];
};
const CONTROL = "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-accent";

function emptyFilters(): Filters {
  return { species: [], system: [], cancer: [], subtype: [], tissue: [], sex: [], assay: [], clade: [] };
}

function signature(filters: Filters) {
  return JSON.stringify(FACETS.map((facet) => [facet, [...filters[facet]].sort()]));
}

function CohortFilters({
  label, value, options, onChange, collapsed, onToggleCollapsed,
}: { label: "Reference" | "Comparison"; value: Filters; options: Record<string, Record<string, number>>; onChange: (next: Filters) => void; collapsed: boolean; onToggleCollapsed: () => void }) {
  return (
    <section className="min-w-0 rounded border border-zinc-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-zinc-800">{label}</h3>
        <button type="button" aria-expanded={!collapsed} onClick={onToggleCollapsed} className="rounded px-1 text-xs text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent">
          {collapsed ? "Expand filters" : "Collapse filters"}
        </button>
      </div>
      {!collapsed && <>
        <p className="mt-1 text-xs text-zinc-500">Values within a field use OR; different fields use AND.</p>
        <div className="mt-2">
          {FACETS.map((facet) => (
            <FilterFacetGroup
              key={facet}
              name={facet}
              counts={options[facet] ?? {}}
              picked={value[facet]}
              onToggle={(option) => {
                const selected = value[facet].includes(option)
                  ? value[facet].filter((current) => current !== option)
                  : [...value[facet], option];
                onChange({ ...value, [facet]: selected });
              }}
            />
          ))}
        </div>
      </>}
      <CohortBar
        chips={FACETS.flatMap((facet) => value[facet].map((selected) => [facet, selected] as [string, string]))}
        removeFilter={(facet, selected) => {
          const key = facet as Facet;
          onChange({ ...value, [key]: value[key].filter((current) => current !== selected) });
        }}
        clearFilters={() => onChange(emptyFilters())}
      />
    </section>
  );
}

const PCA_COLORS = [
  { dot: "fill-series-1", swatch: "bg-series-1" },
  { dot: "fill-series-2", swatch: "bg-series-2" },
  { dot: "fill-series-3", swatch: "bg-series-3" },
];
const PCA_HEX = ["#2a78d6", "#eb6834", "#1baf7a"];

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pcaSvg(result: Result, colorBy: string) {
  const width = 1080; const height = 520;
  const left = 58; const right = 300; const top = 20; const bottom = 48;
  const points = result.pca;
  const xs = points.map((point) => point.pc1); const ys = points.map((point) => point.pc2);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const sx = (value: number) => left + ((value - minX) / (maxX - minX || 1)) * (width - left - right);
  const sy = (value: number) => height - bottom - ((value - minY) / (maxY - minY || 1)) * (height - top - bottom);
  const counts = new Map<string, number>();
  for (const point of points) {
    const label = String(point[colorBy] ?? "Unknown");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const leading = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([label]) => label);
  const fill = (point: Result["pca"][number]) => {
    const index = leading.indexOf(String(point[colorBy] ?? "Unknown"));
    return index < 0 ? "#a1a1aa" : PCA_HEX[index] ?? "#a1a1aa";
  };
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="white"/>`,
    `<text x="${(left + width - right) / 2}" y="${height - 12}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#52525b">PC1 (${((result.pca_variance[0] ?? 0) * 100).toFixed(1)}% variance)</text>`,
    `<text x="14" y="${(top + height - bottom) / 2}" transform="rotate(-90 14 ${(top + height - bottom) / 2})" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#52525b">PC2 (${((result.pca_variance[1] ?? 0) * 100).toFixed(1)}% variance)</text>`,
  ];
  for (const point of points) {
    lines.push(`<circle cx="${sx(point.pc1)}" cy="${sy(point.pc2)}" r="3.5" fill="${fill(point)}" fill-opacity="0.7" stroke="white" stroke-width="0.6"><title>${escapeXml(`${point.cohort}: ${point.run_accession} · ${String(point[colorBy] ?? "Unknown")}`)}</title></circle>`);
  }
  const other = [...counts].filter(([label]) => !leading.includes(label));
  let legendY = 32;
  lines.push(`<text x="800" y="${legendY}" font-family="sans-serif" font-weight="600" font-size="14" fill="#3f3f46">Samples per ${escapeXml(colorBy === "cohort" ? "group" : colorBy)}</text>`);
  legendY += 24;
  leading.forEach((label, index) => {
    lines.push(`<circle cx="808" cy="${legendY - 4}" r="5" fill="${PCA_HEX[index] ?? "#a1a1aa"}"/>`);
    lines.push(`<text x="820" y="${legendY}" font-family="sans-serif" font-size="12" fill="#3f3f46">${escapeXml(label)} (${counts.get(label)})</text>`);
    legendY += 20;
  });
  const otherN = other.reduce((sum, [, count]) => sum + count, 0);
  if (otherN) {
    lines.push(`<circle cx="808" cy="${legendY - 4}" r="5" fill="#a1a1aa"/>`);
    lines.push(`<text x="820" y="${legendY}" font-family="sans-serif" font-size="12" fill="#3f3f46">Other (${other.length} values, ${otherN} samples)</text>`);
  }
  lines.push("</svg>");
  return lines.join("");
}

function heatmapSvg(result: Result) {
  const cellWidth = 16; const cellHeight = 18; const labelWidth = 170; const headerHeight = 170;
  const width = labelWidth + result.heatmap_samples.length * cellWidth + 20;
  const height = headerHeight + result.heatmap_genes.length * cellHeight + 20;
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="white"/>`,
    `<text x="12" y="24" font-family="sans-serif" font-size="12" fill="#3f3f46">Gene</text>`,
  ];
  result.heatmap_samples.forEach((sample, column) => {
    const x = labelWidth + column * cellWidth + cellWidth / 2;
    const y = headerHeight - 8;
    const label = `${sample} · ${result.heatmap_groups[column]}`;
    lines.push(`<text x="${x}" y="${y}" transform="rotate(-90 ${x} ${y})" text-anchor="start" font-family="monospace" font-size="9" fill="#52525b">${escapeXml(label)}</text>`);
  });
  result.heatmap_genes.forEach((gene, row) => {
    const y = headerHeight + row * cellHeight;
    lines.push(`<text x="12" y="${y + 12}" font-family="monospace" font-size="10" fill="#3f3f46">${escapeXml(gene)}</text>`);
    (result.heatmap_values[row] ?? []).forEach((value, column) => {
      const x = labelWidth + column * cellWidth;
      const color = value == null
        ? "#f4f4f5"
        : `hsl(${value < 0 ? 217 : 0} 78% ${96 - Math.min(1, Math.abs(value) / 2.5) * 50}%)`;
      lines.push(`<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="${color}"><title>${escapeXml(`${gene} · ${result.heatmap_samples[column]} · ${result.heatmap_groups[column]} · ${value ?? "missing"}`)}</title></rect>`);
    });
  });
  lines.push("</svg>");
  return lines.join("");
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts: Uint8Array[]) {
  const output = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function createZip(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name); const data = encoder.encode(file.content); const checksum = crc32(data);
    const local = new Uint8Array(30); const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, checksum, true); localView.setUint32(18, data.length, true); localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    localParts.push(local, name, data);

    const central = new Uint8Array(46); const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true); centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true); centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true); centralView.setUint32(42, localOffset, true);
    centralParts.push(central, name);
    localOffset += local.length + name.length + data.length;
  }
  const centralDirectory = concatenate(centralParts);
  const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDirectory.length, true); endView.setUint32(16, localOffset, true);
  return new Blob([concatenate([...localParts, centralDirectory, end])], { type: "application/zip" });
}

function ResultPca({ result, colorBy, setColorBy }: { result: Result; colorBy: string; setColorBy: (field: string) => void }) {
  const points = result.pca;
  const variance = result.pca_variance;
  if (!points.length) return <p className="mt-2 text-sm text-zinc-500">No selected samples have coordinates in the PCA tab.</p>;
  const width = 760; const height = 520;
  const left = 58; const right = 16; const top = 20; const bottom = 48;
  const xs = points.map((point) => point.pc1); const ys = points.map((point) => point.pc2);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const sx = (value: number) => left + ((value - minX) / (maxX - minX || 1)) * (width - left - right);
  const sy = (value: number) => height - bottom - ((value - minY) / (maxY - minY || 1)) * (height - top - bottom);
  const counts = new Map<string, number>();
  for (const point of points) {
    const value = String(point[colorBy] ?? "Unknown");
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const leading = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([value]) => value);
  const styleFor = (point: Result["pca"][number]) => {
    const index = leading.indexOf(String(point[colorBy] ?? "Unknown"));
    return index < 0 ? { dot: "fill-zinc-400", swatch: "bg-zinc-400" } : (PCA_COLORS[index] ?? { dot: "fill-zinc-400", swatch: "bg-zinc-400" });
  };
  const centroid = (value: string) => {
    const members = points.filter((point) => String(point[colorBy] ?? "Unknown") === value);
    return {
      x: sx(members.reduce((total, point) => total + point.pc1, 0) / members.length),
      y: sy(members.reduce((total, point) => total + point.pc2, 0) / members.length),
    };
  };
  const otherN = [...counts].filter(([value]) => !leading.includes(value)).reduce((total, [, n]) => total + n, 0);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-700">
        <span>Colour by</span>
        <select className={`${CONTROL} capitalize`} value={colorBy} onChange={(event) => setColorBy(event.target.value)}>
          {["cohort", ...FACETS, "study"].map((field) => <option key={field} value={field}>{field === "cohort" ? "Group (Reference / Comparison)" : field.replaceAll("_", " ")}</option>)}
        </select>
        <span className="text-zinc-500">Fitted on {points.length.toLocaleString()} selected samples</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <svg width={width} height={height} className="h-auto w-full max-w-[760px] rounded border border-zinc-200" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="PCA refit on the selected samples">
          <text x={(left + width - right) / 2} y={height - 12} textAnchor="middle" className="fill-zinc-600 text-xs">PC1 ({((variance[0] ?? 0) * 100).toFixed(1)}% variance)</text>
          <text x={14} y={(top + height - bottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(top + height - bottom) / 2})`} className="fill-zinc-600 text-xs">PC2 ({((variance[1] ?? 0) * 100).toFixed(1)}% variance)</text>
          {points.map((point) => <circle key={point.run_accession} cx={sx(point.pc1)} cy={sy(point.pc2)} r="3.5" fillOpacity="0.7" strokeWidth="0.6" className={`${styleFor(point).dot} stroke-white`}><title>{point.cohort}: {point.run_accession} · {String(point[colorBy] ?? "Unknown")}</title></circle>)}
          {leading.map((value) => {
            const center = centroid(value);
            return <text key={value} x={center.x + 8} y={center.y - 8} className="fill-zinc-900 text-xs" style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}>{value}</text>;
          })}
        </svg>
        <div className="w-72 text-sm">
          <h4 className="font-medium text-zinc-700">Samples per {colorBy === "cohort" ? "group" : colorBy.replaceAll("_", " ")}</h4>
          <ul className="mt-2">
            {leading.map((value, index) => <li key={value} className="flex items-center gap-2 py-0.5"><span className={`h-2.5 w-2.5 rounded-full ${PCA_COLORS[index]?.swatch ?? "bg-zinc-400"}`} /><span>{value}</span><span className="ml-auto font-mono text-zinc-500">{counts.get(value)?.toLocaleString()}</span></li>)}
            {otherN > 0 && <li className="flex items-center gap-2 py-0.5"><span className="h-2.5 w-2.5 rounded-full bg-zinc-400" /><span>Other ({counts.size - leading.length} values)</span><span className="ml-auto font-mono text-zinc-500">{otherN.toLocaleString()}</span></li>}
          </ul>
          <p className="mt-4 text-zinc-600">The PCA was refit on the selected samples. Its axes and variance describe this comparison only.</p>
        </div>
      </div>
    </div>
  );
}

function Heatmap({ result }: { result: Result }) {
  if (!result.heatmap_genes.length) {
    return <p className="mt-2 text-sm text-zinc-500">No genes meet the adjusted p-value cutoff of 0.05.</p>;
  }
  return (
    <div className="mt-3 max-w-full overflow-auto rounded border border-zinc-200">
      <table className="border-collapse text-[10px]">
        <thead className="sticky top-0 bg-white">
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left">Gene</th>
            {result.heatmap_samples.map((sample, i) => (
              <th
                key={sample}
                className="h-36 min-w-6 px-1 py-2 text-left align-bottom font-normal text-zinc-600"
                title={`${sample} · ${result.heatmap_groups[i]}`}
              >
                <span className="inline-block whitespace-nowrap text-[10px]" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                  {sample} · {result.heatmap_groups[i]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.heatmap_genes.map((gene, row) => (
            <tr key={gene}>
              <th className="sticky left-0 bg-white px-2 py-0.5 text-left font-mono font-normal">
                <a
                  href={`https://www.ncbi.nlm.nih.gov/datasets/gene/taxon/1/?search=${encodeURIComponent(gene)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Search NCBI Gene for ${gene}`}
                  className="text-accent underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {gene}
                </a>
              </th>
              {(result.heatmap_values[row] ?? []).map((value, col) => (
                <td
                  key={result.heatmap_samples[col]}
                  className="h-3 min-w-5 p-0"
                  title={`${gene} · ${result.heatmap_samples[col]} · ${value?.toFixed(2) ?? "missing"}`}
                  style={{
                    backgroundColor: value == null
                      ? "#f4f4f5"
                      : `hsl(${value < 0 ? 217 : 0} 78% ${96 - Math.min(1, Math.abs(value) / 2.5) * 50}%)`,
                  }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GeneResults({ genes }: { genes: Result["genes"] }) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => genes.filter((row) => row.gene.toLowerCase().includes(search.trim().toLowerCase())), [genes, search]);
  const columns: (keyof Result["genes"][number])[] = ["gene", "mean_reference", "mean_comparison", "mean_difference", "statistic", "pval", "padj"];
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2">Search genes <input className={CONTROL} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Gene name" /></label>
        <span className="text-zinc-500">{visible.length.toLocaleString()} of {genes.length.toLocaleString()} significant genes (adjusted p-value ≤ 0.05)</span>
      </div>
      <div className="mt-2 max-h-[32rem] overflow-auto rounded border border-zinc-200">
        <table className="w-full border-collapse text-left text-xs"><thead className="sticky top-0 bg-zinc-50"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 font-medium text-zinc-600">{column.replaceAll("_", " ")}</th>)}</tr></thead>
          <tbody>{visible.map((row) => <tr key={row.gene} className="border-t border-zinc-100">{columns.map((column) => <td key={column} className="whitespace-nowrap px-3 py-1.5 font-mono">{typeof row[column] === "number" ? row[column]!.toExponential(3) : row[column] ?? "—"}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </>
  );
}

function DifferentialExpression() {
  const state = useCohort();
  const [cohort1, setCohort1] = useState<Filters>(emptyFilters());
  const [cohort2, setCohort2] = useState<Filters>(emptyFilters());
  const [counts, setCounts] = useState<CohortCounts | null>(null);
  const [countsKey, setCountsKey] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [resultKey, setResultKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [referenceExpanded, setReferenceExpanded] = useState(true);
  const [comparisonExpanded, setComparisonExpanded] = useState(true);
  const [pcaColorBy, setPcaColorBy] = useState("cohort");
  const resultsRef = useRef<HTMLDivElement>(null);
  const options = useApi<Record<string, Record<string, number>>>("/api/differential-expression/options");
  const sameFilters = signature(cohort1) === signature(cohort2);
  const requestBody = useMemo(() => JSON.stringify({ cohort1, cohort2 }), [cohort1, cohort2]);
  const activeCounts = countsKey === requestBody ? counts : null;
  const activeResult = resultKey === requestBody ? result : null;

  useEffect(() => {
    if (activeResult) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [activeResult]);

  useEffect(() => {
    let stale = false;
    fetch("/api/differential-expression/cohorts", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null) as { detail?: unknown } | null;
          const detail = body?.detail;
          throw new Error(typeof detail === "string" ? detail : "Could not count selected cohorts");
        }
        return response.json() as Promise<CohortCounts>;
      }).then((data) => {
        if (!stale) {
          setCounts(data);
          setCountsKey(requestBody);
        }
      }).catch((cause: Error) => { if (!stale) setError(cause.message); });
    return () => { stale = true; };
  }, [requestBody]);

  async function analyze() {
    setPending(true); setError(null); setResult(null);
    try {
      const response = await fetch("/api/differential-expression", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestBody });
      const raw = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        const message = raw.trim().slice(0, 500) || "The server returned an empty response.";
        throw new Error(`Analysis API returned ${response.status}: ${message}`);
      }
      if (!response.ok) {
        const detail = typeof body === "object" && body !== null && "detail" in body
          ? body.detail
          : null;
        throw new Error(
          typeof detail === "string" ? detail : `Analysis failed (${response.status}).`,
        );
      }
      setResult(body as Result);
      setResultKey(requestBody);
      setReferenceExpanded(false);
      setComparisonExpanded(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis failed");
    } finally { setPending(false); }
  }

  function downloadResults() {
    if (!activeResult) return;
    const pcaColumns = ["run_accession", "cohort", ...FACETS, "study", "pc1", "pc2"];
    const pcaCsv = csv([
      pcaColumns,
      ...activeResult.pca.map((point) => pcaColumns.map((column) => point[column] ?? "")),
    ]);
    const heatmapCsv = csv([
      ["gene", ...activeResult.all_heatmap_samples],
      ...activeResult.heatmap_genes.map((gene, row) => [gene, ...(activeResult.all_heatmap_values[row] ?? [])]),
    ]);
    const groupCsv = csv([
      ["run_accession", "group"],
      ...activeResult.all_heatmap_samples.map((sample, index) => [sample, activeResult.all_heatmap_groups[index] ?? ""]),
    ]);
    const degColumns: (keyof Result["genes"][number])[] = ["gene", "mean_reference", "mean_comparison", "mean_difference", "statistic", "pval", "padj"];
    const degCsv = csv([
      degColumns,
      ...activeResult.genes.map((row) => degColumns.map((column) => row[column] ?? "")),
    ]);
    const varianceCsv = csv([
      ["component", "explained_variance_ratio"],
      ...activeResult.pca_variance.map((ratio, index) => [`PC${index + 1}`, ratio]),
    ]);
    const archive = createZip([
      { name: "pca_data.csv", content: pcaCsv },
      { name: "pca_variance.csv", content: varianceCsv },
      { name: "heatmap_values_all_samples.csv", content: heatmapCsv },
      { name: "heatmap_sample_groups.csv", content: groupCsv },
      { name: "differential_expression.csv", content: degCsv },
      { name: "pca_plot.svg", content: pcaSvg(activeResult, pcaColorBy) },
      { name: "heatmap.svg", content: heatmapSvg(activeResult) },
    ]);
    const url = URL.createObjectURL(archive);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cancerlike-differential-expression.zip";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const lowSamples = (activeCounts?.cohort1_n ?? 0) < 5 || (activeCounts?.cohort2_n ?? 0) < 5;
  return (
    <CohortShell state={state}>
      <section className="mt-5">
        <h2 className="text-lg font-medium text-zinc-800">Differential Expression Analysis</h2>
        <p className="mt-1 text-sm text-zinc-600">Compare bulk expression between two cohorts. Both panels start with no filters applied.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CohortFilters label="Reference" value={cohort1} options={options.data ?? {}} onChange={setCohort1} collapsed={!referenceExpanded} onToggleCollapsed={() => setReferenceExpanded(!referenceExpanded)} />
        <CohortFilters label="Comparison" value={cohort2} options={options.data ?? {}} onChange={setCohort2} collapsed={!comparisonExpanded} onToggleCollapsed={() => setComparisonExpanded(!comparisonExpanded)} />
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <p>Reference: <span className="font-mono">{(activeCounts?.cohort1_n ?? 0).toLocaleString()}</span> bulk samples</p>
          <p>Comparison: <span className="font-mono">{(activeCounts?.cohort2_n ?? 0).toLocaleString()}</span> bulk samples</p>
          {sameFilters || activeCounts?.identical ? <p className="text-amber-800">Reference and Comparison are identical. Change the filters so they differ before analyzing.</p> : null}
          {!sameFilters && activeCounts && activeCounts.overlap > 0 && !activeCounts.identical && <p className="text-amber-800">Reference and Comparison share {activeCounts.overlap.toLocaleString()} samples. Adjust the filters so they do not overlap.</p>}
          {lowSamples && <p className="text-amber-800">One or both cohorts have fewer than 5 samples. Results may be unreliable; at least 2 per cohort are required.</p>}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={pending || !activeCounts || sameFilters || activeCounts.identical || activeCounts.overlap > 0 || activeCounts.cohort1_n < 2 || activeCounts.cohort2_n < 2} onClick={analyze} className="mt-4 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Analyzing…" : "Analyze"}</button>
      </section>
      {activeResult && <div ref={resultsRef} className="mt-8 scroll-mt-4 space-y-8">
        <button type="button" onClick={downloadResults} className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent">Download analysis results (.zip)</button>
        <section><h3 className="font-medium text-zinc-800">PCA of selected samples</h3><ResultPca result={activeResult} colorBy={pcaColorBy} setColorBy={setPcaColorBy} /></section>
        <section><h3 className="font-medium text-zinc-800">Significant-gene heatmap</h3><p className="mt-1 text-xs text-zinc-500">Top significant genes, row z-scores for display, and up to 25 samples per cohort. Blue indicates lower and red higher relative expression within each gene.</p><Heatmap result={activeResult} /></section>
        <section><h3 className="font-medium text-zinc-800">Significant differentially expressed genes</h3><p className="mt-1 text-xs text-zinc-500">Welch’s t-test with Benjamini–Hochberg adjustment. Only genes with adjusted p-value ≤ 0.05 are included. Mean difference is Comparison minus Reference on the input expression scale.</p><GeneResults genes={activeResult.genes} /></section>
      </div>}
    </CohortShell>
  );
}

export default function DifferentialExpressionPage() {
  return <Suspense fallback={loading}><DifferentialExpression /></Suspense>;
}
