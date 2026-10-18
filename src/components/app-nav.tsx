"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { modules } from "@/lib/modules";
import { cn } from "@/lib/utils";

function isActive(pathname: string | null, href: string) {
  if (pathname == null) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="flex flex-col gap-1">
      {modules.map(({ href, name, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            isActive(pathname, href) && "bg-muted text-foreground",
          )}
        >
          <Icon className="size-4" />
          {name}
        </Link>
      ))}
    </nav>
  );
}

function BottomLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="flex">
        {modules.map(({ href, name, icon: Icon }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-[11px] font-medium text-muted-foreground",
                isActive(pathname, href) && "text-foreground",
              )}
            >
              <Icon className="size-5" />
              {name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ActiveSidebar() {
  return <SidebarLinks pathname={usePathname()} />;
}

function ActiveBottom() {
  return <BottomLinks pathname={usePathname()} />;
}

// The current path is request data, so the highlighted state streams in; the links render immediately.
export function SidebarNav() {
  return (
    <Suspense fallback={<SidebarLinks pathname={null} />}>
      <ActiveSidebar />
    </Suspense>
  );
}

export function BottomNav() {
  return (
    <Suspense fallback={<BottomLinks pathname={null} />}>
      <ActiveBottom />
    </Suspense>
  );
}
