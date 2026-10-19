import "server-only";
import { clean, loadPage, parseDay, slidesUrl } from "../fetch";
import type { FoundMaterial } from "../types";

// data101.org/fa26 (Just the Docs). The schedule has a table per week; lectures link to their own
// page, which lists the Google Slides deck and the related course notes.

export async function discoverData101(siteUrl: string): Promise<FoundMaterial[]> {
  const $ = await loadPage(siteUrl);
  const found = new Map<string, FoundMaterial>();
  const add = (m: FoundMaterial) => !found.has(m.sourceUrl) && found.set(m.sourceUrl, m);
  const lectures: { url: string; title: string; week: string; day: string | null }[] = [];

  $("h2.week-label").each((_, h) => {
    const heading = $(h);
    const week = clean(heading.text());
    const year = Number((heading.attr("data-week-start") ?? "").slice(0, 4)) || new Date().getFullYear();
    heading.nextAll(".table-wrapper").first().find("tr").each((_, tr) => {
      const row = $(tr);
      const day = parseDay(clean(row.find("td").first().text()), year);
      row.find(".syllabus-item").each((_, item) => {
        const el = $(item);
        const label = clean(el.find("strong.label").first().text());
        const kind = el.find("strong.label").attr("class") ?? "";
        const links = el.find("a[href]").toArray().map((a) => ({
          href: new URL($(a).attr("href")!, siteUrl).toString(),
          text: clean($(a).text()),
          release: $(a).attr("data-release"),
        }));
        const main = links[0];
        if (!main) return;

        if (kind.includes("label-lecture")) {
          // Lecture pages exist ahead of time; only follow released ones.
          if (main.release && Date.parse(main.release) > Date.now()) return;
          lectures.push({ url: main.href, title: `${label}: ${main.text}`, week, day });
        } else if (kind.includes("label-discussion") || kind.includes("label-exam")) {
          const pdfs = links.filter((l) => /\.pdf($|\?)/i.test(l.href));
          const worksheet = pdfs.find((l) => !/_sol/i.test(l.href));
          const base = kind.includes("label-exam") ? "exam" : "discussion";
          if (worksheet) add({ kind: base, format: "pdf", title: `${label}: ${worksheet.text}`, weekLabel: week, sortDate: day, sourceUrl: worksheet.href });
          for (const sol of pdfs.filter((l) => /_sol/i.test(l.href))) {
            add({
              kind: "solutions",
              format: "pdf",
              title: `${label}: ${worksheet?.text ?? sol.text} (solutions)`,
              weekLabel: week,
              sortDate: day,
              sourceUrl: sol.href,
              parentUrl: worksheet?.href,
            });
          }
        }
      });
    });
  });

  const pages = await Promise.all(lectures.map((l) => loadPage(l.url).catch(() => null)));
  lectures.forEach((lecture, i) => {
    const page = pages[i];
    if (!page) return;
    page("main a[href]").each((_, a) => {
      const href = new URL(page(a).attr("href")!, lecture.url).toString();
      const slides = slidesUrl(href);
      if (slides) add({ kind: "slides", format: "gslides", title: lecture.title, weekLabel: lecture.week, sortDate: lecture.day, sourceUrl: slides });
      else if (/^https:\/\/data101\.org\/notes\//.test(href)) {
        const url = href.split("#")[0].replace(/\/?$/, "/");
        add({ kind: "notes", format: "html", title: `Notes: ${clean(page(a).text())}`, weekLabel: lecture.week, sortDate: lecture.day, sourceUrl: url });
      }
    });
  });
  return [...found.values()];
}
