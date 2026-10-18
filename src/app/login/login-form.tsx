"use client";

import { useActionState, useState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [sent, setSent] = useState<string | null>(null);
  return sent ? (
    <CodeForm key={sent} email={sent} onBack={() => setSent(null)} />
  ) : (
    <EmailForm onSent={setSent} />
  );
}

function EmailForm({ onSent }: { onSent: (email: string) => void }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(async (prev, formData) => {
    const next = await sendCode(prev, formData);
    if (next.status === "sent" && next.email) onSent(next.email);
    return next;
  }, { status: "idle" });

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} />
      </div>
      {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Email me a code"}
      </Button>
    </form>
  );
}

function CodeForm({ email, onBack }: { email: string; onBack: () => void }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(verifyCode, { status: "sent", email });
  const [resend, resendAction, resending] = useActionState<LoginState, FormData>(sendCode, { status: "idle" });

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <div className="space-y-2">
          <Label htmlFor="code">Code sent to {email}</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,10}"
            maxLength={10}
            required
            autoFocus
            className="text-center text-lg tracking-widest tabular-nums"
          />
        </div>
        {state.message && <p className="text-sm text-destructive">{state.message}</p>}
        {resend.status === "sent" && !state.message && (
          <p className="text-sm text-muted-foreground">New code sent. Older codes no longer work.</p>
        )}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Sign in"}
        </Button>
      </form>
      <div className="flex justify-between text-sm">
        <Button type="button" variant="link" className="px-0" onClick={onBack}>
          Use a different email
        </Button>
        <form action={resendAction}>
          <input type="hidden" name="email" value={email} />
          <Button type="submit" variant="link" className="px-0" disabled={resending}>
            {resending ? "Sending…" : "Resend code"}
          </Button>
        </form>
      </div>
    </div>
  );
}
