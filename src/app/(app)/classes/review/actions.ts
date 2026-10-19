"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rate, type CardState, type Grade } from "@/lib/classes/cards/fsrs";
import { shouldApplyRating } from "@/lib/classes/cards/rate-guard";
import type { ActionState } from "../actions";
import { getCards, getExtraQueue, getStudyOverview, type ReviewCard } from "./data";

const gradeSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

/**
 * Rate one card. Skips (ok: false) when the card changed since the client saw it, so a double
 * tap or stale session never applies twice. No refresh(): the session client advances itself.
 */
export async function rateCard(
  id: string,
  grade: Grade,
  seenLastReview: string | null,
  seconds: number,
): Promise<{ ok: boolean; lastReview?: string | null }> {
  const g = gradeSchema.safeParse(grade);
  if (!g.success) return { ok: false };
  const supabase = await createClient();
  const { data: card } = await supabase
    .from("cards")
    .select("due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!card || card.deleted_at !== null) return { ok: false };
  if (!shouldApplyRating(card.last_review, seenLastReview)) return { ok: false };

  const { next, log } = rate(
    {
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsed_days,
      scheduled_days: card.scheduled_days,
      learning_steps: card.learning_steps,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state as CardState["state"],
      last_review: card.last_review,
    },
    g.data,
    new Date(),
  );

  // Compare-and-set on last_review so two racing requests cannot both write.
  let update = supabase.from("cards").update(next).eq("id", id).is("deleted_at", null);
  update = card.last_review === null ? update.is("last_review", null) : update.eq("last_review", card.last_review);
  const { data: updated, error } = await update.select("id");
  if (error || !updated?.length) return { ok: false };

  const { error: logError } = await supabase.from("card_reviews").insert({
    card_id: id,
    rating: log.rating,
    state_before: log.state_before,
    state_after: log.state_after,
    scheduled_days: log.scheduled_days,
    seconds: Math.round(Math.min(600, Math.max(0, Number.isFinite(seconds) ? seconds : 0))),
  });
  return logError ? { ok: false } : { ok: true, lastReview: next.last_review };
}

export async function deleteCard(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("cards")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", z.string().uuid().parse(id));
  if (error) throw new Error(error.message);
}

const settingsSchema = z.object({
  target_date: z.union([z.literal(""), z.string().date()]).optional(),
  budget_minutes: z.coerce.number().int().min(5).max(300),
});

export async function saveStudySettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = settingsSchema.safeParse({
    target_date: formData.get("target_date") ?? "",
    budget_minutes: formData.get("budget_minutes"),
  });
  if (!parsed.success) return { ok: false, error: "Minutes must be 5 to 300 and the date valid" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("study_settings")
    .upsert(
      { target_date: parsed.data.target_date || null, budget_minutes: parsed.data.budget_minutes },
      { onConflict: "user_id" },
    );
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

const idsSchema = z.array(z.string().uuid()).max(500);

/** Cards for the next page of the client's queue. */
export async function loadCards(ids: string[]): Promise<ReviewCard[]> {
  return getCards(idsSchema.parse(ids));
}

/**
 * Called when the client has nothing left. First re-plans today (learning cards come due again
 * during a long session); only if that is empty, offers the next not-yet-introduced cards beyond
 * the budget. `heldIds` are unrated cards the client still holds. Rated cards are excluded server-side.
 */
export async function loadMoreCards(heldIds: string[]): Promise<{ ids: string[]; cards: ReviewCard[] }> {
  const held = new Set(idsSchema.parse(heldIds));
  const replanned = (await getStudyOverview()).queue.filter((id) => !held.has(id));
  const ids = replanned.length ? replanned.slice(0, 50) : await getExtraQueue(20, [...held]);
  return { ids, cards: await getCards(ids) };
}
