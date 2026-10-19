import { describe, expect, it } from "vitest";
import { explainBudget, pace, planDay, secondsPerCard, type Level, type PlanCard } from "./plan";

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

  it("caps new explain cards by explainBudget minus introduced today", () => {
    const cards = Array.from({ length: 100 }, () => card());
    const r = planDay(input(cards, { target: "2026-10-29", introducedToday: { explain: 4, deeper: 0 } }));
    expect(r.queue).toHaveLength(6);
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
