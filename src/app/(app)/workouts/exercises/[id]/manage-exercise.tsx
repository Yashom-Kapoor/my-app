"use client";

import { useState } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Exercise } from "@/lib/workouts";
import { deleteExercise } from "../../actions";
import { EditExerciseForm } from "../../_components/exercise-picker";

/** Edit / delete controls for a custom exercise. */
export function ManageExercise({ exercise, workouts, templates }: { exercise: Exercise; workouts: number; templates: number }) {
  const [editing, setEditing] = useState(false);

  const uses = [
    workouts && `${workouts} workout${workouts === 1 ? "" : "s"}`,
    templates && `${templates} template${templates === 1 ? "" : "s"}`,
  ].filter(Boolean);
  const message = uses.length
    ? `Delete “${exercise.name}”? It's used in ${uses.join(" and ")}. Its logged sets will be deleted and it will be removed from those templates. This can't be undone.`
    : `Delete “${exercise.name}”? This can't be undone.`;

  if (editing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Edit exercise</CardTitle>
        </CardHeader>
        <CardContent>
          <EditExerciseForm exercise={exercise} onDone={() => setEditing(false)} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" onClick={() => setEditing(true)}>
        <PencilIcon /> Edit
      </Button>
      <form
        action={deleteExercise.bind(null, exercise.id)}
        onSubmit={(e) => {
          if (!confirm(message)) e.preventDefault();
        }}
      >
        <Button type="submit" variant="destructive" className="w-full">
          <Trash2Icon /> Delete
        </Button>
      </form>
    </div>
  );
}
