import Link from "next/link";
import { modules } from "@/lib/modules";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {modules
          .filter((m) => m.href !== "/")
          .map(({ href, name, icon: Icon }) => (
            <Link key={href} href={href}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <Icon className="mb-2 size-5" />
                  <CardTitle>{name}</CardTitle>
                  <CardDescription>Open {name.toLowerCase()}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
      </div>
    </div>
  );
}
