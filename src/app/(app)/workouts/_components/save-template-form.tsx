"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveAsTemplate, type ActionState } from "../actions";

export function SaveTemplateForm({ workoutId, defaultName }: { workoutId: string; defaultName: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveAsTemplate(workoutId, prev, formData);
    if (result.ok) toast.success("Saved as template");
    else if (result.error) toast.error(result.error);
    return result;
  }, { ok: false });

  if (state.ok) return <p className="text-sm text-muted-foreground">Saved as a template.</p>;

  return (
    <form action={action} className="flex gap-2">
      <Input name="name" defaultValue={defaultName} aria-label="Template name" className="flex-1" />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Save as template"}
      </Button>
    </form>
  );
}
