import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileStackIcon, SettingsIcon, TriangleAlertIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROVIDER_LABELS, age, currentTime } from "@/lib/classes/format";
import type { Provider } from "@/lib/classes/types";
import { getAnnouncements, getAssignments, getConnections, getCourses, getMaterialsNeedingCards, getWaitingMaterialCount } from "./data";
import { AutoSync } from "./_components/auto-sync";
import { DueList } from "./_components/due-list";
import { Inbox } from "./_components/inbox";
import { SyncButton } from "./_components/sync-button";
import { ReviewCard } from "./_components/review-card";
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
  const [connections, assignments, announcements, courses, waiting, needCards] = await Promise.all([
    getConnections(),
    getAssignments(),
    getAnnouncements(),
    getCourses(),
    getWaitingMaterialCount(),
    getMaterialsNeedingCards().then((m) => m.length),
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
        <Link href="/classes/waiting" className="flex items-start gap-2 rounded-lg border p-3 text-sm">
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
        </Link>
      )}

      {needCards > 0 && (
        <Link href="/classes/waiting" className="flex items-start gap-2 rounded-lg border p-3 text-sm">
          <FileStackIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">
            {needCards} {needCards === 1 ? "material needs" : "materials need"} cards.
          </span>
        </Link>
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
