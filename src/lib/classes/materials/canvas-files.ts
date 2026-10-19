import "server-only";
import { CANVAS_BASE, getAll } from "../canvas";
import { dateOf } from "@/lib/dates";
import { clean } from "./fetch";
import { htmlToMarkdown } from "./readings";
import type { FoundMaterial, MaterialKind } from "./types";

// bCourses course files (PDFs only), labelled with the module they sit in.

type CanvasModule = { name: string; items?: { type: string; content_id?: number }[] };
type CanvasFile = { id: number; display_name: string; "content-type": string; created_at: string };

// File names separate words with "_" or "-", which \b treats as part of a word.
const word = (pattern: string) => new RegExp(`(^|[^a-z])(${pattern})([^a-z]|$)`);
const SOLUTION = word("sol|sols|solutions?|answers?|answer key|key");

function guessKind(name: string): MaterialKind {
  const n = name.toLowerCase();
  if (SOLUTION.test(n)) return "solutions";
  if (word("notes?|readings?|handouts?").test(n)) return "notes";
  if (word("slides?|lecture\\d*|lec").test(n)) return "slides";
  if (word("section|discussion|worksheets?|exercises?|execises?|practice").test(n)) return "discussion";
  if (word("exam|midterm|final|quiz|review").test(n)) return "exam";
  return "notes";
}

/** What a worksheet and its solutions have in common: "section_09_10" / "solution_09_10" → "0910". */
function pairKey(name: string) {
  return name
    .toLowerCase()
    .replace(/answer key|solutions?|sols?|answers?|exercises?|execises?|section|_v\d+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function discoverCanvasFiles(token: string, courseId: string): Promise<FoundMaterial[]> {
  const [modules, files] = await Promise.all([
    getAll<CanvasModule>(`/courses/${courseId}/modules?include[]=items&per_page=100`, token).catch(() => []),
    // The Files tab can be hidden from students; then only module items are reachable.
    getAll<CanvasFile>(`/courses/${courseId}/files?per_page=100`, token).catch(() => [] as CanvasFile[]),
  ]);
  const moduleOf = new Map<number, string>();
  for (const m of modules) for (const item of m.items ?? []) if (item.type === "File" && item.content_id) moduleOf.set(item.content_id, clean(m.name));

  let list = files;
  if (!list.length && moduleOf.size) {
    list = (
      await Promise.all(
        [...moduleOf.keys()].map((id) => getAll<CanvasFile>(`/courses/${courseId}/files/${id}`, token).catch(() => [])),
      )
    ).flat();
  }

  const found: FoundMaterial[] = list
    .filter((f) => f["content-type"] === "application/pdf")
    .map((f) => ({
      kind: guessKind(f.display_name),
      format: "pdf" as const,
      title: f.display_name.replace(/\.pdf$/i, ""),
      weekLabel: moduleOf.get(f.id) ?? null,
      sortDate: f.created_at.slice(0, 10),
      sourceUrl: `${CANVAS_BASE}/courses/${courseId}/files/${f.id}`,
    }));

  // Pair each solutions file with the worksheet that has the same name minus the "solutions" part;
  // with several candidates, the closest upload date wins.
  const worksheets = found.filter((m) => m.kind !== "solutions" && m.kind !== "slides");
  for (const sol of found.filter((m) => m.kind === "solutions")) {
    const key = pairKey(sol.title);
    const matches = worksheets.filter((w) => key && pairKey(w.title) === key);
    const gap = (w: FoundMaterial) => Math.abs(Date.parse(w.sortDate ?? "") - Date.parse(sol.sortDate ?? ""));
    sol.parentUrl = matches.sort((a, b) => gap(a) - gap(b))[0]?.sourceUrl;
  }
  return found;
}

// bCourses assignment descriptions: the prompt text is already HTML, so it becomes a homework
// material with its Markdown page directly. The assignment URL needs a login, so it can't be fetched later.

type CanvasAssignment = { id: number; name: string; description: string | null; due_at: string | null; html_url: string };
export type FoundAssignment = { material: FoundMaterial; markdown: string };

/** Assignments with a non-empty description, as homework materials plus their Markdown. */
export function assignmentsToMaterials(list: CanvasAssignment[]): FoundAssignment[] {
  const out: FoundAssignment[] = [];
  for (const a of list) {
    if (!a.description?.replace(/<[^>]*>|&nbsp;|\s/g, "")) continue;
    const markdown = htmlToMarkdown(a.description);
    if (!markdown.trim()) continue;
    out.push({
      material: {
        kind: "homework",
        format: "html",
        title: clean(a.name),
        weekLabel: null,
        sortDate: a.due_at ? dateOf(a.due_at) : null,
        sourceUrl: a.html_url,
      },
      markdown,
    });
  }
  return out;
}

export async function discoverCanvasAssignments(token: string, courseId: string): Promise<FoundAssignment[]> {
  return assignmentsToMaterials(await getAll<CanvasAssignment>(`/courses/${courseId}/assignments?per_page=100`, token));
}
