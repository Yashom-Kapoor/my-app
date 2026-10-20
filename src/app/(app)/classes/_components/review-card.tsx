import Link from "next/link";
import { LayersIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDeckSize } from "../data";
import { getStudyOverview } from "../review/data";

/**
 * Streams in on its own: the planner loads every card, so it must not block the rest of the page.
 * With `courseId` it shows that class's slice of today's (single, shared) plan.
 */
export async function ReviewCard({ courseId, courseCode }: { courseId?: string; courseCode?: string }) {
  const deckSize = await getDeckSize(courseId);
  if (deckSize === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
        <LayersIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          <span className="font-medium">{courseId ? "No cards for this class yet" : "No cards yet"}</span>{" "}
          <span className="text-muted-foreground">
            · run <code className="rounded bg-muted px-1 py-0.5 text-xs">/make-cards</code> in Claude Code
          </span>
        </span>
      </div>
    );
  }

  const { estMinutes, pace, queue, breakdown, spentMinutes, budgetMinutes, explainPerDay } =
    await getStudyOverview(courseId);
  const parts = [
    breakdown.reviews > 0 && `${breakdown.reviews} reviews`,
    breakdown.newExplain > 0 && `${breakdown.newExplain} new`,
    breakdown.newDeeper > 0 && `${breakdown.newDeeper} deeper`,
  ].filter(Boolean);
  const summary = queue.length > 0 && parts.length > 0 ? `${parts.join(" · ")} · ~${estMinutes} min` : "All caught up for today";
  const href = courseId ? `/classes/review?course=${courseId}` : "/classes/review";
  const barPercent = Math.min(100, Math.round((100 * spentMinutes) / Math.max(1, budgetMinutes)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{courseCode ? `Review · ${courseCode}` : "Review"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{summary}</p>
          <Link href={href} className={buttonVariants({ size: "sm" })}>
            Start
          </Link>
        </div>
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-valuenow={barPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Minutes studied today"
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full bg-primary" style={{ width: `${barPercent}%` }} />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {spentMinutes} of {budgetMinutes} min today{courseId ? " (all classes)" : ""}
          </p>
        </div>
        {pace && (
          <div className="space-y-1">
            <div
              role="progressbar"
              aria-valuenow={pace.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Backlog"
              className="h-2 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={!courseId && pace.behindBy > 0 ? "h-full bg-destructive" : "h-full bg-primary"}
                style={{ width: `${pace.percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {courseId
                ? `Backlog ${pace.percent}%`
                : `Backlog ${pace.percent}% · ${pace.behindBy > 0 ? `behind by ${pace.behindBy}` : "on track"}${
                    explainPerDay !== null && explainPerDay > 0 ? ` (~${explainPerDay} new/day)` : ""
                  }`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
