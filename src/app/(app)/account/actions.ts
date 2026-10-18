"use server";

import { createClient } from "@/lib/supabase/server";

export type PasswordState = { ok: boolean; error?: string };

export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 12) return { ok: false, error: "Use at least 12 characters." };
  if (password !== confirm) return { ok: false, error: "Passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
