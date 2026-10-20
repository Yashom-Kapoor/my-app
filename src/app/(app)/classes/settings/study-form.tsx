"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "../actions";
import { saveStudySettings } from "../review/actions";

export function StudyForm({ targetDate, budgetMinutes }: { targetDate: string | null; budgetMinutes: number }) {
  const [, action, pending] = useActionState<ActionState, FormData>(
    async (prev, formData) => {
      const result = await saveStudySettings(prev, formData);
      if (result.ok) toast.success("Study settings saved");
      else if (result.error) toast.error(result.error);
      return result;
    },
    { ok: false },
  );

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="target_date">Learn everything by</Label>
          <Input id="target_date" name="target_date" type="date" defaultValue={targetDate ?? ""} />
          <p className="text-xs text-muted-foreground">
            Hub introduces just enough new cards each day to finish the first pass by this date.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget_minutes">Minutes per day</Label>
          <Input
            id="budget_minutes"
            name="budget_minutes"
            type="number"
            inputMode="numeric"
            min={5}
            max={300}
            step={1}
            required
            defaultValue={budgetMinutes}
          />
          <p className="text-xs text-muted-foreground">
            How much new material Hub plans each day. Reviews that are due always come first and aren&apos;t cut.
          </p>
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
