import "server-only";
import { createClient } from "@/lib/supabase/server";
import { dateOf, today } from "@/lib/dates";
import { fetchAll } from "@/lib/classes/cards/fetch-all";
import { isGraduated, type CardState } from "@/lib/classes/cards/fsrs";
import {
  alternateCourses,
  cardStatus,
  explainBudget,
  pace,
  planDay,
  secondsPerCard,
  summarizeQueue,
  unlockedConcepts,
  type Breakdown,
  type CardStatus,
  type Level,
  type PlanCard,
} from "@/lib/classes/cards/plan";

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
          "id, level, concept_id, state, due, course_id, material_id, reps, scheduled_days, concept:concepts!concept_id!inner ( position, deleted_at ), material:materials ( sort_date ), course:courses!inner ( hidden )",
        )
        .is("deleted_at", null)
        .eq("course.hidden", false)
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

  const unlockedConceptIds = unlockedConcepts(
    rows.map((r) => ({
      concept_id: r.concept_id,
      level: r.level as Level,
      graduated: isGraduated({ state: r.state } as CardState),
    })),
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

  return { cards, rows, unlockedConceptIds, now, day, target, budgetMinutes, introducedToday, spentSecondsToday, perCard };
}

/**
 * Plans the whole day (one shared budget), then, when `courseId` is given, keeps only that class's
 * cards. An unknown, hidden or unowned course has no cards, so the result is empty.
 */
export async function getStudyOverview(courseId?: string): Promise<{
  dueCount: number;
  estMinutes: number;
  pace: { percent: number; behindBy: number } | null;
  queue: string[];
  breakdown: Breakdown;
  spentMinutes: number;
  budgetMinutes: number;
  /** New explain cards planned per day to meet the target date; null with no target. */
  explainPerDay: number | null;
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

  let { queue, dueCount, estMinutes, breakdown } = plan;
  if (courseId) {
    const inCourse = new Set(cards.filter((c) => c.course_id === courseId).map((c) => c.id));
    queue = queue.filter((id) => inCourse.has(id));
    ({ dueCount, estMinutes, breakdown } = summarizeQueue(queue, cards, perCard));
  }

  const scoped = courseId ? cards.filter((c) => c.course_id === courseId) : cards;
  const explain = scoped.filter((c) => c.level === "explain");
  const capacity = Math.max(1, Math.floor((budgetMinutes * 60) / Math.max(1, perCard.explain)));
  const perDay = target
    ? explainBudget(explain.filter((c) => !c.introduced).length + introducedToday.explain, day, target)
    : null;
  return {
    dueCount,
    estMinutes,
    pace: target
      ? pace(explain.length, explain.filter((c) => c.introduced).length, day, target, capacity)
      : null,
    queue,
    breakdown,
    spentMinutes: Math.round(spentSecondsToday / 60),
    budgetMinutes,
    explainPerDay: perDay !== null && Number.isFinite(perDay) ? perDay : null,
  };
}

/**
 * Up to `n` not-yet-introduced cards beyond today's budget, in planner order (explain first, then
 * unlocked deeper), skipping `excludeIds` (cards already in the client's queue). `courseId` limits
 * the candidates to one class.
 */
export async function getExtraQueue(n: number, excludeIds: string[], courseId?: string): Promise<string[]> {
  const { cards, unlockedConceptIds } = await loadPlanningState();
  const skip = new Set(excludeIds);
  const fresh = cards.filter((c) => !c.introduced && !skip.has(c.id) && (!courseId || c.course_id === courseId));
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

export type DeckStats = {
  total: number;
  explainTotal: number;
  explainIntroduced: number;
  byStatus: Record<CardStatus, number>;
  dueToday: number;
  /** Good+Easy share of reviews in the last 30 days for this course's cards; null if none. */
  accuracy30d: number | null;
};

/** Deck numbers for one class. Hidden, unknown or unowned courses have no cards, so everything is zero. */
export async function getDeckStats(courseId: string): Promise<DeckStats> {
  const supabase = await createClient();
  const { rows, unlockedConceptIds, now } = await loadPlanningState();
  const mine = rows.filter((r) => r.course_id === courseId);

  const byStatus: Record<CardStatus, number> = { new: 0, locked: 0, learning: 0, due: 0, review: 0, mastered: 0 };
  let explainTotal = 0;
  let explainIntroduced = 0;
  let dueToday = 0;
  for (const r of mine) {
    const { status, due } = cardStatus(
      { level: r.level as Level, state: r.state, due: r.due, scheduled_days: r.scheduled_days, reps: r.reps, concept_id: r.concept_id },
      unlockedConceptIds,
      now,
    );
    byStatus[status]++;
    // Introduced cards whose due time has passed, including learning cards.
    if (r.reps > 0 && due !== null && Date.parse(due) <= now.getTime()) dueToday++;
    if (r.level === "explain") {
      explainTotal++;
      if (r.reps > 0) explainIntroduced++;
    }
  }

  let accuracy30d: number | null = null;
  if (mine.length > 0) {
    const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const reviews = await fetchAll((from, to) =>
      supabase
        .from("card_reviews")
        .select("id, rating, card:cards!inner ( course_id )")
        .eq("card.course_id", courseId)
        .gte("reviewed_at", since)
        .order("id")
        .range(from, to),
    );
    if (reviews.length > 0) accuracy30d = reviews.filter((r) => r.rating >= 3).length / reviews.length;
  }

  return {
    total: mine.length,
    explainTotal,
    explainIntroduced,
    byStatus,
    dueToday,
    accuracy30d,
  };
}

export type DeckCard = {
  id: string;
  level: Level;
  front: string;
  back: string;
  page: number | null;
  material_id: string;
  material_title: string;
  sort_date: string | null;
  concept_id: string;
  concept_title: string;
  concept_position: number;
  status: CardStatus;
  due: string | null;
};

/** Every live card of one class, ordered by material, then concept position, then card key. */
export async function getDeckCards(courseId: string): Promise<DeckCard[]> {
  const supabase = await createClient();
  const [{ unlockedConceptIds, now }, rows] = await Promise.all([
    loadPlanningState(),
    fetchAll((from, to) =>
      supabase
        .from("cards")
        .select(
          "id, key, level, front, back, page, state, due, reps, scheduled_days, material_id, concept_id, concept:concepts!concept_id!inner ( title, position, deleted_at ), material:materials ( title, sort_date ), course:courses!inner ( hidden )",
        )
        .eq("course_id", courseId)
        .is("deleted_at", null)
        .eq("course.hidden", false)
        .is("concept.deleted_at", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const cmp = <T,>(a: T, b: T) => (a < b ? -1 : a > b ? 1 : 0);
  const withKey = rows.map((r) => {
    const { status, due } = cardStatus(
      { level: r.level as Level, state: r.state, due: r.due, scheduled_days: r.scheduled_days, reps: r.reps, concept_id: r.concept_id },
      unlockedConceptIds,
      now,
    );
    const sortDate = r.material?.sort_date ?? null;
    const card: DeckCard = {
      id: r.id,
      level: r.level as Level,
      front: r.front,
      back: r.back,
      page: r.page,
      material_id: r.material_id,
      material_title: r.material?.title ?? "",
      sort_date: sortDate,
      concept_id: r.concept_id,
      concept_title: r.concept?.title ?? "",
      concept_position: r.concept?.position ?? 0,
      status,
      due,
    };
    return { card, key: r.key as string };
  });
  // Material order matches the planner: sort_date asc, nulls last, then material id.
  withKey.sort((a, b) => {
    const da = a.card.sort_date;
    const db = b.card.sort_date;
    if (da !== db) return da === null ? 1 : db === null ? -1 : cmp(da, db);
    return (
      cmp(a.card.material_id, b.card.material_id) ||
      a.card.concept_position - b.card.concept_position ||
      cmp(a.key, b.key) ||
      cmp(a.card.id, b.card.id)
    );
  });
  return withKey.map((x) => x.card);
}
