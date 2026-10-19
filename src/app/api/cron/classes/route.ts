import { timingSafeEqual } from "node:crypto";
import { createAdminClient, getOwnerId } from "@/lib/supabase/admin";
import { syncAll } from "@/lib/classes/sync";

// Daily Vercel cron (vercel.json). Runs the full sync for the single user so due dates stay fresh
// and the Gradescope session stays warm even on days the app isn't opened.
export const maxDuration = 120;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const admin = createAdminClient();
  const userId = await getOwnerId(admin);
  if (!userId) return Response.json({ error: "Owner not found" }, { status: 500 });
  const results = await syncAll(admin, userId);
  return Response.json({ results });
}
