import { describe, expect, it } from "vitest";
import { cardStatus, statusLabel, explainBudget, pace, summarizeQueue, planDay, secondsPerCard, unlockedConcepts, type Level, type PlanCard } from "./plan";

const NOW = new Date("2026-10-20T12:00:00Z");
const PER_CARD: Record<Level, number> = { explain: 20, why: 40, apply: 60, contrast: 45, trap: 45 };

let n = 0;
function card(over: Partial<PlanCard> = {}): PlanCard {
  n++;
  return {
    id: `c${n}`,
    level: "explain",
    concept_id: null,
    state: 0,
    due: "2026-10-19T00:00:00Z",
    course_id: "A",
    material_order: 1,
    concept_position: n,
    introduced: false,
    ...over,
  };
}
const dueCard = (over: Partial<PlanCard> = {}) => card({ introduced: true, state: 2, ...over });

function input(cards: PlanCard[], over: Record<string, unknown> = {}) {
  return {
    cards,
    unlockedConceptIds: new Set<string>(),
    now: NOW,
    today: "2026-10-20",
    target: null as string | null,
    budgetMinutes: 60,
    introducedToday: { explain: 0, deeper: 0 },
    spentSecondsToday: 0,
    perCard: PER_CARD,
    ...over,
  };
}

describe("explainBudget", () => {
  it("spreads remaining over days left inclusive", () => {
    expect(explainBudget(100, "2026-10-20", "2026-10-29")).toBe(10);
  });
  it("target today means everything today", () => {
    expect(explainBudget(100, "2026-10-20", "2026-10-20")).toBe(100);
  });
  it("past or null target is unlimited", () => {
    expect(explainBudget(100, "2026-10-20", "2026-10-01")).toBe(Infinity);
    expect(explainBudget(100, "2026-10-20", null)).toBe(Infinity);
  });
  it("never negative or NaN", () => {
    expect(explainBudget(0, "2026-10-20", "2026-10-20")).toBe(0);
  });
});

describe("secondsPerCard", () => {
  it("uses defaults with fewer than 10 samples", () => {
    const h = Array.from({ length: 9 }, () => ({ level: "explain" as Level, seconds: 5 }));
    expect(secondsPerCard(h)).toEqual(PER_CARD);
  });
  it("uses the per-level median with enough samples", () => {
    const h = [1, 2, 3, 4, 100, 6, 7, 8, 9, 10].map((s) => ({ level: "why" as Level, seconds: s }));
    const r = secondsPerCard(h);
    expect(r.why).toBe(6.5);
    expect(r.explain).toBe(20);
  });
});

describe("secondsPerCard floor and threshold", () => {
  it("floors each level at 3 seconds", () => {
    const h = Array.from({ length: 12 }, () => ({ level: "explain" as Level, seconds: 0 }));
    expect(secondsPerCard(h).explain).toBe(3);
  });
  it("applies the sample threshold per level", () => {
    const h = [
      ...Array.from({ length: 10 }, () => ({ level: "why" as Level, seconds: 30 })),
      ...Array.from({ length: 3 }, () => ({ level: "apply" as Level, seconds: 5 })),
    ];
    const r = secondsPerCard(h);
    expect(r.why).toBe(30);
    expect(r.apply).toBe(60);
  });
});

describe("unlockedConcepts", () => {
  const row = (concept_id: string | null, level: Level, graduated = false) => ({ concept_id, level, graduated });
  it("unlocks a concept whose explain card graduated", () => {
    expect(unlockedConcepts([row("k", "explain", true), row("k", "why")]).has("k")).toBe(true);
  });
  it("keeps a concept locked while its explain card is learning", () => {
    expect(unlockedConcepts([row("k", "explain", false), row("k", "why")]).has("k")).toBe(false);
  });
  it("unlocks a concept with no live explain card", () => {
    expect(unlockedConcepts([row("k", "why"), row("k", "apply")]).has("k")).toBe(true);
  });
  it("ignores cards without a concept", () => {
    expect(unlockedConcepts([row(null, "explain", true)]).size).toBe(0);
  });
});

describe("planDay", () => {
  it("never cuts due cards and queues no new ones when overloaded", () => {
    const due = Array.from({ length: 300 }, () => dueCard());
    const fresh = Array.from({ length: 10 }, () => card());
    const r = planDay(input([...due, ...fresh]));
    expect(r.queue).toHaveLength(300);
    expect(r.dueCount).toBe(300);
    expect(r.queue.every((id) => due.some((d) => d.id === id))).toBe(true);
  });

  it("fills a 10 minute budget with 30 explain cards, before deeper", () => {
    const explains = Array.from({ length: 50 }, () => card());
    const deeper = card({ level: "why", concept_id: "k1", material_order: 0 });
    const r = planDay(input([deeper, ...explains], { budgetMinutes: 10, unlockedConceptIds: new Set(["k1"]) }));
    expect(r.queue).toHaveLength(30);
    expect(r.queue).not.toContain(deeper.id);
    expect(r.estMinutes).toBe(10);
  });

  it("queues unlocked deeper cards after explain, never locked ones", () => {
    const e = card();
    const open = card({ level: "why", concept_id: "k1" });
    const locked = card({ level: "apply", concept_id: "k2" });
    const r = planDay(input([locked, open, e], { unlockedConceptIds: new Set(["k1"]) }));
    expect(r.queue).toEqual([e.id, open.id]);
  });

  it("does not gate explain cards by unlock", () => {
    const e = card({ concept_id: "k9" });
    expect(planDay(input([e])).queue).toEqual([e.id]);
  });

  it("alternates courses A, B, A, B", () => {
    const a = [card({ course_id: "A" }), card({ course_id: "A" })];
    const b = [card({ course_id: "B" }), card({ course_id: "B" })];
    const r = planDay(input([...b, ...a]));
    expect(r.queue).toEqual([a[0].id, b[0].id, a[1].id, b[1].id]);
  });

  it("starts with the course whose first card has the lowest material_order", () => {
    const a = card({ course_id: "A", material_order: 5 });
    const b = card({ course_id: "B", material_order: 2 });
    expect(planDay(input([a, b])).queue).toEqual([b.id, a.id]);
  });

  it("orders within a course by material_order then concept_position", () => {
    const x = card({ material_order: 2, concept_position: 1 });
    const y = card({ material_order: 1, concept_position: 9 });
    const z = card({ material_order: 1, concept_position: 3 });
    expect(planDay(input([x, y, z])).queue).toEqual([z.id, y.id, x.id]);
  });

  it("caps new explain cards by the start-of-day budget minus introduced today", () => {
    // 96 fresh + 4 introduced today = 100 at start of day, 10 days left -> 10/day, 6 still owed
    const cards = Array.from({ length: 96 }, () => card());
    const r = planDay(input(cards, { target: "2026-10-29", introducedToday: { explain: 4, deeper: 0 } }));
    expect(r.queue).toHaveLength(6);
  });

  it("does not double-count today's progress", () => {
    // 100 at start of day, 5 days left -> 20/day; 15 done, 85 remain -> 5 still owed
    const cards = Array.from({ length: 85 }, () => card());
    const r = planDay(input(cards, { target: "2026-10-24", introducedToday: { explain: 15, deeper: 0 } }));
    expect(r.queue).toHaveLength(5);
  });

  it("counts time already spent today", () => {
    const cards = Array.from({ length: 50 }, () => card());
    const r = planDay(input(cards, { budgetMinutes: 10, spentSecondsToday: 400 }));
    expect(r.queue).toHaveLength(10);
  });

  it("only includes due cards with due <= now", () => {
    const later = dueCard({ due: "2026-10-21T00:00:00Z" });
    const now = dueCard();
    const r = planDay(input([later, now]));
    expect(r.queue).toEqual([now.id]);
  });

  it("is deterministic per today and differs across days", () => {
    const due = Array.from({ length: 30 }, () => dueCard());
    const a1 = planDay(input(due, { today: "2026-10-20" })).queue;
    const a2 = planDay(input([...due].reverse(), { today: "2026-10-20" })).queue;
    const b = planDay(input(due, { today: "2026-10-21" })).queue;
    expect(a1).toEqual(a2);
    expect(a1).not.toEqual(b);
  });
});

describe("pace", () => {
  it("computes percent", () => {
    expect(pace(200, 50, "2026-10-20", null, 10).percent).toBe(25);
    expect(pace(0, 0, "2026-10-20", null, 10).percent).toBe(0);
  });
  it("is on track when capacity covers remaining", () => {
    expect(pace(200, 50, "2026-10-20", "2026-10-29", 15)).toEqual({ percent: 25, behindBy: 0 });
  });
  it("is behind by the exact shortfall", () => {
    // remaining 150, capacity 10 * 10 days = 100
    expect(pace(200, 50, "2026-10-20", "2026-10-29", 10).behindBy).toBe(50);
  });
  it("null target is never behind; past target is behind by remaining", () => {
    expect(pace(200, 50, "2026-10-20", null, 10).behindBy).toBe(0);
    expect(pace(200, 50, "2026-10-20", "2026-10-01", 10).behindBy).toBe(150);
  });
  it("target today counts one day", () => {
    expect(pace(100, 0, "2026-10-20", "2026-10-20", 30).behindBy).toBe(70);
  });
});

describe("planDay breakdown", () => {
  it("counts reviews, new explain and new deeper in the queue", () => {
    const due = [dueCard(), dueCard()];
    const e = card();
    const d = card({ level: "why", concept_id: "k" });
    const r = planDay(input([...due, e, d], { unlockedConceptIds: new Set(["k"]) }));
    expect(r.breakdown).toEqual({ reviews: 2, newExplain: 1, newDeeper: 1 });
    expect(r.dueCount).toBe(2);
  });
});

describe("summarizeQueue", () => {
  it("recomputes counts and minutes for a subset of ids", () => {
    const a = dueCard({ course_id: "A" });
    const b = card({ course_id: "A" });
    const c = dueCard({ course_id: "B" });
    const r = summarizeQueue([a.id, b.id], [a, b, c], PER_CARD);
    expect(r).toEqual({ dueCount: 1, estMinutes: 1, breakdown: { reviews: 1, newExplain: 1, newDeeper: 0 } });
  });
  it("is empty for no ids", () => {
    expect(summarizeQueue([], [], PER_CARD)).toEqual({
      dueCount: 0,
      estMinutes: 0,
      breakdown: { reviews: 0, newExplain: 0, newDeeper: 0 },
    });
  });
});

describe("cardStatus", () => {
  const base = { level: "explain" as Level, state: 0, due: "2026-10-19T00:00:00Z", scheduled_days: 0, reps: 0, concept_id: "k" };
  const none = new Set<string>();
  const unlocked = new Set(["k"]);
  it("new explain card", () => {
    expect(cardStatus(base, none, NOW)).toEqual({ status: "new", due: null });
  });
  it("new deeper card with unlocked concept", () => {
    expect(cardStatus({ ...base, level: "why" }, unlocked, NOW).status).toBe("new");
  });
  it("new deeper card with locked concept", () => {
    expect(cardStatus({ ...base, level: "why" }, none, NOW).status).toBe("locked");
    expect(cardStatus({ ...base, level: "why", concept_id: null }, unlocked, NOW).status).toBe("locked");
  });
  it("learning for state 1 and 3, with due", () => {
    expect(cardStatus({ ...base, reps: 1, state: 1 }, none, NOW)).toEqual({ status: "learning", due: base.due });
    expect(cardStatus({ ...base, reps: 3, state: 3 }, none, NOW).status).toBe("learning");
  });
  it("due when due <= now", () => {
    expect(cardStatus({ ...base, reps: 2, state: 2, scheduled_days: 30 }, none, NOW).status).toBe("due");
    expect(cardStatus({ ...base, reps: 2, state: 2, due: NOW.toISOString() }, none, NOW).status).toBe("due");
  });
  it("mastered when scheduled 21+ days and not due", () => {
    const c = { ...base, reps: 5, state: 2, due: "2026-11-30T00:00:00Z" };
    expect(cardStatus({ ...c, scheduled_days: 21 }, none, NOW)).toEqual({ status: "mastered", due: c.due });
  });
  it("review otherwise", () => {
    const c = { ...base, reps: 2, state: 2, due: "2026-10-25T00:00:00Z", scheduled_days: 20 };
    expect(cardStatus(c, none, NOW).status).toBe("review");
  });
});

describe("statusLabel", () => {
  it("counts calendar days for review cards", () => {
    expect(statusLabel("review", "2026-10-24T18:00:00Z", NOW)).toBe("Due in 4d");
  });
  it("says Due today for due cards and for review cards due later today", () => {
    expect(statusLabel("due", "2026-10-20T08:00:00Z", NOW)).toBe("Due today");
    expect(statusLabel("review", "2026-10-20T20:00:00Z", NOW)).toBe("Due today");
  });
  it("labels the other states", () => {
    expect(statusLabel("new", null, NOW)).toBe("New");
    expect(statusLabel("locked", null, NOW)).toBe("Locked");
    expect(statusLabel("learning", "2026-10-20T12:05:00Z", NOW)).toBe("Learning");
    expect(statusLabel("mastered", "2027-01-01T00:00:00Z", NOW)).toBe("Mastered");
  });
});

describe("class-scoped summaries of the global plan", () => {
  it("class breakdowns sum to the global one and class queues are subsequences", () => {
    const cards = [
      ...Array.from({ length: 6 }, (_, i) => dueCard({ course_id: i % 2 ? "A" : "B" })),
      ...Array.from({ length: 8 }, (_, i) => card({ course_id: i % 3 ? "A" : "B" })),
      card({ course_id: "A", level: "why", concept_id: "k1" }),
      card({ course_id: "B", level: "apply", concept_id: "k2" }),
    ];
    const unlockedConceptIds = new Set(["k1", "k2"]);
    const global = planDay(input(cards, { unlockedConceptIds }));
    const sums = { reviews: 0, newExplain: 0, newDeeper: 0 };
    for (const course of ["A", "B"]) {
      const ids = new Set(cards.filter((c) => c.course_id === course).map((c) => c.id));
      const queue = global.queue.filter((id) => ids.has(id));
      const s = summarizeQueue(queue, cards, PER_CARD);
      sums.reviews += s.breakdown.reviews;
      sums.newExplain += s.breakdown.newExplain;
      sums.newDeeper += s.breakdown.newDeeper;
      let at = -1;
      for (const id of queue) {
        at = global.queue.indexOf(id, at + 1);
        expect(at).toBeGreaterThan(-1);
      }
    }
    expect(sums).toEqual(global.breakdown);
  });
});
