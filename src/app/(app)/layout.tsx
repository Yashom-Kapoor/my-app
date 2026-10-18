import { Suspense } from "react";
import { BottomNav, SidebarNav } from "@/components/app-nav";
import { UserMenu } from "@/components/user-menu";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r p-4 md:flex">
        <div className="mb-6 px-3 text-lg font-semibold tracking-tight">Hub</div>
        <SidebarNav />
        <div className="mt-auto">
          <Suspense>
            <UserMenu />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <span className="py-3 font-semibold tracking-tight">Hub</span>
          <Suspense>
            <UserMenu />
          </Suspense>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
