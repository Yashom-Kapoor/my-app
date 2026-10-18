"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MUSCLE_GROUPS, equipmentLabel, type Exercise, type MuscleGroup } from "@/lib/workouts";
import { CreateExerciseForm } from "../_components/exercise-picker";

export function ExerciseLibrary({ exercises }: { exercises: Exercise[] }) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [creating, setCreating] = useState(false);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = exercises.filter(
      (e) => (muscle === "all" || e.muscle_group === muscle) && (!q || e.name.toLowerCase().includes(q)),
    );
    return MUSCLE_GROUPS.map((m) => ({ ...m, items: shown.filter((e) => e.muscle_group === m.key) })).filter((g) => g.items.length);
  }, [exercises, query, muscle]);

  return (
    <div className="space-y-4">
      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle>New exercise</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateExerciseForm defaultName={query.trim()} onCreated={() => setCreating(false)} onCancel={() => setCreating(false)} />
          </CardContent>
        </Card>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
          <PlusIcon /> Create custom exercise
        </Button>
      )}

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="pl-8" aria-label="Search exercises" />
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {[{ key: "all" as const, label: "All" }, ...MUSCLE_GROUPS].map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMuscle(m.key)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground",
              muscle === m.key && "border-foreground bg-foreground text-background",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {groups.length === 0 && <p className="text-sm text-muted-foreground">No exercises match.</p>}
      {groups.map((g) => (
        <section key={g.key} className="space-y-1">
          <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.label}</h2>
          <Card size="sm">
            <CardContent>
              <ul className="divide-y">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <Link href={`/workouts/exercises/${e.id}`} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {equipmentLabel(e.equipment)}
                        {e.user_id && " · Custom"}
                      </span>
                      <ChevronRightIcon className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
