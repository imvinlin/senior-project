import { useState } from "react";

import { formatCount } from "@/lib/format";

type Point = { run_accession: string; species: string; cancer: string; study: string; pc1: number; pc2: number };
export type PcaView = { points: Point[]; variance: number[]; excluded: number };

const SERIES: Record<string, { dot: string; swatch: string }> = {
  "Canis lupus familiaris": { dot: "fill-series-1", swatch: "bg-series-1" },
  "Rattus norvegicus": { dot: "fill-series-2", swatch: "bg-series-2" },
  "Macaca mulatta": { dot: "fill-series-3", swatch: "bg-series-3" },
};
const OTHER = { dot: "fill-zinc-400", swatch: "bg-zinc-400" };
const W = 760;
const H = 520;
const PAD = { left: 56, right: 16, top: 16, bottom: 48 };

function scale(values: number[], from: number, to: number) {
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  return (v: number) => from + ((v - lo) / span) * (to - from);
}

function percent(ratio: number | undefined): string {
  return `${((ratio ?? 0) * 100).toFixed(1)}%`;
}

export function PcaPlot({ view, n }: { view: PcaView; n: number }) {
  const [hover, setHover] = useState<Point | null>(null);
  const { points, variance, excluded } = view;
  if (points.length === 0) {
    return (
      <p className="mt-2 text-sm text-zinc-500">
        No bulk samples in this cohort, so there is nothing to plot. {formatCount(excluded)}{" "}
        single-cell samples have no coordinates.
      </p>
    );
  }
  const x = scale(points.map((p) => p.pc1), PAD.left + 8, W - PAD.right - 8);
  const y = scale(points.map((p) => p.pc2), H - PAD.bottom - 8, PAD.top + 8);
  const counts = new Map<string, number>();
  for (const p of points) counts.set(p.species, (counts.get(p.species) ?? 0) + 1);
  const colored = [...counts].filter(([species]) => species in SERIES).sort((a, b) => b[1] - a[1]);
  const other = [...counts].filter(([species]) => !(species in SERIES));
  const otherN = other.reduce((sum, [, count]) => sum + count, 0);
  const studies = new Set(points.map((p) => p.study)).size;
  const ordered = [...points.filter((p) => !(p.species in SERIES)), ...points.filter((p) => p.species in SERIES)];

  function nearest(e: React.MouseEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - box.left;
    const my = e.clientY - box.top;
    let best: Point | null = null;
    let bestDistance = 64;
    for (const p of points) {
      const distance = (x(p.pc1) - mx) ** 2 + (y(p.pc2) - my) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p;
      }
    }
    setHover(best);
  }

  return (
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
            PC1 ({percent(variance[0])} of variance)
          </text>
          <text
            x={14}
            y={(PAD.top + H - PAD.bottom) / 2}
            transform={`rotate(-90 14 ${(PAD.top + H - PAD.bottom) / 2})`}
            textAnchor="middle"
            className="fill-zinc-600 text-xs"
          >
            PC2 ({percent(variance[1])} of variance)
          </text>
          {ordered.map((p) => (
            <circle
              key={p.run_accession}
              cx={x(p.pc1)}
              cy={y(p.pc2)}
              r={3}
              fillOpacity={0.7}
              strokeWidth={0.6}
              className={`${(SERIES[p.species] ?? OTHER).dot} stroke-white`}
            />
          ))}
          {hover && (
            <circle cx={x(hover.pc1)} cy={y(hover.pc2)} r={6} className="fill-none stroke-zinc-900" strokeWidth={1.5} />
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute rounded bg-zinc-900 px-2 py-1 text-xs text-white"
            style={{ left: x(hover.pc1) + 12, top: y(hover.pc2) - 40 }}
          >
            <span className="font-mono">{hover.run_accession}</span>
            <br />
            {hover.species} · {hover.cancer} · {hover.study}
          </div>
        )}
      </div>
      <div className="w-72 text-sm">
        <h3 className="font-medium text-zinc-700">Samples per species</h3>
        <ul className="mt-2">
          {colored.map(([species, count]) => (
            <li key={species} className="flex items-center gap-2 py-0.5">
              <span className={`h-2.5 w-2.5 rounded-full ${(SERIES[species] ?? OTHER).swatch}`} />
              <span className="italic">{species}</span>
              <span className="ml-auto font-mono text-zinc-500">{formatCount(count)}</span>
            </li>
          ))}
          {other.length > 0 && (
            <li className="flex items-center gap-2 py-0.5">
              <span className={`h-2.5 w-2.5 rounded-full ${OTHER.swatch}`} />
              <span>Other ({other.length === 1 ? "1 species" : `${other.length} species`})</span>
              <span className="ml-auto font-mono text-zinc-500">{formatCount(otherN)}</span>
            </li>
          )}
        </ul>
        <p className="mt-4 text-zinc-600">
          {formatCount(points.length)} of {formatCount(n)} cohort samples are plotted. The other{" "}
          {formatCount(excluded)} are single-cell and have no coordinates.
        </p>
        <p className="mt-2 text-zinc-600">
          The embedding was fit once on all 3,089 bulk samples, so PC1 means the same thing for every cohort.
        </p>
        {studies > 1 && (
          <p className="mt-2 text-amber-700">
            These samples come from {formatCount(studies)} studies. Clusters can reflect study as much as
            biology.
          </p>
        )}
      </div>
    </div>
  );
}
