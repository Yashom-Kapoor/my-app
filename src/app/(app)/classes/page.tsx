import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SettingsIcon, TriangleAlertIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PROVIDER_LABELS,
  age,
  currentTime,
  dueGroup,
  formatDateTime,
  formatScore,
  parseScore,
  relativeTime,
} from "@/lib/classes/format";
import type { Provider } from "@/lib/classes/types";
import { getAnnouncements, getAssignments, getConnections } from "./data";
import { AutoSync } from "./_components/auto-sync";
import { DueList, type DueItem } from "./_components/due-list";
import { Inbox, type InboxItem } from "./_components/inbox";
import { SyncButton } from "./_components/sync-button";

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
  const [connections, assignments, announcements] = await Promise.all([
    getConnections(),
    getAssignments(),
    getAnnouncements(),
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

  const due: DueItem[] = assignments.map((a) => {
    const lateOpen = !!a.late_due_at && Date.parse(a.late_due_at) > now;
    const canSubmit = lateOpen || (!!a.due_at && Date.parse(a.due_at) > now);
    // Online assignments score each answer as it's saved, so a graded score below the max with
    // submissions still open means the work isn't finished yet.
    const score = parseScore(a.score);
    const partial = a.status === "graded" && !!score && score.earned < score.max && canSubmit;
    return {
      id: a.id,
      title: a.title,
      url: a.url,
      course: a.course.code,
      group: dueGroup(a.due_at, now),
      dueLabel: a.due_at ? `Due ${formatDateTime(a.due_at)}` : null,
      relative: a.due_at ? relativeTime(a.due_at, now) : null,
      lateLabel:
        lateOpen && a.due_at && Date.parse(a.due_at) < now ? `Late until ${formatDateTime(a.late_due_at!)}` : null,
      statusLabel: partial
        ? formatScore(score)
        : a.status === "graded"
          ? a.score
          : a.status === "submitted"
            ? "Submitted"
            : null,
      complete: a.status === "submitted" || (a.status === "graded" && !partial),
      partial,
      done: !!a.done_at,
    };
  });

  const inbox: InboxItem[] = announcements.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    author: a.author,
    url: a.url,
    source: a.source,
    courseId: a.course.id,
    course: a.course.code,
    age: age(a.posted_at, now),
    postedLabel: formatDateTime(a.posted_at),
    read: !!a.read_at,
  }));
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
