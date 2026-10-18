import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "../_components/back-link";
import { getGoals } from "../data";
import { GoalsForm } from "./goals-form";

export const metadata: Metadata = { title: "Goals" };

export default function GoalsPage() {
  return (
    <div className="space-y-6">
      <BackLink />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily goals</h1>
        <p className="text-sm text-muted-foreground">
          Set a minimum, a maximum, or both. Leave both blank for no goal. A day counts toward your streak when every
          goal is met.
        </p>
      </div>
      <Suspense>
        <Goals />
      </Suspense>
    </div>
  );
}

async function Goals() {
  return <GoalsForm goals={await getGoals()} />;
}
