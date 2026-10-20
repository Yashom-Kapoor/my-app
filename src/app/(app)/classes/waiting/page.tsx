import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ExternalLinkIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KIND_LABELS, type MaterialKind } from "@/lib/classes/materials/types";
import { cn } from "@/lib/utils";
import { getMaterialsNeedingCards, getWaitingMaterials } from "../data";

export const metadata: Metadata = { title: "Waiting" };

const STATUS_CHIPS: Record<string, string> = { pending: "Waiting", processing: "Processing", failed: "Failed" };

type Group<T> = { courseId: string; code: string; items: T[] };

function groupByClass<T extends { course: { id: string; code: string } }>(rows: T[]): Group<T>[] {
  const groups = new Map<string, Group<T>>();
  for (const r of rows) {
    const g = groups.get(r.course.id) ?? { courseId: r.course.id, code: r.course.code, items: [] };
    g.items.push(r);
    groups.set(r.course.id, g);
  }
  return [...groups.values()].sort((a, b) => a.code.localeCompare(b.code));
}

const kindLabel = (kind: string) => KIND_LABELS[kind as MaterialKind] ?? kind;

export default function WaitingPage() {
  return (
    <div className="space-y-6">
      <Link href="/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Classes
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Waiting</h1>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-muted" />}>
        <Waiting />
      </Suspense>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>;
}

async function Waiting() {
  const [waiting, needCards] = await Promise.all([getWaitingMaterials(), getMaterialsNeedingCards()]);

  if (!waiting.length && !needCards.length) {
    return <p className="text-sm text-muted-foreground">All caught up. Nothing is waiting.</p>;
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Waiting to transcribe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {waiting.length ? (
            <>
              <p className="text-sm text-muted-foreground">
                Run <Code>/ingest-materials</Code> in Claude Code.
              </p>
              {groupByClass(waiting).map((g) => (
                <div key={g.courseId} className="space-y-1">
                  <h2 className="text-sm font-medium">{g.code}</h2>
                  <ul className="divide-y">
                    {g.items.map((m) => {
                      const ready = m.status === "ready";
                      const row = (
                        <>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{m.title}</span>
                            <span className="block text-xs text-muted-foreground">{kindLabel(m.kind)}</span>
                            {m.status === "failed" && m.error && (
                              <span className="block text-xs text-destructive">{m.error}</span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-2 py-0.5 text-xs",
                              m.status === "failed" ? "border-destructive/40 text-destructive" : "text-muted-foreground",
                            )}
                          >
                            {STATUS_CHIPS[m.status] ?? m.status}
                          </span>
                          {!ready && <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />}
                        </>
                      );
                      return (
                        <li key={m.id}>
                          {ready ? (
                            <Link href={`/classes/${m.course_id}/m/${m.id}`} className="flex items-center gap-2 py-2 text-sm">
                              {row}
                            </Link>
                          ) : (
                            <a href={m.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-2 text-sm">
                              {row}
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Need cards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {needCards.length ? (
            <>
              <p className="text-sm text-muted-foreground">
                Run <Code>/make-cards</Code> in Claude Code.
              </p>
              {groupByClass(needCards).map((g) => (
                <div key={g.courseId} className="space-y-1">
                  <h2 className="text-sm font-medium">{g.code}</h2>
                  <ul className="divide-y">
                    {g.items.map((m) => (
                      <li key={m.id}>
                        <Link href={`/classes/${m.course_id}/m/${m.id}`} className="flex items-center gap-2 py-2 text-sm">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{m.title}</span>
                            <span className="block text-xs text-muted-foreground">
                              {kindLabel(m.kind)}
                              {m.cards_hash != null && " · stale"}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
