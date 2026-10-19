"use client";

import { useTransition } from "react";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncNow } from "../actions";

export function SyncButton({ label }: { label: string | null }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs text-muted-foreground">{pending ? "Syncing…" : label}</span>}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Sync now"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncNow();
            if (!result.ok) toast.error(result.error ?? "Sync failed");
          })
        }
      >
        <RefreshCwIcon className={cn(pending && "animate-spin")} />
      </Button>
    </div>
  );
}
