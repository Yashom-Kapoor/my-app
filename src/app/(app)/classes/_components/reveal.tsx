"use client";

import { useState, type ReactNode } from "react";
import { EyeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Hides solutions until asked, so they don't spoil practice. */
export function Reveal({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
      <EyeIcon /> {label}
    </Button>
  );
}
