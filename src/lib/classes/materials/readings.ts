import "server-only";
import type { CheerioAPI } from "cheerio";
import TurndownService from "turndown";
import { clean, loadPage } from "./fetch";

// HTML readings (CS 161 textbook, DATA 101 notes) are already text: convert them to Markdown
// directly instead of transcribing them.

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });

/** TeX delimiters MathJax pages leave in the HTML: \( \), \[ \], $$ $$. */
const MATH = /\\\((.+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$/g;

export async function convertReading(url: string) {
  return readingFromPage(await loadPage(url));
}

/** The post-fetch half of convertReading: a loaded page → its heading and Markdown body. */
export function readingFromPage($: CheerioAPI): { title: string | null; markdown: string } {
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  root.find("script, style, nav, footer, svg, button, .anchor-heading, [aria-hidden=true]").remove();
  const title = clean(root.find("h1").first().text()) || null;

  return { title, markdown: htmlToMarkdown(root.html() ?? "") };
}

/** HTML fragment → Markdown, keeping TeX math as $...$ / $$...$$. */
export function htmlToMarkdown(source: string): string {
  // Swap math out before conversion so Turndown doesn't escape the backslashes, then restore it
  // as $...$ / $$...$$ for remark-math.
  const math: string[] = [];
  const html = source.replace(MATH, (_, inline, block, dollars) => {
    math.push(inline != null ? `$${inline.trim()}$` : `$$\n${(block ?? dollars).trim()}\n$$`);
    return `MATHTOKEN${math.length - 1}END`;
  });
  return turndown
    .turndown(html)
    .replace(/MATHTOKEN(\d+)END/g, (_, i) => math[Number(i)])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
