import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { getCards, getStudyOverview } from "./data";
import { Session } from "./_components/session";

export const metadata: Metadata = { title: "Review" };

const PAGE = 20;

export default function ReviewPage({ searchParams }: PageProps<"/classes/review">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <ReviewView searchParams={searchParams} />
    </Suspense>
  );
}

async function ReviewView({ searchParams }: Pick<PageProps<"/classes/review">, "searchParams">) {
  const { course } = await searchParams;
  // A malformed id is treated as "no course"; it never reaches the loaders.
  const parsed = z.string().uuid().safeParse(course);
  const courseId = parsed.success ? parsed.data : undefined;
  const { queue, budgetMinutes } = await getStudyOverview(courseId);
  const cards = await getCards(queue.slice(0, PAGE));
  return <Session initialCards={cards} restIds={queue.slice(PAGE)} courseId={courseId} budgetMinutes={budgetMinutes} />;
}
