import { describe, expect, it } from "vitest";
import { removeCurrent, requeueAgain } from "./queue";

const ids = (q: { id: string }[]) => q.map((c) => c.id).join("");
const mk = (s: string) => [...s].map((id) => ({ id }));

describe("requeueAgain", () => {
  it("puts the card 3 positions after the next one", () => {
    const q = mk("ABCDEF");
    expect(ids(requeueAgain(q, 0, q[0]))).toBe("ABCDAEF");
  });
  it("clamps to the end of a short queue", () => {
    const q = mk("AB");
    expect(ids(requeueAgain(q, 1, q[1]))).toBe("ABB");
  });
});

describe("removeCurrent", () => {
  it("deleting an Again copy keeps the earlier copy and shows the next card", () => {
    const q = mk("ABCDAEF");
    const r = removeCurrent(q, 4);
    expect(ids(r.queue)).toBe("ABCDEF");
    expect(r.queue[r.idx].id).toBe("E");
    expect(r.queue.length - r.idx).toBe(2);
  });
  it("deleting the first copy also drops later copies", () => {
    const q = mk("ABCDAEF");
    const r = removeCurrent(q, 0);
    expect(ids(r.queue)).toBe("BCDEF");
    expect(r.queue[r.idx].id).toBe("B");
  });
  it("deleting the last card leaves idx past the end (done screen)", () => {
    const r = removeCurrent(mk("AB"), 1);
    expect(ids(r.queue)).toBe("A");
    expect(r.idx).toBe(1);
  });
});
