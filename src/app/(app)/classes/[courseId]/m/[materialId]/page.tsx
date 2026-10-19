import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeftIcon, ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { KIND_LABELS, type MaterialKind } from "@/lib/classes/materials/types";
import { getMaterial, getOriginalUrl, type MaterialDetail } from "../../../data";
import { Markdown } from "../../../_components/markdown";
import { Reveal } from "../../../_components/reveal";

export const metadata: Metadata = { title: "Material" };

type Props = PageProps<"/classes/[courseId]/m/[materialId]">;

export default function MaterialPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <Reader params={params} />
    </Suspense>
  );
}

async function Reader({ params }: Pick<Props, "params">) {
  const { courseId, materialId } = await params;
  const material = await getMaterial(materialId);
  if (!material || material.course_id !== courseId) notFound();
  const original = await getOriginalUrl(material);

  return (
    <article className="space-y-6">
      <header className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-20 -mx-4 space-y-1 border-b bg-background/90 px-4 py-2 backdrop-blur md:top-0">
        <Link
          href={`/classes/${courseId}?tab=materials`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3.5" /> Materials
        </Link>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold leading-snug tracking-tight">{material.title}</h1>
          <a href={original} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Original <ExternalLinkIcon />
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          {[KIND_LABELS[material.kind as MaterialKind], material.week_label].filter(Boolean).join(" · ")}
        </p>
      </header>

      <Pages material={material} />

      {material.solutions.map((s) => (
        <section key={s.id} className="space-y-4 border-t pt-6">
          <h2 className="text-base font-semibold">{s.title}</h2>
          <Reveal label="Reveal solutions">
            <Pages material={s} />
          </Reveal>
        </section>
      ))}
    </article>
  );
}

function Pages({ material }: { material: Pick<MaterialDetail, "kind" | "status" | "material_pages"> }) {
  if (!material.material_pages.length) {
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        {material.status === "failed"
          ? "Transcription failed. Open the original, or run /ingest-materials again."
          : material.status === "skipped"
            ? "Not transcribed on purpose. Open the original."
            : "Not transcribed yet. Run /ingest-materials in Claude Code, or open the original."}
      </p>
    );
  }
  const unit = material.kind === "slides" ? "Slide" : "Page";
  const single = material.material_pages.length === 1;
  return (
    <div className="space-y-8">
      {material.material_pages.map((p) => (
        <section key={p.page} id={`p${p.page}`} className="space-y-2">
          {!single && (
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {unit} {p.page}
              {p.needs_review && (
                <span className="inline-flex items-center gap-1 normal-case tracking-normal text-amber-700 dark:text-amber-400">
                  <TriangleAlertIcon className="size-3" /> may be incomplete, check the original
                </span>
              )}
              <span className="h-px flex-1 bg-border" />
            </div>
          )}
          <Markdown>{p.markdown}</Markdown>
        </section>
      ))}
    </div>
  );
}
