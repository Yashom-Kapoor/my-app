import "server-only";
import * as cheerio from "cheerio";
import { ExpiredError, type RemoteAssignment, type RemoteCourse } from "./types";

// Gradescope has no API, so this reads the student pages with the user's session cookie.

const BASE = "https://www.gradescope.com";

/** Accepts a raw `Cookie` header value, with or without the "Cookie:" prefix. */
export function normalizeCookie(input: string) {
  return input.trim().replace(/^cookie:\s*/i, "");
}

async function page(path: string, cookie: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { cookie, "user-agent": "Mozilla/5.0 (Hub personal sync)", accept: "text/html" },
    redirect: "manual",
    cache: "no-store",
  });
  // A signed-out session redirects to the login page.
  if (res.status >= 300 && res.status < 400) throw new ExpiredError("Gradescope session expired");
  if (res.status === 401 || res.status === 403) throw new ExpiredError("Gradescope session expired");
  if (!res.ok) throw new Error(`Gradescope returned ${res.status} for ${path}`);
  const $ = cheerio.load(await res.text());
  if ($('form[action="/login"]').length) throw new ExpiredError("Gradescope session expired");
  return $;
}

/** "2026-10-20 23:59:00 -0700" → ISO. Gradescope's datetime attributes use this format. */
function parseTime(value: string | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*([+-]\d{2}):?(\d{2})$/);
  const d = new Date(m ? `${m[1]}T${m[2]}${m[3]}:${m[4]}` : value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Courses from the newest term on the account page. */
async function courses(cookie: string): Promise<RemoteCourse[]> {
  const $ = await page("/account", cookie);
  const terms = $(".courseList--term");
  if (!terms.length && !$(".courseBox").length) throw new ExpiredError("Gradescope session expired");

  // Each term heading is followed by its course grid; the first term on the page is the newest.
  const term = terms.first().text().trim() || null;
  const grid = terms.length ? terms.first().next(".courseList--coursesForTerm") : $(".courseList").first();
  const found: RemoteCourse[] = [];
  grid.find("a.courseBox[href^='/courses/']").each((_, el) => {
    const box = $(el);
    const id = box.attr("href")!.split("/")[2];
    const code = box.find(".courseBox--shortname").text().trim();
    const name = box.find(".courseBox--name").text().trim() || code;
    if (id) found.push({ id, code: code || name, name, term });
  });
  return found;
}

async function assignments(course: RemoteCourse, cookie: string): Promise<RemoteAssignment[]> {
  const $ = await page(`/courses/${course.id}`, cookie);
  const rows: RemoteAssignment[] = [];
  $("#assignments-student-table tbody tr").each((_, el) => {
    const row = $(el);
    const head = row.find("th").first();
    const link = head.find("a[href]").first();
    const button = head.find("[data-assignment-id]").first();
    const href = link.attr("href");
    const assignmentId = button.attr("data-assignment-id") ?? href?.match(/assignments\/(\d+)/)?.[1];
    const title = (button.attr("data-assignment-title") ?? head.text()).trim();
    if (!assignmentId || !title) return;

    const statusText = row.find(".submissionStatus--text").text().trim();
    const score = row.find(".submissionStatus--score").text().trim() || null;
    const status = score ? "graded" : statusText && !/no submission/i.test(statusText) ? "submitted" : "missing";

    const due = row.find("time.submissionTimeChart--dueDate");
    rows.push({
      courseId: course.id,
      externalId: `gradescope:${assignmentId}`,
      title,
      url: `${BASE}${href ?? `/courses/${course.id}/assignments/${assignmentId}`}`,
      releasedAt: parseTime(row.find("time.submissionTimeChart--releaseDate").attr("datetime")),
      dueAt: parseTime(due.eq(0).attr("datetime")),
      lateDueAt: parseTime(due.eq(1).attr("datetime")),
      status,
      score,
    });
  });
  return rows;
}

export async function fetchGradescope(rawCookie: string) {
  const cookie = normalizeCookie(rawCookie);
  const list = await courses(cookie);
  const perCourse = await Promise.all(list.map((c) => assignments(c, cookie)));
  return { courses: list, assignments: perCourse.flat() };
}
