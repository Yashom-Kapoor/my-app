"use client";

import { useActionState, useMemo, useState } from "react";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Food } from "@/lib/nutrition";
import { logFood, type ActionState } from "../actions";
import { FoodFields } from "./macro-fields";

type Mode = "saved" | "new";

export function AddFood({ date, foods }: { date: string; foods: Food[] }) {
  const [mode, setMode] = useState<Mode>(foods.length ? "saved" : "new");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Food | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await logFood(prev, formData);
    if (result.ok) {
      toast.success("Logged");
      setSelected(null);
      setQuery("");
      setFormKey((k) => k + 1);
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, { ok: false });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods).slice(0, 8);
  }, [foods, query]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Add food</CardTitle>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs font-medium">
          {(["saved", "new"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-2.5 py-1 text-muted-foreground transition-colors",
                mode === m && "bg-background text-foreground shadow-sm",
              )}
            >
              {m === "saved" ? "My foods" : "New"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <form key={formKey} action={action} className="space-y-4">
          <input type="hidden" name="date" value={date} />

          {mode === "saved" ? (
            selected ? (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <input type="hidden" name="food_id" value={selected.id} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{selected.name}</div>
                  <FoodSummary food={selected} />
                </div>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSelected(null)} aria-label="Clear">
                  <XIcon />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search my foods"
                    className="pl-8"
                    aria-label="Search my foods"
                  />
                </div>
                <ul className="divide-y rounded-lg border">
                  {matches.map((food) => (
                    <li key={food.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(food)}
                        className="w-full px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <div className="text-sm font-medium">{food.name}</div>
                        <FoodSummary food={food} />
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setMode("new")}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
                      >
                        <PlusIcon className="size-4" />
                        {query.trim() ? `Create “${query.trim()}”` : "Add your first food"}
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            )
          ) : (
            <>
              <FoodFields idPrefix="new" defaultName={query.trim() || undefined} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="save" defaultChecked className="size-4 accent-foreground" />
                Save to My foods so I can search it later
              </label>
            </>
          )}

          {(mode === "new" || selected) && (
            <div className="flex items-end gap-3">
              <div className="w-24 space-y-1.5">
                <Label htmlFor="servings">Servings</Label>
                <Input id="servings" name="servings" type="number" inputMode="decimal" min={0.01} step="any" defaultValue={1} />
              </div>
              <Button type="submit" className="flex-1" size="lg" disabled={pending}>
                {pending ? "Logging…" : "Log it"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

function FoodSummary({ food }: { food: Food }) {
  return (
    <div className="text-xs tabular-nums text-muted-foreground">
      {food.serving ? `${food.serving} · ` : ""}
      {food.calories} kcal · P {food.protein_g} · C {food.carbs_g} · F {food.fat_g} · Fib {food.fiber_g}
    </div>
  );
}
