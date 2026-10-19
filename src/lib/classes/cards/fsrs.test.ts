import { describe, expect, it } from "vitest";
import { isGraduated, newCardState, rate } from "./fsrs";

const now = new Date("2026-10-19T12:00:00.000Z");

describe("fsrs wrapper", () => {
  it("creates a new card due now", () => {
    const c = newCardState(now);
    expect(c.state).toBe(0);
    expect(c.reps).toBe(0);
    expect(c.due).toBe(now.toISOString());
    expect(c.last_review).toBeNull();
  });

  it("graduates a new card rated Easy", () => {
    const { next, log } = rate(newCardState(now), 4, now);
    expect(next.state).toBe(2);
    expect(isGraduated(next)).toBe(true);
    expect(next.scheduled_days).toBeGreaterThanOrEqual(1);
    expect(log).toMatchObject({ rating: 4, state_before: 0, state_after: 2 });
  });

  it("keeps a new card rated Again in learning", () => {
    const { next } = rate(newCardState(now), 1, now);
    expect(next.state).toBe(1);
    expect(isGraduated(next)).toBe(false);
  });

  it("round-trips with strings only", () => {
    const first = rate(newCardState(now), 3, now).next;
    const later = new Date("2026-10-25T12:00:00.000Z");
    const second = rate(first, 3, later).next;
    expect(second.reps).toBe(2);
    expect(second.last_review).toBe(later.toISOString());
    for (const c of [first, second]) {
      expect(typeof c.due).toBe("string");
      expect(typeof c.last_review).toBe("string");
      expect(JSON.parse(JSON.stringify(c))).toEqual(c);
    }
  });
});
