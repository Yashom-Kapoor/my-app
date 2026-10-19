"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Provider } from "@/lib/classes/types";
import { removeConnection, saveConnection, type ActionState } from "../actions";

export function ConnectionForm({
  provider,
  label,
  connected,
}: {
  provider: Provider;
  label: string;
  connected: boolean;
}) {
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState(!connected);
  const [removing, startRemove] = useTransition();
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveConnection(prev, formData);
    if (result.ok) {
      toast.success(`${label} connected`);
      setFormKey((k) => k + 1);
      setEditing(false);
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, { ok: false });

  if (!editing)
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Replace
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={removing}
          onClick={() => {
            if (confirm(`Disconnect ${label}? Synced items stay.`)) startRemove(() => removeConnection(provider));
          }}
        >
          Disconnect
        </Button>
      </div>
    );

  return (
    <form key={formKey} action={action} className="space-y-2">
      <input type="hidden" name="provider" value={provider} />
      <Label htmlFor={`secret-${provider}`} className="sr-only">
        {label} {provider === "gradescope" ? "cookie" : "token"}
      </Label>
      <div className="flex gap-2">
        <Input
          id={`secret-${provider}`}
          name="secret"
          type="password"
          autoComplete="off"
          spellCheck={false}
          required
          placeholder={provider === "gradescope" ? "Paste the Cookie header" : "Paste the token"}
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Checking…" : "Save"}
        </Button>
      </div>
      {connected && (
        <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      )}
    </form>
  );
}
