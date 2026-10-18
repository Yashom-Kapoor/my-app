"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_REST_SECONDS, formatClock, type Exercise } from "@/lib/workouts";
import { ExercisePicker } from "../../_components/exercise-picker";

type Row = { id: string; position: number; target_sets: number; target_reps: string | null; rest_seconds: number; exercise: Exercise };

const REST_OPTIONS = [0, 30, 60, 90, 120, 150, 180, 240, 300];

export function TemplateEditor({ template, initial, library }: { template: { id: string; name: string }; initial: Row[]; library: Exercise[] }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState(initial);

  function fail(message: string) {
    toast.error(message);
    router.refresh();
  }

  async function update(row: Row, patch: Partial<Pick<Row, "target_sets" | "target_reps" | "rest_seconds">>) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("template_exercises").update(patch).eq("id", row.id);
    if (error) fail(error.message);
  }

  async function add(exercise: Exercise) {
    const position = Math.max(-1, ...rows.map((r) => r.position)) + 1;
    const { data, error } = await supabase
      .from("template_exercises")
      .insert({ template_id: template.id, exercise_id: exercise.id, position, rest_seconds: DEFAULT_REST_SECONDS })
      .select("id, position, target_sets, target_reps, rest_seconds")
      .single();
    if (error || !data) return fail(error?.message ?? "Could not add exercise");
    setRows((rs) => [...rs, { ...data, exercise }]);
  }

  async function remove(row: Row) {
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    const { error } = await supabase.from("template_exercises").delete().eq("id", row.id);
    if (error) fail(error.message);
  }

  async function move(index: number, dir: -1 | 1) {
    const a = rows[index];
    const b = rows[index + dir];
    if (!a || !b) return;
    setRows((rs) => {
      const next = [...rs];
      next[index] = { ...b, position: a.position };
      next[index + dir] = { ...a, position: b.position };
      return next;
    });
    const [r1, r2] = await Promise.all([
      supabase.from("template_exercises").update({ position: b.position }).eq("id", a.id),
      supabase.from("template_exercises").update({ position: a.position }).eq("id", b.id),
    ]);
    if (r1.error || r2.error) fail((r1.error ?? r2.error)!.message);
  }

  async function rename(name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === template.name) return;
    const { error } = await supabase.from("workout_templates").update({ name: trimmed }).eq("id", template.id);
    if (error) fail(error.message);
    else toast.success("Renamed");
  }

  return (
    <div className="space-y-4">
      <Input
        defaultValue={template.name}
        onBlur={(e) => rename(e.target.value)}
        aria-label="Template name"
        className="h-10 border-transparent px-1 text-2xl font-semibold tracking-tight shadow-none hover:border-input dark:bg-transparent"
      />

      {rows.length === 0 && <p className="text-sm text-muted-foreground">Add the exercises this workout should start with.</p>}

      {rows.map((row, i) => (
        <Card key={row.id} size="sm">
          <CardContent className="space-y-3">
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate font-medium">{row.exercise.name}</span>
              <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                <ArrowUpIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                <ArrowDownIcon />
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(row)} aria-label={`Remove ${row.exercise.name}`}>
                <XIcon />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Sets</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  defaultValue={row.target_sets}
                  onBlur={(e) => {
                    const v = Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1)));
                    if (v !== row.target_sets) update(row, { target_sets: v });
                  }}
                  className="tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Target reps</span>
                <Input
                  defaultValue={row.target_reps ?? ""}
                  placeholder="8-10"
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== row.target_reps) update(row, { target_reps: v });
                  }}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Rest</span>
                <select
                  value={row.rest_seconds}
                  onChange={(e) => update(row, { rest_seconds: Number(e.target.value) })}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                >
                  {REST_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s === 0 ? "None" : formatClock(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </CardContent>
        </Card>
      ))}

      <ExercisePicker exercises={library} onPick={add} />
    </div>
  );
}
