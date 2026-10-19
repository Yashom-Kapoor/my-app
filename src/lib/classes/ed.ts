import "server-only";
import { ANNOUNCEMENT_WINDOW_DAYS, ExpiredError, type RemoteAnnouncement, type RemoteCourse } from "./types";

// Ed Discussion (US region) with a personal API token. Only announcement threads are pulled,
// which keeps Q&A noise out of the inbox.

const API = "https://us.edstem.org/api";
const PAGE = 100;
const MAX_PAGES = 10;

async function get<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw new ExpiredError("Ed token was rejected");
  if (!res.ok) throw new Error(`Ed returned ${res.status}`);
  return (await res.json()) as T;
}

type EdUser = {
  courses: { course: { id: number; code: string; name: string; status: string; session?: string; year?: string } }[];
};
type EdThread = {
  id: number;
  type: string;
  title: string;
  document: string;
  created_at: string;
  user_id: number;
  is_anonymous?: boolean;
};
type EdThreads = { threads: EdThread[]; users?: { id: number; name: string }[] };

async function announcements(course: RemoteCourse, token: string, since: number) {
  const found: RemoteAnnouncement[] = [];
  for (let pageNo = 0; pageNo < MAX_PAGES; pageNo++) {
    const { threads, users = [] } = await get<EdThreads>(
      `/courses/${course.id}/threads?limit=${PAGE}&offset=${pageNo * PAGE}&sort=new`,
      token,
    );
    const names = new Map(users.map((u) => [u.id, u.name]));
    for (const t of threads) {
      if (t.type !== "announcement" || Date.parse(t.created_at) < since) continue;
      found.push({
        courseId: course.id,
        externalId: String(t.id),
        title: t.title || "(untitled)",
        body: (t.document ?? "").trim(),
        author: t.is_anonymous ? null : (names.get(t.user_id) ?? null),
        url: `https://edstem.org/us/courses/${course.id}/discussion/${t.id}`,
        postedAt: t.created_at,
      });
    }
    // Sorted newest first, so stop once a page reaches past the window.
    const oldest = threads.at(-1);
    if (threads.length < PAGE || !oldest || Date.parse(oldest.created_at) < since) break;
  }
  return found;
}

export async function edCourses(token: string): Promise<RemoteCourse[]> {
  const { courses: enrolled } = await get<EdUser>("/user", token);
  return enrolled
    .filter(({ course }) => course.status === "active")
    .map(({ course }) => ({
      id: String(course.id),
      name: course.name,
      code: course.code,
      term: [course.session, course.year].filter(Boolean).join(" ") || null,
    }));
}

export async function edAnnouncements(token: string, courses: RemoteCourse[]): Promise<RemoteAnnouncement[]> {
  const since = Date.now() - ANNOUNCEMENT_WINDOW_DAYS * 86_400_000;
  const perCourse = await Promise.all(courses.map((c) => announcements(c, token, since)));
  return perCourse.flat();
}
