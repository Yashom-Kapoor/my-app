import Link from "next/link";
import { KeyRoundIcon, LogOutIcon } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { Button, buttonVariants } from "@/components/ui/button";

export async function UserMenu() {
  const user = await getUser();
  if (!user) return null;
  return (
    <form action={signOut} className="flex items-center gap-1">
      <span className="hidden truncate text-xs text-muted-foreground md:block">{user.email}</span>
      <Link href="/account" aria-label="Account" className={buttonVariants({ variant: "ghost", size: "icon" })}>
        <KeyRoundIcon className="size-4" />
      </Link>
      <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
        <LogOutIcon className="size-4" />
      </Button>
    </form>
  );
}
