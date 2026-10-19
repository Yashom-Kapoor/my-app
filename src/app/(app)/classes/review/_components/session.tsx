"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeftIcon, MoreVerticalIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Grade } from "@/lib/classes/cards/fsrs";
import { Markdown } from "../../_components/markdown";
import { deleteCard, loadCards, loadMoreCards, rateCard } from "../actions";
import type { ReviewCard } from "../data";
import { removeCurrent, requeueAgain } from "./queue";

const PAGE = 20;
const now = () => Date.now();
const GRADES: { grade: Grade; label: string; className: string }[] = [
  { grade: 1, label: "Again", className: "border-red-500/40 text-red-600 dark:text-red-400" },
  { grade: 2, label: "Hard", className: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  { grade: 3, label: "Good", className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400" },
  { grade: 4, label: "Easy", className: "border-sky-500/40 text-sky-600 dark:text-sky-400" },
];

export function Session({ initialCards, restIds }: { initialCards: ReviewCard[]; restIds: string[] }) {
  const [queue, setQueue] = useState(initialCards);
  const [idx, setIdx] = useState(0);
  const [rest, setRest] = useState(restIds);
  const [revealed, setRevealed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [extraEmpty, setExtraEmpty] = useState(false);
  const [pending, startTransition] = useTransition();
  // Timer starts when a card is shown (thinking time counts), not at "Show answer".
  const shownAt = useRef(0);
  const revealedAt = useRef(0);
  const busy = useRef(false);

  const card = queue[idx];
  // Restart the timer whenever a different card (or queue slot) is on screen.
  const slot = `${idx}:${card?.id ?? ""}`;
  useEffect(() => {
    shownAt.current = now();
    revealedAt.current = 0;
  }, [slot]);
  const advance = () => {
    setRevealed(false);
    setMenu(false);
    setIdx((i) => i + 1);
  };

  const reveal = () => {
    revealedAt.current = now();
    setRevealed(true);
  };

  const rate = async (grade: Grade) => {
    if (!card || busy.current) return;
    // A double tap on "Show answer" must not rate the card.
    if (now() - revealedAt.current < 300) return;
    busy.current = true;
    const seconds = (now() - shownAt.current) / 1000;
    try {
      const res = await rateCard(card.id, grade, card.last_review, seconds);
      if (res.ok) setReviewed((n) => n + 1);
      if (res.ok && grade === 1) {
        // Back in 3 cards, carrying the new last_review so its next rating is not seen as stale.
        const again = { ...card, last_review: res.lastReview ?? card.last_review };
        setQueue((q) => requeueAgain(q, idx, again));
      }
      advance();
    } catch {
      toast.error("Could not save that rating");
    } finally {
      busy.current = false;
    }
  };

  const remove = async () => {
    if (!card || busy.current) return;
    busy.current = true;
    try {
      await deleteCard(card.id);
      // Drop it, and any later Again copy, from the queue (idx is unchanged); the next card slides into this index.
      setQueue((q) => removeCurrent(q, idx).queue);
      toast.success("Card deleted");
      setRevealed(false);
      setMenu(false);
    } catch {
      toast.error("Could not delete the card");
    } finally {
      busy.current = false;
    }
  };

  const keepGoing = () =>
    startTransition(async () => {
      try {
        const ids = rest.slice(0, PAGE);
        if (ids.length) {
          const cards = await loadCards(ids);
          setRest(rest.slice(PAGE));
          append(cards);
          return;
        }
        // Nothing is held (rest is empty and the queue is finished), so no exclusions are needed.
        const more = await loadMoreCards([]);
        if (!more.cards.length) {
          setExtraEmpty(true);
          return;
        }
        append(more.cards);
      } catch {
        toast.error("Could not load more cards");
      }
    });

  const append = (cards: ReviewCard[]) => {
    if (!cards.length) return;
    setQueue(cards);
    setIdx(0);
    setReviewed(0);
    setRevealed(false);
  };

  if (!card) {
    const empty = queue.length === 0 && rest.length === 0 && reviewed === 0;
    return (
      <div className="space-y-6 py-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{empty ? "All caught up for today" : "Session done"}</h1>
        {!empty && (
          <p className="text-muted-foreground">
            {reviewed} {reviewed === 1 ? "card" : "cards"} reviewed
          </p>
        )}
        {extraEmpty ? (
          <p className="text-sm text-muted-foreground">All caught up for today. Nothing new is left to learn.</p>
        ) : (
          <Button size="lg" className="h-11 px-5" disabled={pending} onClick={keepGoing}>
            {rest.length ? "Keep going" : "Learn 20 more"}
          </Button>
        )}
        <div>
          <Link href="/classes" className={buttonVariants({ variant: "ghost" })}>
            Back to Classes
          </Link>
        </div>
      </div>
    );
  }

  const source = `${card.course_code} · ${card.material_title}${card.page ? ` p.${card.page}` : ""}`;
  const total = queue.length;

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link href="/classes" aria-label="Back to Classes" className={buttonVariants({ variant: "ghost", size: "icon" })}>
          <ChevronLeftIcon />
        </Link>
        <div className="flex-1 space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${(idx / total) * 100}%` }} />
          </div>
        </div>
        <span className="text-sm tabular-nums text-muted-foreground">
          {idx + 1} / {total}
        </span>
        <div className="relative">
          <Button variant="ghost" size="icon" aria-label="More" onClick={() => setMenu((m) => !m)}>
            <MoreVerticalIcon />
          </Button>
          {menu && (
            <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border bg-popover p-1 shadow-md">
              <Button variant="ghost" className="w-full justify-start text-destructive" onClick={remove}>
                <Trash2Icon /> Delete card
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-xl border p-4">
        <Markdown>{card.front}</Markdown>
        {revealed && (
          <div className="space-y-4 border-t pt-4">
            <Markdown>{card.back}</Markdown>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Link
                href={`/classes/${card.course_id}/m/${card.material_id}${card.page ? `#p${card.page}` : ""}`}
                className="underline underline-offset-2"
              >
                {source}
              </Link>
              <span className="rounded-full border px-2 py-0.5 capitalize">{card.level}</span>
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 -mx-4 border-t bg-background/90 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        {revealed ? (
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((g) => (
              <Button key={g.grade} variant="outline" className={`h-12 touch-manipulation text-sm ${g.className}`} onClick={() => rate(g.grade)}>
                {g.label}
              </Button>
            ))}
          </div>
        ) : (
          <Button className="h-12 w-full touch-manipulation text-base" onClick={reveal}>
            Show answer
          </Button>
        )}
      </div>
    </div>
  );
}
