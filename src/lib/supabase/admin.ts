import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Service-role client that bypasses RLS. Only for jobs with no signed-in user (the classes cron);
 * every query must scope itself to a user_id.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The app's single user, identified by ALLOWED_EMAIL. */
export async function getOwnerId(admin: ReturnType<typeof createAdminClient>) {
  const email = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const { data } = await admin.auth.admin.listUsers({ perPage: 50 });
  return data?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
}
