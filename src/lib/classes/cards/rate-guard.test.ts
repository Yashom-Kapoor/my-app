import { describe, expect, it } from "vitest";
import { shouldApplyRating } from "./rate-guard";

describe("shouldApplyRating", () => {
  it("applies when the card is unchanged since the client saw it", () => {
    expect(shouldApplyRating("2026-10-19T10:00:00.000Z", "2026-10-19T10:00:00.000Z")).toBe(true);
  });
  it("rejects a stale or double rating", () => {
    expect(shouldApplyRating("2026-10-19T10:05:00.000Z", "2026-10-19T10:00:00.000Z")).toBe(false);
    expect(shouldApplyRating("2026-10-19T10:05:00.000Z", null)).toBe(false);
    expect(shouldApplyRating(null, "2026-10-19T10:00:00.000Z")).toBe(false);
  });
  it("applies a first review (both null)", () => {
    expect(shouldApplyRating(null, null)).toBe(true);
  });
  it("compares timestamps, not strings (Postgres format differs)", () => {
    expect(shouldApplyRating("2026-10-19T10:00:00+00:00", "2026-10-19T10:00:00.000Z")).toBe(true);
    expect(shouldApplyRating("2026-10-19 10:00:00.123+00", "2026-10-19T10:00:00.123Z")).toBe(true);
  });
  it("rejects an unparseable value instead of throwing", () => {
    expect(shouldApplyRating("garbage", "2026-10-19T10:00:00.000Z")).toBe(false);
  });
});
