// Shared helpers for the ingest-materials scripts. Run from the repo root; reads .env.local.
import { createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return { ...env, ...process.env };
}

export const env = loadEnv();
export const CANVAS_BASE = env.CANVAS_BASE_URL ?? "https://bcourses.berkeley.edu";
/** Working files (rendered sheets, text layers, transcriptions); git-ignored. */
export const WORK_DIR = ".ingest";

export const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** The app's single user (ALLOWED_EMAIL). Every query below is scoped to this id. */
export async function ownerId() {
  const email = env.ALLOWED_EMAIL?.toLowerCase();
  const { data, error } = await db.auth.admin.listUsers({ perPage: 50 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) throw new Error("ALLOWED_EMAIL user not found");
  return user.id;
}

/** Same format as src/lib/classes/crypto.ts: base64(iv | tag | ciphertext), AES-256-GCM. */
export function decrypt(stored) {
  const key = Buffer.from(env.CREDENTIALS_KEY, "base64");
  const buf = Buffer.from(stored, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function fail(message) {
  console.error(message);
  process.exit(1);
}
