"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DUE_GROUP_LABELS, type DueGroup } from "@/lib/classes/format";
import { setDone } from "../actions";

export type DueItem = {
  id: string;
  title: string;
  url: string | null;
  course: string;
  group: DueGroup;
  dueLabel: string | null;
  relative: string | null;
  lateLabel: string | null;
  statusLabel: string | null;
  /** Submitted, or graded with nothing left to do, on Gradescope. */
  complete: boolean;
  /** Graded below the max while submissions are still open: work in progress. */
  partial: boolean;
  done: boolean;
};

const ORDER: DueGroup[] = ["overdue", "today", "week", "later", "undated"];

export function DueList({ items }: { items: DueItem[] }) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(items, (state, { id, done }: { id: string; done: boolean }) =>
    state.map((i) => (i.id === id ? { ...i, done } : i)),
  );

  const isComplete = (i: DueItem) => i.complete || i.done;
  // Completed work that's past due isn't useful even with "show completed" on.
  const visible = optimistic.filter((i) => !isComplete(i) || (showCompleted && i.group !== "overdue"));
  const completedCount = optimistic.filter((i) => isComplete(i) && i.group !== "overdue").length;

  const toggle = (item: DueItem) =>
    startTransition(async () => {
      setOptimistic({ id: item.id, done: !item.done });
      await setDone(item.id, !item.done);
    });

  return (
    <div className="space-y-4">
      {visible.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing due. Nice.</p>
      )}
      {ORDER.map((group) => {
        const rows = visible.filter((i) => i.group === group);
        if (!rows.length) return null;
        return (
          <section key={group} className="space-y-1">
            <h3
              className={cn(
                "text-xs font-medium uppercase tracking-wide text-muted-foreground",
                group === "overdue" && "text-destructive",
              )}
            >
              {DUE_GROUP_LABELS[group]}
            </h3>
            <ul className="divide-y">
              {rows.map((item) => (
                <li key={item.id} className={cn("flex items-start gap-3 py-2.5", isComplete(item) && "opacity-50")}>
                  <input
                    type="checkbox"
                    checked={isComplete(item)}
                    disabled={item.complete}
                    onChange={() => toggle(item)}
                    aria-label={item.done ? "Mark not done" : "Mark done"}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                        {item.course}
                      </span>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn("truncate text-sm font-medium hover:underline", item.done && "line-through")}
                        >
                          {item.title}
                        </a>
                      ) : (
                        <span className={cn("truncate text-sm font-medium", item.done && "line-through")}>
                          {item.title}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {item.partial && !item.done && (
                        <span className="mr-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                          In progress
                        </span>
                      )}
                      {[item.dueLabel, item.lateLabel, item.statusLabel].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  {item.relative && !isComplete(item) && (
                    <span
                      className={cn(
                        "shrink-0 text-xs tabular-nums",
                        group === "overdue" ? (item.partial ? "text-amber-700 dark:text-amber-400" : "text-destructive") : group === "today" ? "font-medium" : "text-muted-foreground",
                      )}
                    >
                      {item.relative}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {completedCount > 0 && (
        <Button variant="link" size="sm" className="px-0" onClick={() => setShowCompleted((v) => !v)}>
          {showCompleted ? "Hide completed" : `Show completed (${completedCount})`}
        </Button>
      )}
    </div>
  );
}
