import "server-only";
import { htmlToText } from "./html";
import { ANNOUNCEMENT_WINDOW_DAYS, ExpiredError, type RemoteAnnouncement, type RemoteCourse } from "./types";

// bCourses is Berkeley's Canvas instance; a personal access token reads the REST API.

const BASE = process.env.CANVAS_BASE_URL ?? "https://bcourses.berkeley.edu";

async function getAll<T>(path: string, token: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${BASE}/api/v1${path}`;
  for (let pageNo = 0; url && pageNo < 20; pageNo++) {
    const res: Response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 401) throw new ExpiredError("bCourses token was rejected");
    if (!res.ok) throw new Error(`bCourses returned ${res.status}`);
    out.push(...((await res.json()) as T[]));
    // Canvas paginates with a Link header.
    url = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return out;
}

type CanvasCourse = { id: number; name: string; course_code: string; term?: { name: string } };
type CanvasAnnouncement = {
  id: number;
  title: string;
  message: string | null;
  posted_at: string | null;
  html_url: string;
  context_code: string;
  author?: { display_name?: string };
};

export async function fetchCanvas(token: string) {
  const list = await getAll<CanvasCourse>("/courses?enrollment_state=active&include[]=term&per_page=100", token);
  const courses: RemoteCourse[] = list
    .filter((c) => c.name)
    .map((c) => ({ id: String(c.id), name: c.name, code: c.course_code ?? c.name, term: c.term?.name ?? null }));
  if (!courses.length) return { courses, announcements: [] };

  const since = new Date(Date.now() - ANNOUNCEMENT_WINDOW_DAYS * 86_400_000).toISOString();
  const contexts = courses.map((c) => `context_codes[]=course_${c.id}`).join("&");
  const raw = await getAll<CanvasAnnouncement>(
    `/announcements?${contexts}&start_date=${since}&per_page=100`,
    token,
  );
  const announcements: RemoteAnnouncement[] = raw
    .filter((a) => a.posted_at)
    .map((a) => ({
      courseId: a.context_code.replace(/^course_/, ""),
      externalId: String(a.id),
      title: a.title || "(untitled)",
      body: htmlToText(a.message ?? ""),
      author: a.author?.display_name ?? null,
      url: a.html_url,
      postedAt: a.posted_at!,
    }));
  return { courses, announcements };
}
