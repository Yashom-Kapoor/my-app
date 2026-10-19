// List materials waiting for transcription (pending, failed, or left "processing" by an interrupted run), oldest first, as JSON lines.
// Usage: node .claude/skills/ingest-materials/scripts/pending.mjs [--limit N] [--course "CS 161"]
import { db, ownerId } from "./lib.mjs";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const limit = Number(opt("--limit") ?? 500);

const userId = await ownerId();
let query = db
  .from("materials")
  .select("id, kind, format, title, status, error, source_url, sort_date, course:courses!inner ( code )")
  .eq("user_id", userId)
  .neq("format", "html")
  .in("status", ["pending", "processing", "failed"])
  .order("sort_date", { ascending: true, nullsFirst: false })
  .limit(limit);
if (opt("--course")) query = query.eq("course.code", opt("--course"));
const { data, error } = await query;
if (error) throw error;

console.log(`${data.length} waiting`);
for (const m of data) {
  console.log(JSON.stringify({ id: m.id, course: m.course.code, kind: m.kind, title: m.title, status: m.status, error: m.error ?? undefined }));
}
