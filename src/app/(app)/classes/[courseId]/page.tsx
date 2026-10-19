import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeftIcon, ExternalLinkIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { currentTime } from "@/lib/classes/format";
import { KIND_LABELS, type MaterialKind } from "@/lib/classes/materials/types";
import { formatDay, weekStart } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getAnnouncements, getAssignments, getCourse, getMaterials, type MaterialRow } from "../data";
import { DueList } from "../_components/due-list";
import { Inbox } from "../_components/inbox";
import { toDueItems, toInboxItems } from "../view";

export const metadata: Metadata = { title: "Class" };

type Props = PageProps<"/classes/[courseId]">;

export default function CoursePage({ params, searchParams }: Props) {
  return (
    <div className="space-y-6">
      <Link href="/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Classes
      </Link>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Course params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Course({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const [{ courseId }, { tab }] = await Promise.all([params, searchParams]);
  const course = await getCourse(courseId);
  if (!course) notFound();
  const materialsTab = tab === "materials";

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{course.code}</h1>
        <p className="text-sm text-muted-foreground">
          {course.name}
          {course.website_url && (
            <>
              {" · "}
              <a href={course.website_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                Website <ExternalLinkIcon className="size-3" />
              </a>
            </>
          )}
        </p>
      </div>

      <nav className="flex gap-1 border-b" aria-label="Class sections">
        {[
          ["Overview", `/classes/${course.id}`, !materialsTab],
          ["Materials", `/classes/${course.id}?tab=materials`, materialsTab],
        ].map(([label, href, active]) => (
          <Link
            key={label as string}
            href={href as string}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {materialsTab ? <Materials courseId={course.id} /> : <Overview courseId={course.id} />}
    </>
  );
}

async function Overview({ courseId }: { courseId: string }) {
  const [assignments, announcements] = await Promise.all([getAssignments(courseId), getAnnouncements(courseId)]);
  const now = currentTime();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Due</CardTitle>
        </CardHeader>
        <CardContent>
          <DueList items={toDueItems(assignments, now)} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Announcements</CardTitle>
        </CardHeader>
        <CardContent>
          <Inbox items={toInboxItems(announcements, now)} />
        </CardContent>
      </Card>
    </>
  );
}

/** Week heading for a material: the site's own label, else the week its date falls in. */
function weekOf(m: MaterialRow) {
  if (m.week_label) return m.week_label;
  return m.sort_date ? `Week of ${formatDay(weekStart(m.sort_date))}` : "Undated";
}

async function Materials({ courseId }: { courseId: string }) {
  const materials = await getMaterials(courseId);
  if (!materials.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No materials found yet. They appear after the next sync.</p>;
  }

  const ids = new Set(materials.map((m) => m.id));
  const solutionsOf = new Map<string, MaterialRow[]>();
  for (const m of materials) {
    if (m.parent_id && ids.has(m.parent_id)) solutionsOf.set(m.parent_id, [...(solutionsOf.get(m.parent_id) ?? []), m]);
  }
  const top = materials.filter((m) => !(m.parent_id && ids.has(m.parent_id)));

  // Newest week first; materials arrive newest first already.
  const weeks = new Map<string, MaterialRow[]>();
  for (const m of top) weeks.set(weekOf(m), [...(weeks.get(weekOf(m)) ?? []), m]);

  return (
    <div className="space-y-6">
      {[...weeks].map(([week, rows]) => (
        <section key={week} className="space-y-1">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{week}</h2>
          <ul className="divide-y rounded-xl border">
            {rows.map((m) => (
              <li key={m.id} className="px-3 py-2.5">
                <MaterialLink courseId={courseId} material={m} />
                {(solutionsOf.get(m.id) ?? []).map((s) => (
                  <div key={s.id} className="mt-1 pl-4">
                    <MaterialLink courseId={courseId} material={s} small />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = { pending: "Waiting", processing: "Waiting", failed: "Failed" };

function MaterialLink({ courseId, material: m, small }: { courseId: string; material: MaterialRow; small?: boolean }) {
  return (
    <Link href={`/classes/${courseId}/m/${m.id}`} className="flex items-baseline gap-2 hover:underline">
      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium no-underline">
        {KIND_LABELS[m.kind as MaterialKind]}
      </span>
      <span className={cn("min-w-0 flex-1 truncate", small ? "text-xs" : "text-sm font-medium")}>{m.title}</span>
      {m.status !== "ready" && (
        <span
          title={m.error ?? undefined}
          className={cn("shrink-0 text-xs", m.status === "failed" ? "text-destructive" : "text-muted-foreground")}
        >
          {STATUS_LABELS[m.status]}
        </span>
      )}
    </Link>
  );
}
