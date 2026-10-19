import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { assignmentsToMaterials } = await import("./canvas-files");

const assignments = [
  { id: 1, name: "Essay 1", description: "<p>Write <b>500</b> words.</p>", due_at: "2026-09-15T06:59:00Z", html_url: "https://bcourses.berkeley.edu/courses/9/assignments/1" },
  { id: 2, name: "Empty", description: "<p>&nbsp;</p>\n", due_at: "2026-09-20T06:59:00Z", html_url: "https://bcourses.berkeley.edu/courses/9/assignments/2" },
  { id: 3, name: "Reading response", description: "<div>Respond.</div>", due_at: null, html_url: "https://bcourses.berkeley.edu/courses/9/assignments/3" },
  { id: 4, name: "None", description: null, due_at: null, html_url: "https://bcourses.berkeley.edu/courses/9/assignments/4" },
];

describe("assignmentsToMaterials", () => {
  it("keeps described assignments and maps them", () => {
    const out = assignmentsToMaterials(assignments);
    expect(out.map((o) => o.material.title)).toEqual(["Essay 1", "Reading response"]);
    expect(out[0]).toEqual({
      material: {
        kind: "homework",
        format: "html",
        title: "Essay 1",
        weekLabel: null,
        // 06:59Z is the previous evening in Pacific time
        sortDate: "2026-09-14",
        sourceUrl: "https://bcourses.berkeley.edu/courses/9/assignments/1",
      },
      markdown: "Write **500** words.",
    });
    expect(out[1].material.sortDate).toBeNull();
  });
});
