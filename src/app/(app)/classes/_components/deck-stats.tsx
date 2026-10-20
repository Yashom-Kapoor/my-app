import type { DeckStats } from "../review/data";

const CHIPS: [keyof DeckStats["byStatus"], string][] = [
  ["new", "New"],
  ["locked", "Locked"],
  ["learning", "Learning"],
  ["due", "Due"],
  ["review", "Review"],
  ["mastered", "Mastered"],
];

export function DeckStatsHeader({ stats }: { stats: DeckStats }) {
  const { explainTotal, explainIntroduced } = stats;
  const pct = explainTotal ? Math.min(100, Math.round((explainIntroduced / explainTotal) * 100)) : 0;
  return (
    <div className="space-y-3 rounded-xl border p-3">
      <div className="space-y-1">
        <div className="flex justify-between text-sm">
          <span>Explain cards seen</span>
          <span className="tabular-nums">
            {explainIntroduced} / {explainTotal}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Explain cards seen"
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {CHIPS.map(([key, label]) => (
          <li key={key} className="rounded-full border px-2 py-0.5 text-xs">
            {label} <span className="font-medium tabular-nums">{stats.byStatus[key]}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Due = past due, reviewed before. Mastered = scheduled 21+ days out.</p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xl font-semibold tabular-nums">{stats.dueToday}</div>
          <div className="text-xs text-muted-foreground">to review today (incl. learning)</div>
        </div>
        <div>
          <div className="text-xl font-semibold tabular-nums">
            {stats.accuracy30d === null ? "—" : `${Math.round(stats.accuracy30d * 100)}%`}
          </div>
          <div className="text-xs text-muted-foreground">Accuracy (30 days)</div>
        </div>
      </div>
    </div>
  );
}
