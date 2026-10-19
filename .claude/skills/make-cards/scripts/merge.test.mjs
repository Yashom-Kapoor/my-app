import { describe, expect, it } from "vitest";
import { planSave } from "./merge.mjs";

const concept = (key, extra = {}) => ({ key, title: `T ${key}`, position: 1, ...extra });
const card = (key, concept, extra = {}) => ({ key, concept, level: "explain", page: 1, front: "f", back: "b", ...extra });
const none = { concepts: [], cards: [] };

describe("planSave", () => {
  it("inserts new keys", () => {
    const plan = planSave(none, { concepts: [concept("c01")], cards: [card("c01-explain", "c01")] });
    expect(plan.insertConcepts.map((c) => c.key)).toEqual(["c01"]);
    expect(plan.insertCards.map((c) => c.key)).toEqual(["c01-explain"]);
    expect(plan.updateConcepts).toEqual([]);
    expect(plan.updateCards).toEqual([]);
  });

  it("updates a matched card's text only, never FSRS fields", () => {
    const existing = {
      concepts: [{ id: "k1", key: "c01", title: "T c01", position: 1, deleted_at: null }],
      cards: [{ id: "x1", key: "c01-explain", front: "old", back: "old", page: 1, level: "explain", deleted_at: null, stability: 9, due: "2026-01-01" }],
    };
    const plan = planSave(existing, { concepts: [concept("c01")], cards: [card("c01-explain", "c01", { front: "new", back: "new2", page: 4 })] });
    expect(plan.insertCards).toEqual([]);
    expect(plan.updateCards).toEqual([{ id: "x1", front: "new", back: "new2", page: 4, level: "explain" }]);
    expect(plan.updateConcepts).toEqual([]);
  });

  it("updates changed concept title/position", () => {
    const existing = { concepts: [{ id: "k1", key: "c01", title: "old", position: 1, deleted_at: null }], cards: [] };
    const plan = planSave(existing, { concepts: [concept("c01", { title: "new", position: 2 })], cards: [] });
    expect(plan.updateConcepts).toEqual([{ id: "k1", title: "new", position: 2 }]);
  });

  it("never inserts or updates a deleted card or concept", () => {
    const existing = {
      concepts: [{ id: "k1", key: "c01", title: "x", position: 1, deleted_at: "2026-10-01" }],
      cards: [{ id: "x1", key: "c02-explain", front: "a", back: "b", page: 1, level: "explain", deleted_at: "2026-10-01" }],
    };
    const plan = planSave(existing, {
      concepts: [concept("c01", { title: "changed" }), concept("c02")],
      cards: [card("c02-explain", "c02", { front: "z" }), card("c01-explain", "c01")],
    });
    expect(plan.insertConcepts.map((c) => c.key)).toEqual(["c02"]);
    expect(plan.updateConcepts).toEqual([]);
    expect(plan.insertCards).toEqual([]);
    expect(plan.updateCards).toEqual([]);
  });

  it("leaves existing keys absent from the incoming file alone", () => {
    const existing = {
      concepts: [{ id: "k1", key: "c01", title: "x", position: 1, deleted_at: null }],
      cards: [{ id: "x1", key: "c01-explain", front: "a", back: "b", page: 1, level: "explain", deleted_at: null }],
    };
    expect(planSave(existing, { concepts: [], cards: [] })).toEqual({ insertConcepts: [], updateConcepts: [], insertCards: [], updateCards: [] });
  });
});
