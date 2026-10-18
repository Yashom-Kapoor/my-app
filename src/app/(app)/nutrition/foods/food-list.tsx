"use client";

import { useActionState, useMemo, useState } from "react";
import { PencilIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Food } from "@/lib/nutrition";
import { deleteFood, updateFood, type ActionState } from "../actions";
import { FoodFields } from "../_components/macro-fields";

export function FoodList({ foods }: { foods: Food[] }) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods;
  }, [foods, query]);

  if (foods.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No saved foods yet. Log a food with “Save to My foods” checked and it’ll show up here.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="pl-8" aria-label="Search my foods" />
      </div>
      <Card>
        <CardContent>
          <ul className="divide-y">
            {shown.map((food) =>
              editing === food.id ? (
                <li key={food.id} className="py-3">
                  <EditFood food={food} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li key={food.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{food.name}</div>
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {food.serving ? `${food.serving} · ` : ""}
                      {food.calories} kcal · P {food.protein_g} · C {food.carbs_g} · F {food.fat_g} · Fib {food.fiber_g}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(food.id)} aria-label={`Edit ${food.name}`}>
                    <PencilIcon />
                  </Button>
                  <form
                    action={deleteFood.bind(null, food.id)}
                    onSubmit={(e) => {
                      if (!confirm(`Delete “${food.name}”? Past logs keep their numbers.`)) e.preventDefault();
                    }}
                  >
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Delete ${food.name}`}>
                      <Trash2Icon />
                    </Button>
                  </form>
                </li>
              ),
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function EditFood({ food, onDone }: { food: Food; onDone: () => void }) {
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await updateFood(prev, formData);
    if (result.ok) {
      toast.success("Saved");
      onDone();
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, { ok: false });

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={food.id} />
      <FoodFields food={food} idPrefix={`edit-${food.id}`} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
