import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon } from "lucide-react";
import { getExercises } from "../data";
import { ExerciseLibrary } from "./exercise-library";

export const metadata: Metadata = { title: "Exercises" };

export default function ExercisesPage() {
  return (
    <div className="space-y-6">
      <Link href="/workouts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Workouts
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Exercises</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Library />
      </Suspense>
    </div>
  );
}

async function Library() {
  return <ExerciseLibrary exercises={await getExercises()} />;
}
