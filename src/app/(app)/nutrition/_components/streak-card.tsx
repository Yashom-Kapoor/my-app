import Link from "next/link";
import { FlameIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/nutrition";

type Props = {
  streak: number;
  history: { day: string; hit: boolean; logged: boolean }[];
  today: string;
  hasGoals: boolean;
};

export function StreakCard({ streak, history, today, hasGoals }: Props) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              streak > 0 ? "bg-orange-500/15 text-orange-500" : "bg-muted text-muted-foreground",
            )}
          >
            <FlameIcon className="size-5" />
          </div>
          <div>
            <div className="text-lg font-semibold leading-tight">
              {streak} day{streak === 1 ? "" : "s"}
            </div>
            <div className="text-xs text-muted-foreground">
              {hasGoals ? (
                "streak of hitting every goal"
              ) : (
                <Link href="/nutrition/goals" className="underline underline-offset-2">
                  Set your goals to start a streak
                </Link>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-1" aria-label="Last 14 days">
          {history.map(({ day, hit, logged }) => {
            const pending = day === today && !hit;
            return (
              <Link
                key={day}
                href={day === today ? "/nutrition" : `/nutrition?date=${day}`}
                title={`${formatDay(day)}: ${hit ? "hit" : pending ? "in progress" : logged ? "missed" : "nothing logged"}`}
                className={cn(
                  "h-6 flex-1 rounded-md transition-opacity hover:opacity-80",
                  hit
                    ? "bg-emerald-500"
                    : pending
                      ? "border border-dashed border-muted-foreground/50"
                      : logged
                        ? "bg-destructive/25"
                        : "bg-muted",
                )}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
