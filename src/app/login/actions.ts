"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; email?: string; message?: string };

const isAllowed = (email: string) => {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase();
  return !!allowed && email === allowed;
};

/** Email a one-time sign-in code. Typed back into the app, so it works inside the installed PWA. */
export async function sendCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { status: "error", message: "Enter your email." };

  // Same response either way so the allowed address isn't revealed.
  if (!isAllowed(email)) return { status: "sent", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return { status: "error", email, message: error.message };
  return { status: "sent", email };
}

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6,10}$/.test(token)) return { status: "sent", email, message: "Enter the code from the email." };
  if (!isAllowed(email)) return { status: "sent", email, message: "Invalid or expired code." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { status: "sent", email, message: "Invalid or expired code." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
