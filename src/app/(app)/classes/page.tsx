import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileStackIcon, LayersIcon, SettingsIcon, TriangleAlertIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROVIDER_LABELS, age, currentTime } from "@/lib/classes/format";
import type { Provider } from "@/lib/classes/types";
import { getDeckSize, getAnnouncements, getAssignments, getConnections, getCourses, getWaitingMaterialCount } from "./data";
import { AutoSync } from "./_components/auto-sync";
import { DueList } from "./_components/due-list";
import { Inbox } from "./_components/inbox";
import { SyncButton } from "./_components/sync-button";
import { getStudyOverview } from "./review/data";
import { toDueItems, toInboxItems } from "./view";

export const metadata: Metadata = { title: "Classes" };
// Syncing several sources can take a while; this also covers the page's server actions.
export const maxDuration = 60;

export default function ClassesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Header syncLabel={null} />}>
        <ClassesView />
      </Suspense>
    </div>
  );
}

function Header({ syncLabel }: { syncLabel: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>
      <div className="flex items-center gap-1">
        <SyncButton label={syncLabel} />
        <Link href="/classes/settings" aria-label="Classes settings" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <SettingsIcon />
        </Link>
      </div>
    </div>
  );
}

async function ClassesView() {
  const [connections, assignments, announcements, courses, waiting] = await Promise.all([
    getConnections(),
    getAssignments(),
    getAnnouncements(),
    getCourses(),
    getWaitingMaterialCount(),
  ]);
  const now = currentTime();

  if (!connections.length) {
    return (
      <>
        <Header syncLabel={null} />
        <Card>
          <CardHeader>
            <CardTitle>Connect your classes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Link Gradescope for due dates, and bCourses and Ed for announcements.</p>
            <Link href="/classes/settings" className={buttonVariants()}>
              Set up sources
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const lastSynced = connections
    .map((c) => c.last_synced_at)
    .filter((t): t is string => !!t)
    .sort()
    .at(-1);
  const broken = connections.filter((c) => c.status !== "ok");

  const due = toDueItems(assignments, now);
  const inbox = toInboxItems(announcements, now);
  const unread = inbox.filter((i) => !i.read).length;

  return (
    <>
      <AutoSync />
      <Header syncLabel={lastSynced ? `Synced ${age(lastSynced, now)} ago` : "Not synced yet"} />

      {broken.map((c) => (
        <Link
          key={c.provider}
          href="/classes/settings"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            <span className="font-medium">
              {PROVIDER_LABELS[c.provider as Provider]} {c.status === "expired" ? "disconnected" : "sync failed"}.
            </span>{" "}
            <span className="text-muted-foreground">
              {c.status === "expired" ? "Reconnect in settings." : (c.last_error ?? "Check settings.")}
            </span>
          </span>
        </Link>
      ))}

      {waiting > 0 && (
        <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <FileStackIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            <span className="font-medium">
              {waiting} new {waiting === 1 ? "material" : "materials"} waiting.
            </span>{" "}
            <span className="text-muted-foreground">
              Run <code className="rounded bg-muted px-1 py-0.5 text-xs">/ingest-materials</code> in Claude Code to
              transcribe them.
            </span>
          </span>
        </div>
      )}

      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-muted" />}>
        <ReviewCard />
      </Suspense>

      <nav aria-label="Classes" className="flex flex-wrap gap-2">
        {courses
          .filter((c) => !c.hidden)
          .map((c) => (
            <Link key={c.id} href={`/classes/${c.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {c.code}
            </Link>
          ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Due</CardTitle>
        </CardHeader>
        <CardContent>
          <DueList items={due} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Inbox
            {unread > 0 && (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground tabular-nums">
                {unread}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Inbox items={inbox} />
        </CardContent>
      </Card>
    </>
  );
}

/** Streams in on its own: the planner loads every card, so it must not block the rest of the page. */
async function ReviewCard() {
  const deckSize = await getDeckSize();
  if (deckSize === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border p-3 text-sm">
        <LayersIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <span>
          <span className="font-medium">No cards yet</span>{" "}
          <span className="text-muted-foreground">
            · run <code className="rounded bg-muted px-1 py-0.5 text-xs">/make-cards</code> in Claude Code
          </span>
        </span>
      </div>
    );
  }

  const { estMinutes, pace, queue } = await getStudyOverview();
  // N is today's queue length (what the session will actually show), not plan.dueCount (reviews only).
  const n = queue.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{n > 0 ? `${n} due · ~${estMinutes} min` : "All caught up for today"}</p>
          <Link href="/classes/review" className={buttonVariants({ size: "sm" })}>
            Start
          </Link>
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
                className={pace.behindBy > 0 ? "h-full bg-destructive" : "h-full bg-primary"}
                style={{ width: `${pace.percent}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {pace.behindBy > 0 ? `Backlog ${pace.percent}% · behind by ${pace.behindBy}` : `Backlog ${pace.percent}% · on track`}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
