"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDownIcon, ChevronRightIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CardStatus } from "@/lib/classes/cards/plan";
import { cn } from "@/lib/utils";
import { deleteCard, getCardBack } from "../review/actions";
import { Markdown } from "./markdown";

export type DeckRow = {
  id: string;
  level: string;
  front: string;
  page: number | null;
  status: CardStatus;
  label: string;
};
export type DeckGroup = {
  materialId: string;
  title: string;
  concepts: { id: string; title: string; cards: DeckRow[] }[];
};

const STATUS_STYLE: Record<CardStatus, string> = {
  new: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  locked: "bg-muted text-muted-foreground",
  learning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  due: "bg-red-500/10 text-red-700 dark:text-red-300",
  review: "bg-muted text-foreground",
  mastered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};
const SUMMARY: [CardStatus, string][] = [
  ["new", "new"],
  ["learning", "learning"],
  ["due", "due"],
  ["mastered", "mastered"],
];

export function DeckList({ courseId, groups }: { courseId: string; groups: DeckGroup[] }) {
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const visible = groups
    .map((g) => ({ ...g, concepts: g.concepts.map((c) => ({ ...c, cards: c.cards.filter((r) => !deleted.has(r.id)) })).filter((c) => c.cards.length) }))
    .filter((g) => g.concepts.length);

  if (!visible.length) return <p className="py-6 text-center text-sm text-muted-foreground">No cards for this class yet</p>;

  return (
    <div className="space-y-2">
      {visible.map((g) => (
        <Group key={g.materialId} group={g} courseId={courseId} onDeleted={(id) => setDeleted((d) => new Set(d).add(id))} />
      ))}
    </div>
  );
}

function Group({ group, courseId, onDeleted }: { group: DeckGroup; courseId: string; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const all = group.concepts.flatMap((c) => c.cards);
  const summary = SUMMARY.flatMap(([s, word]) => {
    const n = all.filter((c) => c.status === s).length;
    return n ? [`${n} ${word}`] : [];
  }).join(" · ");
  return (
    <section className="rounded-xl border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
      >
        {open ? <ChevronDownIcon className="mt-0.5 size-4 shrink-0" /> : <ChevronRightIcon className="mt-0.5 size-4 shrink-0" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{group.title}</span>
          <span className="block text-xs text-muted-foreground">
            {all.length} {all.length === 1 ? "card" : "cards"}
            {summary && ` · ${summary}`}
          </span>
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          {group.concepts.map((c) => (
            <div key={c.id} className="space-y-1">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.title}</h3>
              <ul className="divide-y rounded-lg border">
                {c.cards.map((r) => (
                  <Row key={r.id} row={r} href={`/classes/${courseId}/m/${group.materialId}`} onDeleted={onDeleted} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Row({ row, href, onDeleted }: { row: DeckRow; href: string; onDeleted: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [back, setBack] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toggle = async () => {
    const opening = !open;
    setOpen(opening);
    if (!opening || back !== null || loading) return;
    setLoading(true);
    try {
      setBack(await getCardBack(row.id));
    } catch {
      toast.error("Could not load the answer", { action: { label: "Retry", onClick: () => void toggle() } });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };
  const remove = () => {
    if (!window.confirm("Delete this card? It will no longer be reviewed.")) return;
    startTransition(async () => {
      try {
        await deleteCard(row.id);
        onDeleted(row.id);
        router.refresh();
        toast.success("Card deleted");
      } catch {
        toast.error("Could not delete the card");
      }
    });
  };
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize">{row.level}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{row.front}</span>
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", STATUS_STYLE[row.status])}>{row.label}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t bg-muted/30 px-3 py-3 text-sm">
          <Markdown>{row.front}</Markdown>
          <hr />
          {back === null ? <p className="text-xs text-muted-foreground">Loading answer…</p> : <Markdown>{back}</Markdown>}
          <div className="flex items-center justify-between">
            <Link
              href={row.page ? `${href}#p${row.page}` : href}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {row.page ? `Source, page ${row.page}` : "Source"}
            </Link>
            <Button variant="ghost" size="sm" disabled={pending} onClick={remove} className="text-destructive">
              <Trash2Icon className="size-4" /> Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
