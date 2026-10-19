// Pure daily-session planner. Never reads the clock: callers pass `now` and `today`.

export type Level = "explain" | "why" | "apply" | "contrast" | "trap";

export type PlanCard = {
  id: string;
  level: Level;
  /** Non-null for every deeper level; deeper cards are gated on its unlock. */
  concept_id: string | null;
  state: number;
  due: string;
  course_id: string;
  material_order: number;
  concept_position: number;
  /** reps > 0 */
  introduced: boolean;
};

const DEFAULT_SECONDS: Record<Level, number> = { explain: 20, why: 40, apply: 60, contrast: 45, trap: 45 };
const LEVELS = Object.keys(DEFAULT_SECONDS) as Level[];

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);

/** Days from today through target, both counted; <= 0 when target is in the past. */
function daysLeftInclusive(today: string, target: string): number {
  return dayNumber(target) - dayNumber(today) + 1;
}

/** New explain cards to introduce per day; Infinity means "limited only by time". */
export function explainBudget(remainingExplain: number, today: string, target: string | null): number {
  if (!target) return Infinity;
  const days = daysLeftInclusive(today, target);
  if (days <= 0) return Infinity;
  return Math.max(0, Math.ceil(remainingExplain / days));
}

export function secondsPerCard(history: { level: Level; seconds: number }[]): Record<Level, number> {
  const out = { ...DEFAULT_SECONDS };
  if (history.length < 10) return out;
  for (const level of LEVELS) {
    const xs = history.filter((h) => h.level === level).map((h) => h.seconds).sort((a, b) => a - b);
    if (xs.length === 0) continue;
    const mid = Math.floor(xs.length / 2);
    out[level] = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  }
  return out;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded shuffle; input is sorted by id first so the result ignores input order. */
function seededShuffle<T extends { id: string }>(items: T[], seed: string): T[] {
  const xs = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rand = mulberry32(hashString(seed));
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

const byOrder = (a: PlanCard, b: PlanCard) =>
  a.material_order - b.material_order || a.concept_position - b.concept_position;

/** Sort per course by (material_order, concept_position), then round-robin across courses. */
export function alternateCourses(cards: PlanCard[]): PlanCard[] {
  const byCourse = new Map<string, PlanCard[]>();
  for (const c of cards) {
    const list = byCourse.get(c.course_id) ?? [];
    list.push(c);
    byCourse.set(c.course_id, list);
  }
  const lists = [...byCourse.entries()]
    .map(([id, list]) => ({ id, list: list.sort(byOrder) }))
    .sort((a, b) => byOrder(a.list[0], b.list[0]) || (a.id < b.id ? -1 : 1))
    .map((x) => x.list);
  const out: PlanCard[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

export function planDay(input: {
  cards: PlanCard[];
  unlockedConceptIds: Set<string>;
  now: Date;
  today: string;
  target: string | null;
  budgetMinutes: number;
  introducedToday: { explain: number; deeper: number };
  spentSecondsToday: number;
  perCard: Record<Level, number>;
}): { queue: string[]; dueCount: number; estMinutes: number } {
  const { cards, unlockedConceptIds, now, today, target, perCard } = input;
  const limit = input.budgetMinutes * 60;
  const nowMs = now.getTime();

  const due = seededShuffle(
    cards.filter((c) => c.introduced && Date.parse(c.due) <= nowMs),
    today,
  );
  const queue = due.map((c) => c.id);
  let seconds = due.reduce((s, c) => s + perCard[c.level], 0);

  const fresh = cards.filter((c) => !c.introduced);
  const newExplain = fresh.filter((c) => c.level === "explain");
  const explainCap = Math.max(
    0,
    explainBudget(newExplain.length + input.introducedToday.explain, today, target) -
      input.introducedToday.explain,
  );
  const newDeeper = fresh.filter(
    (c) => c.level !== "explain" && c.concept_id !== null && unlockedConceptIds.has(c.concept_id),
  );

  let full = false;
  const take = (list: PlanCard[], cap: number) => {
    let taken = 0;
    for (const c of list) {
      if (full || taken >= cap) break;
      if (seconds + input.spentSecondsToday + perCard[c.level] > limit) {
        full = true;
        break;
      }
      queue.push(c.id);
      seconds += perCard[c.level];
      taken++;
    }
  };
  take(alternateCourses(newExplain), explainCap);
  take(alternateCourses(newDeeper), Infinity);

  return { queue, dueCount: due.length, estMinutes: Math.ceil(seconds / 60) };
}

/**
 * Backlog progress. `explainPerDayCapacity` is how many new explain cards fit in a day.
 * behindBy is the shortfall if capacity continues until the target date.
 */
export function pace(
  totalExplain: number,
  introducedExplain: number,
  today: string,
  target: string | null,
  explainPerDayCapacity: number,
): { percent: number; behindBy: number } {
  const percent = totalExplain > 0 ? Math.round((100 * introducedExplain) / totalExplain) : 0;
  const remaining = Math.max(0, totalExplain - introducedExplain);
  if (!target) return { percent, behindBy: 0 };
  const days = daysLeftInclusive(today, target);
  if (days <= 0) return { percent, behindBy: remaining };
  return { percent, behindBy: Math.max(0, remaining - explainPerDayCapacity * days) };
}
