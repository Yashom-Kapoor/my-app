import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { NUTRIENTS, meetsGoal, type Goal, type Macros } from "@/lib/nutrition";

function formatGoal(goal: Goal | undefined, unit: string) {
  if (!goal) return "no goal";
  if (goal.min != null && goal.max != null) return `${goal.min}–${goal.max} ${unit}`;
  if (goal.min != null) return `≥ ${goal.min} ${unit}`;
  return `≤ ${goal.max} ${unit}`;
}

export function MacroProgress({ totals, goals }: { totals: Macros; goals: Goal[] }) {
  return (
    <Card>
      <CardContent className="space-y-4">
        {NUTRIENTS.map(({ key, label, unit }) => {
          const value = totals[key];
          const goal = goals.find((g) => g.nutrient === key);
          const target = goal?.max ?? goal?.min ?? 0;
          const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
          const met = goal ? meetsGoal(value, goal) : false;
          const over = goal?.max != null && value > goal.max;

          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="tabular-nums text-muted-foreground">
                  <span className={cn("font-medium text-foreground", over && "text-destructive")}>
                    {value}
                  </span>{" "}
                  / {formatGoal(goal, unit)}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    over ? "bg-destructive" : met ? "bg-emerald-500" : "bg-foreground/70",
                  )}
                  style={{ width: `${pct}%` }}
                />
                {goal?.min != null && goal.max != null && (
                  <div
                    className="absolute inset-y-0 w-0.5 bg-background"
                    style={{ left: `${(goal.min / goal.max) * 100}%` }}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
