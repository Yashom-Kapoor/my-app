import "server-only";
import { age, dueGroup, formatDateTime, formatScore, parseScore, relativeTime } from "@/lib/classes/format";
import type { Announcement, Assignment } from "./data";
import type { DueItem } from "./_components/due-list";
import type { InboxItem } from "./_components/inbox";

// Server-side view models for the Due list and Inbox, shared by /classes and the class pages.

export function toDueItems(assignments: Assignment[], now: number): DueItem[] {
  return assignments.map((a) => {
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
}

export function toInboxItems(announcements: Announcement[], now: number): InboxItem[] {
  return announcements.map((a) => ({
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
}
