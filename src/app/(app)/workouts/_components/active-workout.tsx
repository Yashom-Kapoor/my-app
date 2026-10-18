"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PlusIcon, TrophyIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  DEFAULT_REST_SECONDS,
  bestsFrom,
  formatClock,
  formatSet,
  setPRs,
  type Bests,
  type Exercise,
  type SetValues,
} from "@/lib/workouts";
import { deleteWorkout, finishWorkout } from "../actions";
import { ExercisePicker } from "./exercise-picker";
import { RestTimer, type RestState } from "./rest-timer";
import { useLocalStorage } from "./use-local-storage";

export type LoggedSet = { id: string; position: number; weight: number | null; reps: number | null; completed_at: string | null };
export type LoggedExercise = {
  id: string;
  position: number;
  rest_seconds: number;
  notes: string | null;
  exercise: Exercise;
  sets: LoggedSet[];
};

type Props = {
  workout: { id: string; name: string; started_at: string };
  initial: LoggedExercise[];
  previous: Record<string, SetValues[]>;
  bests: Record<string, Bests | null>;
  library: Exercise[];
  unit: string;
};

/** Rest that ends `seconds` from now. */
function restFor(seconds: number): RestState {
  return { endsAt: Date.now() + seconds * 1000, duration: seconds };
}

const num = (v: string) => (v.trim() === "" || isNaN(Number(v)) ? null : Number(v));

export function ActiveWorkout({ workout, initial, previous: initialPrevious, bests: initialBests, library, unit }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [exercises, setExercises] = useState(initial);
  const [previous, setPrevious] = useState(initialPrevious);
  const [bests, setBests] = useState(initialBests);
  const [now, setNow] = useState<number | null>(null);
  const [restRaw, setRestRaw] = useLocalStorage(`hub:rest:${workout.id}`);
  const audio = useRef<AudioContext | null>(null);

  const rest = useMemo<RestState | null>(() => {
    try {
      return restRaw ? (JSON.parse(restRaw) as RestState) : null;
    } catch {
      return null;
    }
  }, [restRaw]);
  const setRest = useCallback((r: RestState | null) => setRestRaw(r ? JSON.stringify(r) : null), [setRestRaw]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fail = useCallback(
    (message: string) => {
      toast.error(message);
      router.refresh();
    },
    [router],
  );

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    for (const [i, freq] of [880, 880, 1320].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.2);
    }
  }, []);

  function patchSet(weId: string, setId: string, patch: Partial<LoggedSet>) {
    setExercises((xs) =>
      xs.map((x) => (x.id === weId ? { ...x, sets: x.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) } : x)),
    );
  }

  async function saveSet(weId: string, setId: string, patch: Partial<LoggedSet>) {
    patchSet(weId, setId, patch);
    const { error } = await supabase.from("workout_sets").update(patch).eq("id", setId);
    if (error) fail(error.message);
  }

  async function toggleSet(we: LoggedExercise, set: LoggedSet, index: number) {
    if (set.completed_at) return saveSet(we.id, set.id, { completed_at: null });

    // Fill blanks from last session, then from the set above.
    const prev = previous[we.exercise.id]?.[index];
    const above = we.sets[index - 1];
    const weight = set.weight ?? prev?.weight ?? above?.weight ?? null;
    const reps = set.reps ?? prev?.reps ?? above?.reps ?? null;
    if (reps == null || (we.exercise.kind === "weighted" && weight == null)) {
      toast.error(we.exercise.kind === "weighted" ? "Enter weight and reps" : "Enter reps");
      return;
    }

    // Unlock audio on this tap so the rest timer can beep later (iOS needs a gesture).
    audio.current ??= new AudioContext();
    void audio.current.resume();

    await saveSet(we.id, set.id, { weight, reps, completed_at: new Date().toISOString() });
    if (we.rest_seconds > 0) setRest(restFor(we.rest_seconds));
  }

  async function addSet(we: LoggedExercise) {
    const position = Math.max(-1, ...we.sets.map((s) => s.position)) + 1;
    const { data, error } = await supabase
      .from("workout_sets")
      .insert({ workout_exercise_id: we.id, position })
      .select("id, position, weight, reps, completed_at")
      .single();
    if (error || !data) return fail(error?.message ?? "Could not add set");
    setExercises((xs) => xs.map((x) => (x.id === we.id ? { ...x, sets: [...x.sets, data] } : x)));
  }

  async function removeSet(we: LoggedExercise, set: LoggedSet) {
    setExercises((xs) => xs.map((x) => (x.id === we.id ? { ...x, sets: x.sets.filter((s) => s.id !== set.id) } : x)));
    const { error } = await supabase.from("workout_sets").delete().eq("id", set.id);
    if (error) fail(error.message);
  }

  async function addExercise(exercise: Exercise) {
    const position = Math.max(-1, ...exercises.map((x) => x.position)) + 1;
    const { data: we, error } = await supabase
      .from("workout_exercises")
      .insert({ workout_id: workout.id, exercise_id: exercise.id, position, rest_seconds: DEFAULT_REST_SECONDS })
      .select("id, position, rest_seconds, notes")
      .single();
    if (error || !we) return fail(error?.message ?? "Could not add exercise");

    // Start with as many sets as last time (at least 3).
    const [{ data: last }, { data: history }] = await Promise.all([
      supabase.rpc("last_sets", { exercise_ids: [exercise.id] }),
      supabase.from("exercise_set_history").select("workout_id, weight, reps").eq("exercise_id", exercise.id),
    ]);
    const lastSets = (last ?? []).map((r) => ({ weight: r.weight == null ? null : Number(r.weight), reps: r.reps }));
    const count = Math.max(3, lastSets.length);
    const { data: sets } = await supabase
      .from("workout_sets")
      .insert(Array.from({ length: count }, (_, i) => ({ workout_exercise_id: we.id, position: i })))
      .select("id, position, weight, reps, completed_at");

    const sessions = new Map<string, SetValues[]>();
    for (const h of history ?? []) {
      if (!h.workout_id) continue;
      sessions.set(h.workout_id, [...(sessions.get(h.workout_id) ?? []), { weight: h.weight == null ? null : Number(h.weight), reps: h.reps }]);
    }
    setPrevious((p) => ({ ...p, [exercise.id]: lastSets }));
    setBests((b) => ({ ...b, [exercise.id]: bestsFrom([...sessions.values()]) }));
    setExercises((xs) => [...xs, { ...we, exercise, sets: (sets ?? []).sort((a, b) => a.position - b.position) }]);
  }

  async function removeExercise(we: LoggedExercise) {
    if (we.sets.some((s) => s.completed_at) && !confirm(`Remove ${we.exercise.name} and its sets?`)) return;
    setExercises((xs) => xs.filter((x) => x.id !== we.id));
    const { error } = await supabase.from("workout_exercises").delete().eq("id", we.id);
    if (error) fail(error.message);
  }

  async function move(index: number, dir: -1 | 1) {
    const a = exercises[index];
    const b = exercises[index + dir];
    if (!a || !b) return;
    setExercises((xs) => {
      const next = [...xs];
      next[index] = { ...b, position: a.position };
      next[index + dir] = { ...a, position: b.position };
      return next;
    });
    const [r1, r2] = await Promise.all([
      supabase.from("workout_exercises").update({ position: b.position }).eq("id", a.id),
      supabase.from("workout_exercises").update({ position: a.position }).eq("id", b.id),
    ]);
    if (r1.error || r2.error) fail((r1.error ?? r2.error)!.message);
  }

  async function setRestSeconds(we: LoggedExercise, seconds: number) {
    setExercises((xs) => xs.map((x) => (x.id === we.id ? { ...x, rest_seconds: seconds } : x)));
    const { error } = await supabase.from("workout_exercises").update({ rest_seconds: seconds }).eq("id", we.id);
    if (error) fail(error.message);
  }

  async function rename(name: string) {
    const trimmed = name.trim() || "Workout";
    if (trimmed === workout.name) return;
    const { error } = await supabase.from("workouts").update({ name: trimmed }).eq("id", workout.id);
    if (error) fail(error.message);
  }

  const unchecked = exercises.reduce((n, x) => n + x.sets.filter((s) => !s.completed_at).length, 0);
  const done = exercises.reduce((n, x) => n + x.sets.filter((s) => s.completed_at).length, 0);
  const elapsed = now == null ? null : Math.floor((now - Date.parse(workout.started_at)) / 1000);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Input
          defaultValue={workout.name}
          onBlur={(e) => rename(e.target.value)}
          aria-label="Workout name"
          className="h-10 flex-1 border-transparent px-1 text-xl font-semibold shadow-none hover:border-input dark:bg-transparent"
        />
        <span className="text-sm tabular-nums text-muted-foreground" suppressHydrationWarning>
          {elapsed == null ? "" : formatClock(elapsed)}
        </span>
      </div>

      {exercises.map((we, i) => (
        <ExerciseCard
          key={we.id}
          we={we}
          unit={unit}
          previous={previous[we.exercise.id] ?? []}
          bests={bests[we.exercise.id] ?? null}
          isFirst={i === 0}
          isLast={i === exercises.length - 1}
          onMove={(dir) => move(i, dir)}
          onRemove={() => removeExercise(we)}
          onAddSet={() => addSet(we)}
          onRemoveSet={(s) => removeSet(we, s)}
          onToggle={(s, idx) => toggleSet(we, s, idx)}
          onEdit={(s, patch) => saveSet(we.id, s.id, patch)}
          onRest={(sec) => setRestSeconds(we, sec)}
        />
      ))}

      <ExercisePicker exercises={library} onPick={addExercise} />

      <div className="grid grid-cols-2 gap-2 pt-2">
        <form
          action={deleteWorkout.bind(null, workout.id)}
          onSubmit={(e) => {
            if (!confirm("Discard this workout? Everything logged in it will be deleted.")) e.preventDefault();
            else setRest(null);
          }}
        >
          <Button type="submit" variant="destructive" size="lg" className="w-full">
            Discard
          </Button>
        </form>
        <form
          action={finishWorkout.bind(null, workout.id)}
          onSubmit={(e) => {
            if (done === 0 && !confirm("Nothing is checked off, so this workout will be discarded. Continue?")) e.preventDefault();
            else if (done > 0 && unchecked > 0 && !confirm(`${unchecked} unchecked set${unchecked === 1 ? "" : "s"} will be dropped. Finish?`))
              e.preventDefault();
            else setRest(null);
          }}
        >
          <Button type="submit" size="lg" className="w-full">
            <CheckIcon /> Finish
          </Button>
        </form>
      </div>

      <RestTimer rest={rest} onChange={setRest} beep={beep} />
    </div>
  );
}

const REST_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 240, 300];

function ExerciseCard({
  we,
  unit,
  previous,
  bests,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onAddSet,
  onRemoveSet,
  onToggle,
  onEdit,
  onRest,
}: {
  we: LoggedExercise;
  unit: string;
  previous: SetValues[];
  bests: Bests | null;
  isFirst: boolean;
  isLast: boolean;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onAddSet: () => void;
  onRemoveSet: (s: LoggedSet) => void;
  onToggle: (s: LoggedSet, index: number) => void;
  onEdit: (s: LoggedSet, patch: Partial<LoggedSet>) => void;
  onRest: (seconds: number) => void;
}) {
  const kind = we.exercise.kind;
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1">
          <Link href={`/workouts/exercises/${we.exercise.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
            {we.exercise.name}
          </Link>
          <select
            value={we.rest_seconds}
            onChange={(e) => onRest(Number(e.target.value))}
            aria-label="Rest timer"
            className="h-7 rounded-md bg-transparent px-1 text-xs text-muted-foreground"
          >
            {REST_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? "No rest" : `Rest ${formatClock(s)}`}
              </option>
            ))}
          </select>
          <Button type="button" variant="ghost" size="icon-sm" disabled={isFirst} onClick={() => onMove(-1)} aria-label="Move up">
            <ArrowUpIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" disabled={isLast} onClick={() => onMove(1)} aria-label="Move down">
            <ArrowDownIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${we.exercise.name}`}>
            <XIcon />
          </Button>
        </div>

        {we.notes && <p className="-mt-2 text-xs text-muted-foreground">{we.notes}</p>}

        <div className="grid grid-cols-[1.5rem_1fr_4.5rem_4rem_2.25rem_1.5rem] items-center gap-x-2 gap-y-1.5 text-sm">
          <span className="text-xs font-medium text-muted-foreground">#</span>
          <span className="text-xs font-medium text-muted-foreground">Previous</span>
          <span className="text-xs font-medium text-muted-foreground">{kind === "bodyweight" ? `+${unit}` : unit}</span>
          <span className="text-xs font-medium text-muted-foreground">Reps</span>
          <span />
          <span />
          {we.sets.map((s, i) => (
            <SetRow
              key={s.id}
              set={s}
              index={i}
              kind={kind}
              unit={unit}
              prev={previous[i]}
              bests={bests}
              onToggle={() => onToggle(s, i)}
              onEdit={(patch) => onEdit(s, patch)}
              onRemove={() => onRemoveSet(s)}
            />
          ))}
        </div>

        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={onAddSet}>
          <PlusIcon /> Add set
        </Button>
      </CardContent>
    </Card>
  );
}

function SetRow({
  set,
  index,
  kind,
  unit,
  prev,
  bests,
  onToggle,
  onEdit,
  onRemove,
}: {
  set: LoggedSet;
  index: number;
  kind: Exercise["kind"];
  unit: string;
  prev?: SetValues;
  bests: Bests | null;
  onToggle: () => void;
  onEdit: (patch: Partial<LoggedSet>) => void;
  onRemove: () => void;
}) {
  const done = !!set.completed_at;
  const prs = done ? setPRs(set, kind, bests) : [];
  const cell = cn("h-9 px-2 text-center tabular-nums", done && "border-transparent bg-emerald-500/10 dark:bg-emerald-500/15");

  return (
    <>
      <span className="text-xs font-medium tabular-nums text-muted-foreground">
        {prs.length ? <TrophyIcon className="size-3.5 text-amber-500" aria-label="Personal record" /> : index + 1}
      </span>
      <span className="truncate text-xs tabular-nums text-muted-foreground">{prev ? formatSet(prev, kind, unit) : "—"}</span>
      <Input
        key={`w-${set.weight}`}
        type="number"
        inputMode="decimal"
        step="any"
        min={0}
        defaultValue={set.weight ?? ""}
        placeholder={prev?.weight != null ? String(prev.weight) : kind === "bodyweight" ? "0" : ""}
        aria-label={`Set ${index + 1} weight`}
        className={cell}
        onBlur={(e) => {
          const v = num(e.target.value);
          if (v !== set.weight) onEdit({ weight: v });
        }}
      />
      <Input
        key={`r-${set.reps}`}
        type="number"
        inputMode="numeric"
        step={1}
        min={0}
        defaultValue={set.reps ?? ""}
        placeholder={prev?.reps != null ? String(prev.reps) : ""}
        aria-label={`Set ${index + 1} reps`}
        className={cell}
        onBlur={(e) => {
          const v = num(e.target.value);
          const reps = v == null ? null : Math.round(v);
          if (reps !== set.reps) onEdit({ reps });
        }}
      />
      <Button
        type="button"
        size="icon"
        variant={done ? "default" : "outline"}
        className={cn("size-9", done && "bg-emerald-600 text-white hover:bg-emerald-600/90")}
        onClick={onToggle}
        aria-label={done ? `Uncheck set ${index + 1}` : `Complete set ${index + 1}`}
        aria-pressed={done}
      >
        <CheckIcon />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" onClick={onRemove} aria-label={`Delete set ${index + 1}`}>
        <XIcon />
      </Button>
    </>
  );
}
