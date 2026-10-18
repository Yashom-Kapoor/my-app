"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveWeight, type ActionState } from "../actions";

export function WeightForm({ today, unit, todaysWeight }: { today: string; unit: string; todaysWeight?: number }) {
  const [formKey, setFormKey] = useState(0);
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveWeight(prev, formData);
    if (result.ok) {
      toast.success("Weight saved");
      setFormKey((k) => k + 1);
    } else if (result.error) {
      toast.error(result.error);
    }
    return result;
  }, { ok: false });

  return (
    <form key={formKey} action={action} className="flex items-end gap-2">
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="weight">Weight ({unit})</Label>
        <Input
          id="weight"
          name="weight"
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          required
          placeholder={todaysWeight ? String(todaysWeight) : "0.0"}
          className="tabular-nums"
        />
      </div>
      <div className="w-36 space-y-1.5">
        <Label htmlFor="date">Date</Label>
        <Input id="date" name="date" type="date" defaultValue={today} max={today} required />
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
