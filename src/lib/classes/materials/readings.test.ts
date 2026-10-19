import * as cheerio from "cheerio";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { htmlToMarkdown, readingFromPage } = await import("./readings");

describe("readingFromPage", () => {
  it("converts a saved page the way convertReading always has", () => {
    const html = `<html><body><nav>skip</nav><article><h1>Intro <a class="anchor-heading">#</a></h1>
      <p>Let \\(x^2\\) be a <b>square</b>.</p><ul><li>one</li><li>two</li></ul>
      <pre><code>a = 1</code></pre><p>$$y = 2$$</p></article></body></html>`;
    expect(readingFromPage(cheerio.load(html))).toEqual({
      title: "Intro",
      markdown: "# Intro\n\nLet $x^2$ be a **square**.\n\n-   one\n-   two\n\n```\na = 1\n```\n\n$$\ny = 2\n$$",
    });
  });
});

describe("htmlToMarkdown", () => {
  it("converts a fragment", () => {
    expect(htmlToMarkdown("<h2>Prompt</h2><p>Read <em>this</em> &amp; write.</p>")).toBe("## Prompt\n\nRead _this_ & write.");
  });
});
