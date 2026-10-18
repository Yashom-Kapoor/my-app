import { LogOutIcon } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export async function UserMenu() {
  const user = await getUser();
  if (!user) return null;
  return (
    <form action={signOut} className="flex items-center gap-2">
      <span className="hidden truncate text-xs text-muted-foreground md:block">{user.email}</span>
      <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
        <LogOutIcon className="size-4" />
      </Button>
    </form>
  );
}
