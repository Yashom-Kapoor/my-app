import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { addDays, currentStreak, formatDay, isDateString, isHit, today, totalsOf } from "@/lib/nutrition";
import { getDailyTotals, getDayLogs, getGoals, getSavedFoods } from "../data";
import { AddFood } from "./add-food";
import { LogList } from "./log-list";
import { MacroProgress } from "./macro-progress";
import { StreakCard } from "./streak-card";

const STREAK_LOOKBACK_DAYS = 366;
const HISTORY_DAYS = 14;

export async function DayView({ searchParams }: { searchParams: PageProps<"/nutrition">["searchParams"] }) {
  const { date: dateParam } = await searchParams;
  const todayStr = today();
  const date = isDateString(dateParam) && dateParam <= todayStr ? dateParam : todayStr;

  const [goals, logs, foods, byDay] = await Promise.all([
    getGoals(),
    getDayLogs(date),
    getSavedFoods(),
    getDailyTotals(todayStr, STREAK_LOOKBACK_DAYS),
  ]);

  const totals = totalsOf(logs);
  const streak = currentStreak(byDay, goals, todayStr);
  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const day = addDays(todayStr, i - (HISTORY_DAYS - 1));
    return { day, hit: isHit(byDay.get(day), goals), logged: byDay.has(day) };
  });

  const isToday = date === todayStr;

  return (
    <div className="space-y-4">
      <StreakCard streak={streak} history={history} today={todayStr} hasGoals={goals.length > 0} />

      <div className="flex items-center justify-between">
        <Link
          href={`/nutrition?date=${addDays(date, -1)}`}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          aria-label="Previous day"
        >
          <ChevronLeftIcon />
        </Link>
        <div className="text-center">
          <div className="font-medium">{isToday ? "Today" : formatDay(date)}</div>
          {!isToday && (
            <Link href="/nutrition" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
              Back to today
            </Link>
          )}
        </div>
        {isToday ? (
          <span className="size-8" />
        ) : (
          <Link
            href={addDays(date, 1) === todayStr ? "/nutrition" : `/nutrition?date=${addDays(date, 1)}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
            aria-label="Next day"
          >
            <ChevronRightIcon />
          </Link>
        )}
      </div>

      <MacroProgress totals={totals} goals={goals} />
      <AddFood date={date} foods={foods} />
      <LogList logs={logs} />
    </div>
  );
}
