import type { Metadata } from "next";
import { Suspense } from "react";
import { getCards, getStudyOverview } from "./data";
import { Session } from "./_components/session";

export const metadata: Metadata = { title: "Review" };

const PAGE = 20;

export default function ReviewPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <ReviewView />
    </Suspense>
  );
}

async function ReviewView() {
  const { queue } = await getStudyOverview();
  const cards = await getCards(queue.slice(0, PAGE));
  return <Session initialCards={cards} restIds={queue.slice(PAGE)} />;
}
