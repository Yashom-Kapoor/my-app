"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NUTRIENTS, type Goal } from "@/lib/nutrition";
import { saveGoals, type ActionState } from "../actions";

export function GoalsForm({ goals }: { goals: Goal[] }) {
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveGoals(prev, formData);
    if (result.ok) toast.success("Goals saved");
    else if (result.error) toast.error(result.error);
    return result;
  }, { ok: false });

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[1fr_6rem_6rem] gap-3 text-xs font-medium text-muted-foreground">
            <span />
            <span>At least</span>
            <span>At most</span>
          </div>
          {NUTRIENTS.map(({ key, label, unit }) => {
            const goal = goals.find((g) => g.nutrient === key);
            return (
              <div key={key} className="grid grid-cols-[1fr_6rem_6rem] items-center gap-3">
                <span className="text-sm font-medium">
                  {label} <span className="font-normal text-muted-foreground">({unit})</span>
                </span>
                {(["min", "max"] as const).map((bound) => (
                  <Input
                    key={bound}
                    name={`${key}.${bound}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    defaultValue={goal?.[bound] ?? ""}
                    aria-label={`${label} ${bound === "min" ? "at least" : "at most"}`}
                    className="tabular-nums"
                  />
                ))}
              </div>
            );
          })}
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Save goals"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
