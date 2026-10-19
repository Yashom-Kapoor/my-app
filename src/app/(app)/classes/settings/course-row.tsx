"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mergeCourse, updateCourse, type ActionState } from "../actions";

type Course = { id: string; code: string; name: string; hidden: boolean; sources: string };

export function CourseRow({ course, others }: { course: Course; others: { id: string; code: string }[] }) {
  const [merging, startMerge] = useTransition();
  const [, action, pending] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await updateCourse(prev, formData);
    if (result.ok) toast.success("Saved");
    else if (result.error) toast.error(result.error);
    return result;
  }, { ok: false });

  return (
    <li className="space-y-2 py-3">
      <form action={action} className="space-y-2">
        <input type="hidden" name="id" value={course.id} />
        <div className="flex gap-2">
          <Input name="code" defaultValue={course.code} aria-label="Code" className="w-28" required />
          <Input name="name" defaultValue={course.name} aria-label="Name" required />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>{course.sources}</span>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="hidden" defaultChecked={course.hidden} className="accent-primary" />
            Hide
          </label>
          <Button type="submit" size="xs" variant="outline" disabled={pending} className="ml-auto">
            Save
          </Button>
        </div>
      </form>
      {others.length > 0 && (
        <select
          aria-label={`Merge ${course.code} into another course`}
          disabled={merging}
          value=""
          onChange={(e) => {
            const target = others.find((o) => o.id === e.target.value);
            if (!target || !confirm(`Merge ${course.code} into ${target.code}? Its items move there.`)) return;
            startMerge(async () => {
              const result = await mergeCourse(course.id, target.id);
              if (!result.ok) toast.error(result.error ?? "Merge failed");
            });
          }}
          className="h-7 rounded-md border bg-background px-2 text-xs text-muted-foreground"
        >
          <option value="">Same class as…</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}
