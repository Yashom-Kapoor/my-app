import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeftIcon, Trash2Icon } from "lucide-react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { createClient } from "@/lib/supabase/server";
import { deleteTemplate } from "../../actions";
import { getExercises } from "../../data";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Edit template" };

export default function TemplatePage({ params }: PageProps<"/workouts/templates/[id]">) {
  return (
    <div className="space-y-6">
      <Link href="/workouts/templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Templates
      </Link>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-muted" />}>
        <Template params={params} />
      </Suspense>
    </div>
  );
}

async function Template({ params }: { params: PageProps<"/workouts/templates/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: template }, library] = await Promise.all([
    supabase
      .from("workout_templates")
      .select("id, name, template_exercises ( id, position, target_sets, target_reps, rest_seconds, exercise:exercises ( * ) )")
      .eq("id", id)
      .maybeSingle(),
    getExercises(),
  ]);
  if (!template) notFound();

  return (
    <div className="space-y-4">
      <TemplateEditor
        template={{ id: template.id, name: template.name }}
        initial={[...template.template_exercises]
          .sort((a, b) => a.position - b.position)
          .map((te) => ({ ...te, exercise: te.exercise! }))}
        library={library}
      />
      <form action={deleteTemplate.bind(null, template.id)}>
        <ConfirmSubmit variant="ghost" className="w-full" message={`Delete template “${template.name}”? Past workouts are kept.`}>
          <Trash2Icon /> Delete template
        </ConfirmSubmit>
      </form>
    </div>
  );
}
