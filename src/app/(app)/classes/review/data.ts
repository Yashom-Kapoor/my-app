import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dateOf, today } from "@/lib/dates";
import { fetchAll } from "@/lib/classes/cards/fetch-all";
import { isGraduated, type CardState } from "@/lib/classes/cards/fsrs";
import { alternateCourses, pace, planDay, secondsPerCard, type Level, type PlanCard } from "@/lib/classes/cards/plan";

export type ReviewCard = {
  id: string;
  level: Level;
  front: string;
  back: string;
  page: number | null;
  material_id: string;
  course_id: string;
  course_code: string;
  material_title: string;
  last_review: string | null;
};

async function loadPlanningState() {
  const supabase = await createClient();
  const now = new Date();
  const day = today();

  const [rows, settingsRes, recent, history] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("cards")
        .select(
          "id, level, concept_id, state, due, course_id, material_id, reps, concept:concepts!concept_id!inner ( position, deleted_at ), material:materials ( sort_date )",
        )
        .is("deleted_at", null)
        .is("concept.deleted_at", null)
        .order("id")
        .range(from, to),
    ),
    supabase.from("study_settings").select("target_date, budget_minutes").maybeSingle(),
    // Safe lower bound; the exact "today" cut is made with dateOf below.
    fetchAll((from, to) =>
      supabase
        .from("card_reviews")
        .select("id, seconds, state_before, reviewed_at, card:cards ( level )")
        .gte("reviewed_at", new Date(now.getTime() - 36 * 3_600_000).toISOString())
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("card_reviews")
      .select("seconds, card:cards ( level )")
      .not("seconds", "is", null)
      .order("id", { ascending: false })
      .limit(500),
  ]);

  const target = settingsRes.data?.target_date ?? null;
  const budgetMinutes = settingsRes.data?.budget_minutes ?? 60;

  // material rank: sort_date asc nulls last, then material id
  const materials = new Map<string, string | null>();
  for (const r of rows) materials.set(r.material_id, r.material?.sort_date ?? null);
  const ranked = [...materials.entries()].sort(([ia, da], [ib, db]) => {
    if (da !== db) return da === null ? 1 : db === null ? -1 : da < db ? -1 : 1;
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
  const order = new Map(ranked.map(([id], i) => [id, i]));

  const cards: PlanCard[] = rows.map((r) => ({
    id: r.id,
    level: r.level as Level,
    concept_id: r.concept_id,
    state: r.state,
    due: r.due,
    course_id: r.course_id,
    material_order: order.get(r.material_id) ?? 0,
    concept_position: r.concept?.position ?? 0,
    introduced: r.reps > 0,
  }));

  const unlockedConceptIds = new Set(
    rows.filter((r) => r.level === "explain" && isGraduated({ state: r.state } as CardState)).map((r) => r.concept_id),
  );

  const todays = recent.filter((r) => dateOf(r.reviewed_at) === day);
  const introducedToday = { explain: 0, deeper: 0 };
  for (const r of todays) {
    if (r.state_before !== 0) continue;
    if (r.card?.level === "explain") introducedToday.explain++;
    else introducedToday.deeper++;
  }
  const spentSecondsToday = todays.reduce((s, r) => s + (r.seconds ?? 0), 0);

  const perCard = secondsPerCard(
    (history.data ?? []).flatMap((h) =>
      h.card && h.seconds !== null ? [{ level: h.card.level as Level, seconds: h.seconds }] : [],
    ),
  );

  return { cards, unlockedConceptIds, now, day, target, budgetMinutes, introducedToday, spentSecondsToday, perCard };
}

export async function getStudyOverview(): Promise<{
  dueCount: number;
  estMinutes: number;
  pace: { percent: number; behindBy: number } | null;
  queue: string[];
}> {
  const { cards, unlockedConceptIds, now, day, target, budgetMinutes, introducedToday, spentSecondsToday, perCard } =
    await loadPlanningState();
  const plan = planDay({
    cards,
    unlockedConceptIds,
    now,
    today: day,
    target,
    budgetMinutes,
    introducedToday,
    spentSecondsToday,
    perCard,
  });

  const explain = cards.filter((c) => c.level === "explain");
  const capacity = Math.floor((budgetMinutes * 60) / perCard.explain);
  return {
    dueCount: plan.dueCount,
    estMinutes: plan.estMinutes,
    pace: target
      ? pace(explain.length, explain.filter((c) => c.introduced).length, day, target, capacity)
      : null,
    queue: plan.queue,
  };
}

/**
 * Up to `n` not-yet-introduced cards beyond today's budget, in planner order (explain first, then
 * unlocked deeper), skipping `excludeIds` (cards already in the client's queue).
 */
export async function getExtraQueue(n: number, excludeIds: string[]): Promise<string[]> {
  const { cards, unlockedConceptIds } = await loadPlanningState();
  const skip = new Set(excludeIds);
  const fresh = cards.filter((c) => !c.introduced && !skip.has(c.id));
  const explain = fresh.filter((c) => c.level === "explain");
  const deeper = fresh.filter(
    (c) => c.level !== "explain" && c.concept_id !== null && unlockedConceptIds.has(c.concept_id),
  );
  return [...alternateCourses(explain), ...alternateCourses(deeper)].slice(0, n).map((c) => c.id);
}

/** Cards for the given ids, in the order of `ids`. */
export async function getCards(ids: string[]): Promise<ReviewCard[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("cards")
        .select(
          "id, level, front, back, page, material_id, course_id, last_review, course:courses ( code ), material:materials ( title )",
        )
        .in("id", chunk)
        .is("deleted_at", null),
    ),
  );
  const byId = new Map<string, ReviewCard>();
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      byId.set(c.id, {
        id: c.id,
        level: c.level as Level,
        front: c.front,
        back: c.back,
        page: c.page,
        material_id: c.material_id,
        course_id: c.course_id,
        course_code: c.course?.code ?? "",
        material_title: c.material?.title ?? "",
        last_review: c.last_review,
      });
    }
  }
  return ids.flatMap((id) => {
    const c = byId.get(id);
    return c ? [c] : [];
  });
}

export async function getStudySettings(): Promise<{ target_date: string | null; budget_minutes: number }> {
  const supabase = await createClient();
  const { data } = await supabase.from("study_settings").select("target_date, budget_minutes").maybeSingle();
  return data ?? { target_date: null, budget_minutes: 60 };
}
