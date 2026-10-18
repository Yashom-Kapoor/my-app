import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SettingsIcon, UtensilsIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { DayView } from "./_components/day-view";

export const metadata: Metadata = { title: "Nutrition" };

export default function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Nutrition</h1>
        <div className="flex gap-1">
          <Link href="/nutrition/foods" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <UtensilsIcon /> My foods
          </Link>
          <Link href="/nutrition/goals" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <SettingsIcon /> Goals
          </Link>
        </div>
      </div>
      <Suspense fallback={<DayViewSkeleton />}>
        <DayView searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function DayViewSkeleton() {
  return (
    <div className="space-y-4">
      {[24, 40, 56].map((h) => (
        <div key={h} className="animate-pulse rounded-xl bg-muted" style={{ height: `${h * 4}px` }} />
      ))}
    </div>
  );
}
