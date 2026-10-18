import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

export function BackLink() {
  return (
    <Link href="/nutrition" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeftIcon className="size-4" /> Nutrition
    </Link>
  );
}
