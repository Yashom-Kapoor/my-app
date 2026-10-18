import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createTemplate } from "../actions";
import { getTemplates } from "../data";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <Link href="/workouts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Workouts
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
      <form action={createTemplate} className="flex gap-2">
        <Input name="name" placeholder="New template, e.g. Push Day" aria-label="Template name" className="flex-1" />
        <Button type="submit">
          <PlusIcon /> Create
        </Button>
      </form>
      <Suspense>
        <TemplateList />
      </Suspense>
    </div>
  );
}

async function TemplateList() {
  const templates = await getTemplates();
  if (templates.length === 0) return <p className="text-sm text-muted-foreground">No templates yet.</p>;
  return (
    <Card>
      <CardContent>
        <ul className="divide-y">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/workouts/templates/${t.id}`} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t.template_exercises.length} exercise{t.template_exercises.length === 1 ? "" : "s"}
                    {t.template_exercises.length > 0 && ` · ${t.template_exercises.map((te) => te.exercise?.name).join(", ")}`}
                  </div>
                </div>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
