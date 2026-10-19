import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseData101 } = await import("./data101");
const html = readFileSync(new URL("./__fixtures__/data101-home.html", import.meta.url), "utf8");
const found = parseData101(cheerio.load(html), "https://data101.org/fa26/");

describe("parseData101 notebooks", () => {
  it("finds projects as ipynb with raw URLs and due dates", () => {
    const projects = found.filter((m) => m.kind === "project");
    expect(projects.map((p) => p.title)).toEqual(expect.arrayContaining(["Project 0", "Project 1", "Project 2"]));
    const p1 = projects.find((p) => p.title === "Project 1")!;
    expect(p1).toMatchObject({ format: "ipynb", sortDate: "2026-09-23" });
    expect(p1.sourceUrl).toBe("https://raw.githubusercontent.com/data-101-berkeley/fa26-materials/main/proj/proj1/proj1.ipynb");
  });
  it("attaches discussion notebooks to their worksheet", () => {
    const nb = found.find((m) => m.kind === "discussion" && m.format === "ipynb" && m.title === "Discussion 3 notebook")!;
    expect(nb.sourceUrl).toMatch(/disc03\.ipynb$/);
    const ws = found.find((m) => m.kind === "discussion" && m.format === "pdf" && m.title.startsWith("Discussion 3"))!;
    expect(nb.parentUrl).toBe(ws.sourceUrl);
  });
});
