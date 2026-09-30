import { formatCount } from "@/lib/format";
import { SMALL_GROUP } from "@/lib/support";
import { useApi } from "@/lib/useApi";

type Cell = { species: string; cancer: string; n: number; atlas: number };
type Coverage = { species: string[]; cancers: string[]; cells: Cell[] };

const SHADES = [
  { from: 300, label: "300 or more", className: "bg-heat-4 text-white" },
  { from: 100, label: "100 to 299", className: "bg-heat-3 text-white" },
  { from: 30, label: "30 to 99", className: "bg-heat-2 text-zinc-900" },
  { from: SMALL_GROUP, label: `${SMALL_GROUP} to 29`, className: "bg-heat-1 text-zinc-900" },
];
const TOO_FEW = "text-amber-700";

function shade(n: number): string {
  return SHADES.find((s) => n >= s.from)?.className ?? TOO_FEW;
}

export function CoverageTable({
  query,
  setFilters,
}: {
  query: string;
  setFilters: (values: Record<string, string>) => void;
}) {
  const { data, error } = useApi<Coverage>(`/api/coverage?${query}`);
  const params = new URLSearchParams(query);
  const picked = { species: params.getAll("species"), cancer: params.getAll("cancer") };

  function selected(species: string, cancer: string): boolean {
    return (
      picked.species.length + picked.cancer.length > 0 &&
      (picked.species.length === 0 || picked.species.includes(species)) &&
      (picked.cancer.length === 0 || picked.cancer.includes(cancer))
    );
  }

  function toggle(species: string, cancer: string) {
    const only =
      picked.species.length === 1 &&
      picked.species[0] === species &&
      picked.cancer.length === 1 &&
      picked.cancer[0] === cancer;
    setFilters(only ? { species: "", cancer: "" } : { species, cancer });
  }

  if (error) return <p className="mt-8 text-sm text-red-700">Could not load coverage: {error}</p>;
  if (!data) return null;
  const cells = new Map(data.cells.map((cell) => [`${cell.species}|${cell.cancer}`, cell]));
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium text-zinc-700">Samples per species and cancer type</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Counts ignore the species and cancer filters. Click a count to filter by that species and
        cancer type, and click it again to clear.
      </p>
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
        <li>blank: not in the atlas</li>
        <li>
          <span className="font-mono text-zinc-400">0</span> removed by the current filters
        </li>
        <li>
          <span className={`font-mono ${TOO_FEW}`}>3</span> fewer than {SMALL_GROUP}
        </li>
        {[...SHADES].reverse().map((s) => (
          <li key={s.label} className="flex items-center gap-1">
            <span className={`inline-block h-3 w-5 rounded-sm ${s.className}`} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="mt-2 overflow-x-auto pb-1">
        <table className="text-xs">
          <thead>
            <tr>
              <th />
              {data.cancers.map((cancer) => (
                <th key={cancer} scope="col" className="px-1 pb-1 align-bottom font-medium">
                  <span className="rotate-180 whitespace-nowrap [writing-mode:vertical-rl]">
                    {cancer}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.species.map((species) => (
              <tr key={species}>
                <th
                  scope="row"
                  className="sticky left-0 whitespace-nowrap bg-white py-1 pr-3 text-left font-normal italic"
                >
                  {species}
                </th>
                {data.cancers.map((cancer) => {
                  const cell = cells.get(`${species}|${cancer}`);
                  const on = selected(species, cancer);
                  const label = cell
                    ? `${species}, ${cancer}: ${cell.n} of ${cell.atlas} samples in the atlas`
                    : "";
                  return (
                    <td key={cancer} className={`p-px ${on ? "bg-zinc-200" : ""}`}>
                      {cell?.n === 0 && (
                        <span className="block px-1 text-right font-mono text-zinc-400">0</span>
                      )}
                      {cell && cell.n > 0 && (
                        <button
                          type="button"
                          title={label}
                          aria-label={label}
                          aria-pressed={on}
                          className={`block h-6 w-full min-w-8 rounded-sm px-1 text-right font-mono hover:outline hover:outline-1 hover:outline-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${shade(cell.n)} ${on ? "shadow-[inset_0_0_0_2px_#fff,0_0_0_2px_#18181b]" : ""}`}
                          onClick={() => toggle(species, cancer)}
                        >
                          {formatCount(cell.n)}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
