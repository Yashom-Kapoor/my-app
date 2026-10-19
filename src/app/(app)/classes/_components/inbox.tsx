"use client";

import { Fragment, useOptimistic, useState, useTransition } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAllRead, markRead } from "../actions";

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  author: string | null;
  url: string | null;
  source: string;
  courseId: string;
  course: string;
  age: string;
  postedLabel: string;
  read: boolean;
};

type Update = { ids: string[] };

/** Body text with bare URLs turned into links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <a key={i} href={part} target="_blank" rel="noreferrer" className="break-all underline">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function Inbox({ items }: { items: InboxItem[] }) {
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimistic, markLocal] = useOptimistic(items, (state, { ids }: Update) =>
    state.map((i) => (ids.includes(i.id) ? { ...i, read: true } : i)),
  );

  const courses = [...new Map(items.map((i) => [i.courseId, i.course])).entries()];
  const visible = courseFilter ? optimistic.filter((i) => i.courseId === courseFilter) : optimistic;
  const unread = visible.filter((i) => !i.read);

  const toggle = (item: InboxItem) => {
    setOpen(open === item.id ? null : item.id);
    if (!item.read)
      startTransition(async () => {
        markLocal({ ids: [item.id] });
        await markRead(item.id);
      });
  };

  const readAll = () =>
    startTransition(async () => {
      markLocal({ ids: unread.map((i) => i.id) });
      await markAllRead(courseFilter ?? undefined);
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {courses.length > 1 &&
          [[null, "All"] as const, ...courses].map(([id, label]) => (
            <button
              key={id ?? "all"}
              type="button"
              onClick={() => setCourseFilter(id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                courseFilter === id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        {unread.length > 0 && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={readAll}>
            Mark all read
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No announcements yet.</p>
      ) : (
        <ul className="divide-y">
          {visible.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-expanded={open === item.id}
                className="flex w-full items-start gap-2 py-2.5 text-left"
              >
                <span
                  aria-label={item.read ? undefined : "Unread"}
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-primary")}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">{item.course}</span>
                    <span className={cn("truncate text-sm", item.read ? "text-muted-foreground" : "font-semibold")}>
                      {item.title}
                    </span>
                  </span>
                  {open !== item.id && (
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.body}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{item.age}</span>
              </button>
              {open === item.id && (
                <div className="space-y-3 pb-4 pl-4">
                  <p className="text-xs text-muted-foreground">
                    {[item.author, item.postedLabel].filter(Boolean).join(" · ")}
                  </p>
                  <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                    <Linkified text={item.body || "(no text)"} />
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                    >
                      Open on {item.source === "ed" ? "Ed" : "bCourses"} <ExternalLinkIcon className="size-3" />
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
