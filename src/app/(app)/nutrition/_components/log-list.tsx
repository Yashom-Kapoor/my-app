import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { round1, type FoodLog } from "@/lib/nutrition";
import { deleteLog } from "../actions";

export function LogList({ logs }: { logs: FoodLog[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Eaten</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y">
            {logs.map((log) => {
              const s = Number(log.servings);
              return (
                <li key={log.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {log.name}
                      {s !== 1 && <span className="font-normal text-muted-foreground"> × {s}</span>}
                    </div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {round1(log.calories * s)} kcal · P {round1(log.protein_g * s)} · C {round1(log.carbs_g * s)} · F{" "}
                      {round1(log.fat_g * s)} · Fib {round1(log.fiber_g * s)}
                    </div>
                  </div>
                  <form action={deleteLog.bind(null, log.id)}>
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Remove ${log.name}`}>
                      <Trash2Icon />
                    </Button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
