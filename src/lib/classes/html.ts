import "server-only";
import * as cheerio from "cheerio";

/** Plain text from an HTML fragment: block elements become line breaks, links keep their URL. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style").remove();
  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = a.attr("href") ?? "";
    if (/^https?:/.test(href) && a.text().trim() !== href) a.append(` (${href})`);
  });
  $("br").replaceWith("\n");
  $("li").prepend("• ");
  $("p, div, li, h1, h2, h3, h4, h5, h6, tr, pre, blockquote").append("\n");
  return $.root()
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
