import { DumbbellIcon, HomeIcon, SaladIcon, ScaleIcon, type LucideIcon } from "lucide-react";

/**
 * Registry of app modules. To add one: create `src/app/(app)/<slug>/page.tsx`
 * and add an entry here — it shows up in the nav automatically.
 */
export type AppModule = {
  href: string;
  name: string;
  icon: LucideIcon;
};

export const modules: AppModule[] = [
  { href: "/", name: "Home", icon: HomeIcon },
  { href: "/nutrition", name: "Nutrition", icon: SaladIcon },
  { href: "/workouts", name: "Workouts", icon: DumbbellIcon },
  { href: "/weight", name: "Weight", icon: ScaleIcon },
];
