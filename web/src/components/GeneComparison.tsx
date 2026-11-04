import { useState } from "react";

import { formatCount } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const FACETS = ["species", "system", "cancer", "subtype", "tissue", "sex", "assay", "clade"] as const;
type Facet = (typeof FACETS)[number];
type Point = { run_accession: string; study: string; x: number; y: number } & Record<Facet, string>;
export type GeneExpressionView = {
  points: Point[];
  top: Record<Facet, string[]>;
  excluded: number;
  total: number;
  scope: "global" | "cohort";
  gene1: string;
  gene2: string;
};

const SERIES = [
  { dot: "fill-series-1", swatch: "bg-series-1" },
  { dot: "fill-series-2", swatch: "bg-series-2" },
  { dot: "fill-series-3", swatch: "bg-series-3" },
];
const OTHER = { dot: "fill-zinc-400", swatch: "bg-zinc-400" };
const W = 760;
const H = 520;
const PAD = { left: 56, right: 16, top: 16, bottom: 48 };
const BUTTON = "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent";
const SELECT = "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-accent";

function scale(values: number[], from: number, to: number) {
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const span = high - low || 1;
  return (value: number) => from + ((value - low) / span) * (to - from);
}

function csvValue(value: string | number) {
  return typeof value === "number" ? String(value) : `"${value.replaceAll('"', '""')}"`;
}

function GenePicker({
  label,
  gene,
  setGene,
}: {
  label: string;
  gene: string;
  setGene: (value: string) => void;
}) {
  const [query, setQuery] = useState(gene);
  const [open, setOpen] = useState(false);
  const search = query.trim();
  const { data, error, pending } = useApi<string[]>(
    `/api/genes?q=${encodeURIComponent(search)}`,
    open,
  );

  function choose(value: string) {
    setGene(value);
    setQuery(value);
    setOpen(false);
  }

  return (
    <div className="relative w-64">
      <label className="block text-xs font-medium text-zinc-700">
        {label}
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={`${label}-gene-options`}
          value={query}
          className="mt-1 w-full rounded border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          placeholder="Search gene symbols"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setGene("");
            setOpen(true);
          }}
        />
      </label>
      {open && (
        <ul id={`${label}-gene-options`} role="listbox" className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-zinc-200 bg-white shadow-lg">
          {pending && <li className="px-3 py-2 text-xs text-zinc-500">Searching...</li>}
          {error && <li className="px-3 py-2 text-xs text-red-700">Could not load genes: {error}</li>}
          {!pending && data?.map((value) => (
            <li key={value} role="option" aria-selected={gene === value}>
              <button type="button" className="w-full px-3 py-1.5 text-left font-mono text-xs hover:bg-zinc-100" onClick={() => choose(value)}>
                {value}
              </button>
            </li>
          ))}
          {!pending && !error && data?.length === 0 && (
            <li className="px-3 py-2 text-xs text-zinc-500">No genes match that search.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function downloadCsv(view: GeneExpressionView) {
  const columns = ["run_accession", ...FACETS, "study", view.gene1, view.gene2];
  const rows = view.points.map((point) =>
    [point.run_accession, ...FACETS.map((facet) => point[facet]), point.study, point.x, point.y]
      .map(csvValue)
      .join(","),
  );
  const blob = new Blob([[columns.map(csvValue).join(","), ...rows].join("\n")], {
    type: "text/csv",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `cancerlike-${view.gene1}-${view.gene2}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function GeneComparison({
  gene1,
  gene2,
  setGene1,
  setGene2,
  scope,
  setScope,
  view,
  error,
  pending,
}: {
  gene1: string;
  gene2: string;
  setGene1: (gene: string) => void;
  setGene2: (gene: string) => void;
  scope: "global" | "cohort";
  setScope: (scope: "global" | "cohort") => void;
  view: GeneExpressionView | null;
  error: string | null;
  pending: boolean;
}) {
  const [colorBy, setColorBy] = useState<Facet>("species");
  const [hover, setHover] = useState<Point | null>(null);
  const points = view?.points ?? [];
  const x = scale(points.map((point) => point.x), PAD.left + 8, W - PAD.right - 8);
  const y = scale(points.map((point) => point.y), H - PAD.bottom - 8, PAD.top + 8);
  const top = view?.top[colorBy] ?? [];
  const series = (point: Point) => SERIES[top.indexOf(point[colorBy])] ?? OTHER;
  const counts = new Map<string, number>();
  for (const point of points) counts.set(point[colorBy], (counts.get(point[colorBy]) ?? 0) + 1);
  const colored = top.filter((value) => counts.has(value));
  const other = [...counts].filter(([value]) => !top.includes(value));
  const otherN = other.reduce((sum, [, count]) => sum + count, 0);
  const ordered = [...points.filter((point) => series(point) === OTHER), ...points.filter((point) => series(point) !== OTHER)];
  const italic = colorBy === "species" ? "italic" : "";
  const centroid = (value: string) => {
    const members = points.filter((point) => point[colorBy] === value);
    return {
      x: x(members.reduce((sum, point) => sum + point.x, 0) / members.length),
      y: y(members.reduce((sum, point) => sum + point.y, 0) / members.length),
    };
  };

  function nearest(event: React.MouseEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    let best: Point | null = null;
    let bestDistance = 64;
    for (const point of points) {
      const distance = (x(point.x) - mx) ** 2 + (y(point.y) - my) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
    setHover(best);
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-zinc-700">Compare expression across bulk samples</h2>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <GenePicker label="Gene 1 (X axis)" gene={gene1} setGene={setGene1} />
        <GenePicker label="Gene 2 (Y axis)" gene={gene2} setGene={setGene2} />
        <div className="pb-0.5">
          <span className="mb-1 block text-xs font-medium text-zinc-700">Samples</span>
          <div className="inline-flex overflow-hidden rounded border border-zinc-300 text-xs text-zinc-700">
            {(["global", "cohort"] as const).map((option) => (
              <button key={option} type="button" aria-pressed={scope === option}
                className={`px-3 py-1.5 ${scope === option ? "bg-zinc-100 font-medium" : "bg-white hover:bg-zinc-50"}`}
                onClick={() => setScope(option)}>
                {option === "global" ? "All bulk samples" : "Filtered cohort"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Expression values are from the prepared bulk atlas. Filtered cohort mode applies the active sidebar filters.
      </p>
      {gene1 && gene1 === gene2 && (
        <p className="mt-3 text-sm text-amber-700">Choose two different genes to compare their expression.</p>
      )}
      {error && <p className="mt-3 text-sm text-red-700">Could not load expression data: {error}.</p>}
      {pending && <p className="mt-3 text-sm text-zinc-500">Loading expression data...</p>}
      {!pending && view && points.length === 0 && (
        <p className="mt-3 text-sm text-zinc-500">No bulk samples match this selection.</p>
      )}
      {!pending && view && points.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-700">
            <span>Colour by</span>
            <select className={`${SELECT} capitalize`} value={colorBy}
              onChange={(event) => setColorBy(event.target.value as Facet)}>
              {FACETS.map((facet) => <option key={facet} value={facet}>{facet}</option>)}
            </select>
            <button type="button" className={BUTTON} onClick={() => downloadCsv(view)}>
              Download CSV
            </button>
            <span className="text-zinc-500">
              {formatCount(points.length)} bulk samples plotted; {formatCount(view.excluded)} non-bulk samples excluded.
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-6">
            <div className="relative max-w-full overflow-x-auto">
              <svg width={W} height={H} className="rounded border border-zinc-200"
                onMouseMove={nearest} onMouseLeave={() => setHover(null)}>
                <a
                  href={`https://www.ncbi.nlm.nih.gov/datasets/gene/taxon/1/?search=${encodeURIComponent(view.gene1)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Search NCBI Gene for ${view.gene1}`}
                >
                  <text x={(PAD.left + W - PAD.right) / 2} y={H - 12} textAnchor="middle" className="fill-zinc-600 text-xs cursor-pointer">
                    {view.gene1} expression
                  </text>
                </a>
                <a
                  href={`https://www.ncbi.nlm.nih.gov/datasets/gene/taxon/1/?search=${encodeURIComponent(view.gene2)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Search NCBI Gene for ${view.gene2}`}
                >
                  <text x={14} y={(PAD.top + H - PAD.bottom) / 2}
                    transform={`rotate(-90 14 ${(PAD.top + H - PAD.bottom) / 2})`}
                    textAnchor="middle" className="fill-zinc-600 text-xs cursor-pointer">
                    {view.gene2} expression
                  </text>
                </a>
                {ordered.map((point) => (
                  <circle key={point.run_accession} cx={x(point.x)} cy={y(point.y)} r={3}
                    fillOpacity={0.7} strokeWidth={0.6} className={`${series(point).dot} stroke-white`} />
                ))}
                {colored.map((value) => (
                  <text key={value} x={centroid(value).x + 8} y={centroid(value).y - 8}
                    className={`fill-zinc-900 text-xs ${italic}`}
                    style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}>
                    {value}
                  </text>
                ))}
                {hover && (
                  <circle cx={x(hover.x)} cy={y(hover.y)} r={6} className="fill-none stroke-zinc-900" strokeWidth={1.5} />
                )}
              </svg>
              {hover && (
                <div className="pointer-events-none absolute rounded bg-zinc-900 px-2 py-1 text-xs text-white"
                  style={{ left: x(hover.x) + 12, top: y(hover.y) - 44 }}>
                  <span className="font-mono">{hover.run_accession}</span><br />
                  {hover.species} · {hover.cancer} · {hover.study}<br />
                  {view.gene1}: {hover.x.toFixed(3)} · {view.gene2}: {hover.y.toFixed(3)}
                </div>
              )}
            </div>
            <div className="w-72 text-sm">
              <h3 className="font-medium text-zinc-700">Samples per {colorBy}</h3>
              <ul className="mt-2">
                {colored.map((value) => (
                  <li key={value} className="flex items-center gap-2 py-0.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${SERIES[top.indexOf(value)]?.swatch}`} />
                    <span className={italic}>{value}</span>
                    <span className="ml-auto font-mono text-xs text-zinc-500">{formatCount(counts.get(value) ?? 0)}</span>
                  </li>
                ))}
                {other.length > 0 && (
                  <li className="flex items-center gap-2 py-0.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${OTHER.swatch}`} />
                    <span>Other ({other.length} values)</span>
                    <span className="ml-auto font-mono text-xs text-zinc-500">{formatCount(otherN)}</span>
                  </li>
                )}
              </ul>
              <p className="mt-4 text-zinc-600">
                {formatCount(points.length)} bulk samples are plotted from {formatCount(view.total)} selected samples.
              </p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
