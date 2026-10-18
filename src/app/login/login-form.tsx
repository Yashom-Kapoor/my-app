"use client";

import { useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sendMagicLink, signIn, type LoginState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [useLink, setUseLink] = useState(false);
  const linkFailed = useSearchParams().get("error") === "auth";
  return (
    <div className="space-y-4">
      {linkFailed && (
        <p className="text-sm text-destructive">
          That sign-in link didn&apos;t work. Links only work in the same browser you requested them from, and only once.
        </p>
      )}
      {useLink ? <LinkForm onBack={() => setUseLink(false)} /> : <PasswordForm onForgot={() => setUseLink(true)} />}
    </div>
  );
}

function PasswordForm({ onForgot }: { onForgot: () => void }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, { status: "idle" });
  return (
    <div className="space-y-2">
      <form action={action} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <Button type="button" variant="link" className="px-0 text-sm" onClick={onForgot}>
        No password yet? Email me a sign-in link
      </Button>
    </div>
  );
}

function LinkForm({ onBack }: { onBack: () => void }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });
  return (
    <div className="space-y-2">
      {state.status === "sent" ? (
        <p className="text-sm text-muted-foreground">
          Check your email for a sign-in link, then set a password under Account.
        </p>
      ) : (
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-email">Email</Label>
            <Input id="link-email" name="email" type="email" autoComplete="email" required />
          </div>
          {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send sign-in link"}
          </Button>
        </form>
      )}
      <Button type="button" variant="link" className="px-0 text-sm" onClick={onBack}>
        Back to password
      </Button>
    </div>
  );
}
