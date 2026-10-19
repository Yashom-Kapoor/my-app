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

import { parseConceptRef, resolveConceptRef } from "./merge.mjs";
describe("concept refs", () => {
  it("parses keys and id: refs", () => {
    expect(parseConceptRef("c01")).toEqual({ key: "c01" });
    expect(parseConceptRef("id:abc")).toEqual({ id: "abc" });
    expect(parseConceptRef("")).toBeNull();
    expect(parseConceptRef(undefined)).toBeNull();
  });
  it("resolves against inserted/existing ids", () => {
    const m = new Map([["c01", "u1"]]);
    expect(resolveConceptRef("c01", m)).toBe("u1");
    expect(resolveConceptRef("id:u9", m)).toBe("u9");
    expect(resolveConceptRef("nope", m)).toBeNull();
  });
});

import { checkSavable, needsCards, validateCards } from "./merge.mjs";

describe("needsCards", () => {
  it("is true without a cards_hash or when it differs from the marker", () => {
    expect(needsCards({ content_hash: "a", cards_hash: null })).toBe(true);
    expect(needsCards({ content_hash: "a", cards_hash: "b" })).toBe(true);
    expect(needsCards({ content_hash: "a", cards_hash: "a" })).toBe(false);
  });
});

describe("checkSavable", () => {
  const base = { status: "ready", parent_id: null, kind: "slides", content_hash: "h" };
  it("accepts a ready, parentless, marked material (including orphan solutions)", () => {
    expect(checkSavable(base)).toBeNull();
    expect(checkSavable({ ...base, kind: "solutions" })).toBeNull();
  });
  it("rejects children, non-ready and unmarked materials", () => {
    expect(checkSavable({ ...base, kind: "solutions", parent_id: "p1" })).toMatch(/through the parent/);
    expect(checkSavable({ ...base, status: "processing" })).toMatch(/not ready/);
    expect(checkSavable({ ...base, content_hash: null, processed_at: null })).toMatch(/no marker/);
  });
});

describe("validateCards", () => {
  const U1 = "11111111-1111-4111-8111-111111111111";
  const ctx = (extra = {}) => ({ courseId: "co", maxPage: 10, savedConcepts: [], found: new Map(), ...extra });
  const base = { concepts: [{ key: "c01", title: "T", position: 1 }, { key: "c02", title: "U", position: 2 }] };
  const mk = (extra) => ({ ...base, cards: [{ key: "k", concept: "c01", level: "explain", page: 1, front: "f", back: "b", ...extra }] });

  it("accepts a valid file", () => {
    expect(validateCards(mk({}), ctx())).toEqual([]);
    expect(validateCards(mk({ level: "contrast", other_concept: "c02" }), ctx())).toEqual([]);
  });
  it("rejects other_concept on non-contrast cards", () => {
    expect(validateCards(mk({ other_concept: "c02" }), ctx())[0]).toMatch(/only allowed on contrast/);
    expect(validateCards(mk({ level: "why", other_concept_id: U1 }), ctx())[0]).toMatch(/only allowed on contrast/);
  });
  it("requires other_concept on contrast cards", () => {
    expect(validateCards(mk({ level: "contrast" }), ctx())[0]).toMatch(/need other_concept/);
  });
  it("rejects other_concept pointing at a soft-deleted saved key", () => {
    const errs = validateCards(mk({ level: "contrast", other_concept: "gone" }), ctx({ savedConcepts: [{ key: "gone", deleted_at: "x" }] }));
    expect(errs[0]).toMatch(/deleted concept/);
  });
  it("checks id: references and page range", () => {
    expect(validateCards(mk({ concept: `id:${U1}` }), ctx())[0]).toMatch(/does not exist/);
    const found = new Map([[U1, { course_id: "co", deleted_at: null }]]);
    expect(validateCards(mk({ concept: `id:${U1}` }), ctx({ found }))).toEqual([]);
    expect(validateCards(mk({ page: 11 }), ctx())[0]).toMatch(/outside 1\.\.10/);
  });
});
