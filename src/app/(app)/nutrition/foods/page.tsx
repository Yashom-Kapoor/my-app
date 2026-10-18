import type { Metadata } from "next";
import { Suspense } from "react";
import { BackLink } from "../_components/back-link";
import { getSavedFoods } from "../data";
import { FoodList } from "./food-list";

export const metadata: Metadata = { title: "My foods" };

export default function FoodsPage() {
  return (
    <div className="space-y-6">
      <BackLink />
      <h1 className="text-2xl font-semibold tracking-tight">My foods</h1>
      <Suspense>
        <Foods />
      </Suspense>
    </div>
  );
}

async function Foods() {
  return <FoodList foods={await getSavedFoods()} />;
}
