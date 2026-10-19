import "server-only";
import { clean, loadPage, parseDay, slidesUrl } from "../fetch";
import type { FoundMaterial } from "../types";

// fa26.cs161.org (Just the Docs). The homepage calendar table links everything, and every link
// carries a descriptive aria-label like "Worksheet for Discussion 1 (Security Principles and x86)".

const LABEL = /^(Slides|Worksheet|Solutions) for (Lecture|Discussion|Exam Prep) (\d+) \((.+)\)$/;

export async function discoverCs161(siteUrl: string): Promise<FoundMaterial[]> {
  const $ = await loadPage(siteUrl);
  const year = 2000 + Number(new URL(siteUrl).hostname.match(/^[a-z]{2}(\d{2})\./)?.[1] ?? new Date().getFullYear() % 100);
  const found = new Map<string, FoundMaterial>();
  // Date cells read "Wed<br />Aug 26"; without this their text runs together as "WedAug 26".
  $("br").replaceWith(" ");
  let week: string | null = null;
  let day: string | null = null;

  $("table tr").each((_, tr) => {
    const row = $(tr);
    const weekCell = row.find("td.week-cell").first();
    if (weekCell.length) week = `Week ${clean(weekCell.text())}`;
    row.find("td").each((_, td) => {
      const parsed = parseDay(clean($(td).text()), year);
      if (parsed && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/.test(clean($(td).text()))) day = parsed;
    });

    row.find("a[href]").each((_, a) => {
      const link = $(a);
      const href = new URL(link.attr("href")!, siteUrl).toString();
      const add = (m: FoundMaterial) => !found.has(m.sourceUrl) && found.set(m.sourceUrl, m);

      if (href.startsWith("https://textbook.cs161.org/")) {
        add({ kind: "notes", format: "html", title: `Textbook ${clean(link.text())}`, weekLabel: week, sortDate: day, sourceUrl: href.split("#")[0] });
        return;
      }
      const m = clean(link.attr("aria-label") ?? "").match(LABEL);
      if (!m) return;
      const [, what, series, num, topic] = m;
      const name = `${series} ${num}: ${topic}`;
      if (what === "Slides") {
        // Discussion and exam-prep "slides" are Drive folders; lecture slides are Google Slides.
        const url = series === "Lecture" ? slidesUrl(href) : null;
        if (url) add({ kind: "slides", format: "gslides", title: name, weekLabel: week, sortDate: day, sourceUrl: url });
        return;
      }
      if (!/\.pdf($|\?)/i.test(href)) return;
      const kind = series === "Exam Prep" ? "exam_prep" : "discussion";
      if (what === "Worksheet") add({ kind, format: "pdf", title: name, weekLabel: week, sortDate: day, sourceUrl: href });
      else {
        const worksheet = href.replace(/-sols(\.pdf)/i, "$1");
        add({ kind: "solutions", format: "pdf", title: `${name} (solutions)`, weekLabel: week, sortDate: day, sourceUrl: href, parentUrl: worksheet });
      }
    });
  });
  return [...found.values()];
}
