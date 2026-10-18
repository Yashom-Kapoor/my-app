"use client";

import { useActionState, useMemo, useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  equipmentLabel,
  muscleLabel,
  type Exercise,
  type MuscleGroup,
} from "@/lib/workouts";
import { createExercise, updateExercise, type ActionState, type CreateExerciseState } from "../actions";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export function ExercisePicker({
  exercises,
  onPick,
  label = "Add exercise",
}: {
  exercises: Exercise[];
  onPick: (exercise: Exercise) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all");
  const [creating, setCreating] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises.filter(
      (e) => (muscle === "all" || e.muscle_group === muscle) && (!q || e.name.toLowerCase().includes(q)),
    );
  }, [exercises, query, muscle]);

  function pick(e: Exercise) {
    onPick(e);
    setOpen(false);
    setQuery("");
    setCreating(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" className="w-full" size="lg" onClick={() => setOpen(true)}>
        <PlusIcon /> {label}
      </Button>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{creating ? "New exercise" : "Choose exercise"}</DialogTitle>
        </DialogHeader>

        {creating ? (
          <CreateExerciseForm defaultName={query.trim()} onCreated={pick} onCancel={() => setCreating(false)} />
        ) : (
          <>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search exercises"
                className="pl-8"
                aria-label="Search exercises"
                autoFocus
              />
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
            <ul className="-mx-1 min-h-0 flex-1 divide-y overflow-y-auto">
              {shown.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => pick(e)} className="w-full rounded-md px-2 py-2 text-left hover:bg-muted/60">
                    <div className="text-sm font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {muscleLabel(e.muscle_group)} · {equipmentLabel(e.equipment)}
                      {e.user_id && " · Custom"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="ghost" onClick={() => setCreating(true)}>
              <PlusIcon /> {query.trim() ? `Create “${query.trim()}”` : "Create custom exercise"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CreateExerciseForm({
  defaultName,
  onCreated,
  onCancel,
}: {
  defaultName?: string;
  onCreated?: (exercise: Exercise) => void;
  onCancel?: () => void;
}) {
  const [formKey, setFormKey] = useState(0);
  const [, action, pending] = useActionState<CreateExerciseState, FormData>(async (prev, formData) => {
    const result = await createExercise(prev, formData);
    if (result.ok && result.id) {
      toast.success("Exercise created");
      setFormKey((k) => k + 1);
      onCreated?.({
        id: result.id,
        user_id: "me",
        name: String(formData.get("name")).trim(),
        muscle_group: formData.get("muscle_group") as Exercise["muscle_group"],
        equipment: formData.get("equipment") as Exercise["equipment"],
        kind: formData.get("kind") as Exercise["kind"],
        archived: false,
        created_at: new Date().toISOString(),
      });
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, { ok: false });

  return (
    <form key={formKey} action={action} className="space-y-3">
      <ExerciseFields defaultName={defaultName} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Back
          </Button>
        )}
      </div>
    </form>
  );
}

function ExerciseFields({ exercise, defaultName }: { exercise?: Exercise; defaultName?: string }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ex-name">Name</Label>
        <Input id="ex-name" name="name" required defaultValue={exercise?.name ?? defaultName} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ex-muscle">Muscle group</Label>
          <select id="ex-muscle" name="muscle_group" className={selectClass} defaultValue={exercise?.muscle_group ?? "chest"}>
            {MUSCLE_GROUPS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ex-equipment">Equipment</Label>
          <select id="ex-equipment" name="equipment" className={selectClass} defaultValue={exercise?.equipment ?? "barbell"}>
            {EQUIPMENT.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Tracks</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" value="weighted" defaultChecked={(exercise?.kind ?? "weighted") === "weighted"} className="accent-foreground" /> Weight × reps
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" value="bodyweight" defaultChecked={exercise?.kind === "bodyweight"} className="accent-foreground" /> Bodyweight reps
          </label>
        </div>
      </fieldset>
    </>
  );
}

export function EditExerciseForm({ exercise, onDone }: { exercise: Exercise; onDone: () => void }) {
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await updateExercise(exercise.id, prev, formData);
    if (result.ok) {
      toast.success("Exercise updated");
      onDone();
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, { ok: false });

  return (
    <form action={action} className="space-y-3">
      <ExerciseFields exercise={exercise} />
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
