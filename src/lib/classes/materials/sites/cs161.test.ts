import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { parseCs161 } = await import("./cs161");
const html = readFileSync(new URL("./__fixtures__/cs161-home.html", import.meta.url), "utf8");
const found = parseCs161(cheerio.load(html), "https://fa26.cs161.org/");
const projects = found.filter((m) => m.kind === "project");

describe("parseCs161 projects", () => {
  it("finds the project spec pages without duplicates", () => {
    const urls = projects.map((m) => m.sourceUrl);
    expect(urls).toEqual(expect.arrayContaining([
      "https://fa26.cs161.org/proj1/",
      "https://fa26.cs161.org/proj1/customizing/",
      "https://fa26.cs161.org/proj1/deliverables/",
    ]));
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.every((u) => /\/proj\d+\//.test(u))).toBe(true);
  });
  it("titles and dates them", () => {
    const by = Object.fromEntries(projects.map((m) => [m.sourceUrl, m]));
    expect(by["https://fa26.cs161.org/proj1/customizing/"]).toMatchObject({ format: "html", title: "Project 1: Customizing", weekLabel: null, sortDate: "2026-09-18" });
    expect(by["https://fa26.cs161.org/proj1/"].title).toBe("Project 1: Overview");
  });
  it("keeps existing materials", () => {
    expect(found.some((m) => m.kind === "slides")).toBe(true);
  });
});
