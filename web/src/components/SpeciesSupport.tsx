import { formatCount } from "@/lib/format";
import { SMALL_GROUP } from "@/lib/support";

function formatShare(count: number, n: number): string {
  const percent = (count / n) * 100;
  return percent < 0.1 ? "<0.1%" : `${percent.toFixed(1)}%`;
}

export function SpeciesSupport({ groups, n }: { groups: [string, number][]; n: number }) {
  const small = groups.filter(([, count]) => count < SMALL_GROUP).length;
  return (
    <section className="mt-8 max-w-2xl">
      <h2 className="text-sm font-medium text-zinc-700">Samples per species</h2>
      {groups.length === 0 && (
        <p className="mt-1 text-sm text-zinc-500">No samples match these filters.</p>
      )}
      {small > 0 && (
        <p className="mt-1 text-sm text-amber-700">
          {small} of {groups.length} species {small === 1 ? "has" : "have"} fewer than{" "}
          {SMALL_GROUP} samples.
        </p>
      )}
      <table className="mt-2 w-full text-sm">
        <tbody>
          {groups.map(([name, count]) => (
            <tr key={name} className="border-t border-zinc-200">
              <td className="py-1 italic">{name}</td>
              <td className="py-1 pl-4 text-right font-mono">{formatCount(count)}</td>
              <td className="py-1 pl-4 text-right font-mono text-zinc-500">
                {formatShare(count, n)}
              </td>
              <td className="w-40 py-1 pl-4 text-amber-700">
                {count < SMALL_GROUP && `fewer than ${SMALL_GROUP}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
