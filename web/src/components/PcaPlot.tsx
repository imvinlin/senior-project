import { useState } from "react";

import { formatCount } from "@/lib/format";

const AXES = ["pc1", "pc2", "pc3", "pc4", "pc5"] as const;
const FACETS = ["species", "system", "cancer", "subtype", "tissue", "sex", "assay", "clade"] as const;
type Axis = (typeof AXES)[number];
type Facet = (typeof FACETS)[number];
type Point = { run_accession: string; study: string } & Record<Facet, string> & Record<Axis, number>;
export type PcaView = {
  points: Point[];
  variance: number[];
  extent: Record<string, [number, number]>;
  top: Record<string, string[]>;
  excluded: number;
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
const BUTTON =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-accent";
const SELECT =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-accent";

function scale([lo, hi]: [number, number], from: number, to: number) {
  const span = hi - lo || 1;
  return (v: number) => from + ((v - lo) / span) * (to - from);
}

function cohortExtent(points: Point[], axis: Axis): [number, number] {
  const values = points.map((p) => p[axis]);
  return [Math.min(...values), Math.max(...values)];
}

function percent(ratio: number | undefined): string {
  return `${((ratio ?? 0) * 100).toFixed(1)}%`;
}

function downloadCsv(points: Point[]) {
  const columns = ["run_accession", ...FACETS, "study", ...AXES];
  const rows = points.map((p) => columns.map((c) => JSON.stringify(p[c as keyof Point])).join(","));
  const blob = new Blob([[columns.join(","), ...rows].join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "cancerlike-pca.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

export function PcaPlot({ view, n }: { view: PcaView; n: number }) {
  const [hover, setHover] = useState<Point | null>(null);
  const [xAxis, setXAxis] = useState<Axis>("pc1");
  const [yAxis, setYAxis] = useState<Axis>("pc2");
  const [zoomed, setZoomed] = useState(false);
  const [colorBy, setColorBy] = useState<Facet>("species");
  const { points, variance, extent, top, excluded } = view;
  if (points.length === 0) {
    return (
      <p className="mt-2 text-sm text-zinc-500">
        No bulk samples in this cohort, so there is nothing to plot. {formatCount(excluded)}{" "}
        single-cell samples have no coordinates.
      </p>
    );
  }
  const frame = (axis: Axis) => (zoomed ? cohortExtent(points, axis) : (extent[axis] ?? [0, 1]));
  const x = scale(frame(xAxis), PAD.left + 8, W - PAD.right - 8);
  const y = scale(frame(yAxis), H - PAD.bottom - 8, PAD.top + 8);
  const leading = top[colorBy] ?? [];
  const series = (p: Point) => SERIES[leading.indexOf(p[colorBy])] ?? OTHER;
  const counts = new Map<string, number>();
  for (const p of points) counts.set(p[colorBy], (counts.get(p[colorBy]) ?? 0) + 1);
  const colored = leading.filter((value) => counts.has(value));
  const other = [...counts].filter(([value]) => !leading.includes(value));
  const otherN = other.reduce((sum, [, count]) => sum + count, 0);
  const studies = new Set(points.map((p) => p.study)).size;
  const ordered = [...points.filter((p) => series(p) === OTHER), ...points.filter((p) => series(p) !== OTHER)];
  const centroid = (value: string) => {
    const members = points.filter((p) => p[colorBy] === value);
    const mean = (axis: Axis) => members.reduce((sum, p) => sum + p[axis], 0) / members.length;
    return { x: x(mean(xAxis)), y: y(mean(yAxis)) };
  };
  const label = (axis: Axis) => `${axis.toUpperCase()} (${percent(variance[AXES.indexOf(axis)])} of variance)`;
  const italic = colorBy === "species" ? "italic" : "";

  function nearest(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - box.left;
    const my = e.clientY - box.top;
    let best: Point | null = null;
    let bestDistance = 64;
    for (const p of points) {
      const distance = (x(p[xAxis]) - mx) ** 2 + (y(p[yAxis]) - my) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p;
      }
    }
    setHover(best);
  }

  const axisPicker = (value: Axis, onChange: (axis: Axis) => void) => (
    <select className={SELECT} value={value} onChange={(e) => onChange(e.target.value as Axis)}>
      {AXES.map((axis) => (
        <option key={axis} value={axis}>
          {label(axis)}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-700">
        <span>X</span>
        {axisPicker(xAxis, setXAxis)}
        <span>Y</span>
        {axisPicker(yAxis, setYAxis)}
        <button type="button" className={BUTTON} onClick={() => setZoomed(!zoomed)}>
          {zoomed ? "Show full atlas" : "Zoom to cohort"}
        </button>
        <span>Colour by</span>
        <select
          className={`${SELECT} capitalize`}
          value={colorBy}
          onChange={(e) => setColorBy(e.target.value as Facet)}
        >
          {FACETS.map((facet) => (
            <option key={facet} value={facet}>
              {facet}
            </option>
          ))}
        </select>
        <button type="button" className={BUTTON} onClick={() => downloadCsv(points)}>
          Download CSV
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-6">
        <div className="relative">
          <svg
            width={W}
            height={H}
            className="rounded border border-zinc-200"
            onMouseMove={nearest}
            onMouseLeave={() => setHover(null)}
          >
            <text x={(PAD.left + W - PAD.right) / 2} y={H - 12} textAnchor="middle" className="fill-zinc-600 text-xs">
              {label(xAxis)}
            </text>
            <text
              x={14}
              y={(PAD.top + H - PAD.bottom) / 2}
              transform={`rotate(-90 14 ${(PAD.top + H - PAD.bottom) / 2})`}
              textAnchor="middle"
              className="fill-zinc-600 text-xs"
            >
              {label(yAxis)}
            </text>
            {ordered.map((p) => (
              <circle
                key={p.run_accession}
                cx={x(p[xAxis])}
                cy={y(p[yAxis])}
                r={3}
                fillOpacity={0.7}
                strokeWidth={0.6}
                className={`${series(p).dot} stroke-white`}
              />
            ))}
            {colored.map((value) => (
              <text
                key={value}
                x={centroid(value).x + 8}
                y={centroid(value).y - 8}
                className={`fill-zinc-900 text-xs ${italic}`}
                style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}
              >
                {value}
              </text>
            ))}
            {hover && (
              <circle
                cx={x(hover[xAxis])}
                cy={y(hover[yAxis])}
                r={6}
                className="fill-none stroke-zinc-900"
                strokeWidth={1.5}
              />
            )}
          </svg>
          {hover && (
            <div
              className="pointer-events-none absolute rounded bg-zinc-900 px-2 py-1 text-xs text-white"
              style={{ left: x(hover[xAxis]) + 12, top: y(hover[yAxis]) - 40 }}
            >
              <span className="font-mono">{hover.run_accession}</span>
              <br />
              {hover.species} · {hover.cancer} · {hover.study}
              {colorBy !== "species" && colorBy !== "cancer" && (
                <>
                  <br />
                  {colorBy}: {hover[colorBy]}
                </>
              )}
            </div>
          )}
        </div>
        <div className="w-72 text-sm">
          <h3 className="font-medium text-zinc-700">Samples per {colorBy}</h3>
          <ul className="mt-2">
            {colored.map((value) => (
              <li key={value} className="flex items-center gap-2 py-0.5">
                <span className={`h-2.5 w-2.5 rounded-full ${SERIES[leading.indexOf(value)]?.swatch}`} />
                <span className={italic}>{value}</span>
                <span className="ml-auto font-mono text-zinc-500">{formatCount(counts.get(value) ?? 0)}</span>
              </li>
            ))}
            {other.length > 0 && (
              <li className="flex items-center gap-2 py-0.5">
                <span className={`h-2.5 w-2.5 rounded-full ${OTHER.swatch}`} />
                <span>Other ({other.length === 1 ? "1 value" : `${other.length} values`})</span>
                <span className="ml-auto font-mono text-zinc-500">{formatCount(otherN)}</span>
              </li>
            )}
          </ul>
          <p className="mt-4 text-zinc-600">
            {formatCount(points.length)} of {formatCount(n)} cohort samples are plotted. The other{" "}
            {formatCount(excluded)} are single-cell and have no coordinates.
          </p>
          <p className="mt-2 text-zinc-600">
            The embedding was fit once on all 3,089 bulk samples, so PC1 means the same thing for every
            cohort. The frame is the whole atlas unless you zoom.
          </p>
          {studies > 1 && (
            <p className="mt-2 text-amber-700">
              These samples come from {formatCount(studies)} studies. Clusters can reflect study as much
              as biology.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
