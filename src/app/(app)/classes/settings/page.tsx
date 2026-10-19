import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROVIDER_LABELS, age, currentTime } from "@/lib/classes/format";
import type { Provider } from "@/lib/classes/types";
import { getConnections, getCourses } from "../data";
import { getStudySettings } from "../review/data";
import { StudyForm } from "./study-form";
import { ConnectionForm } from "./connection-form";
import { CourseRow } from "./course-row";

export const metadata: Metadata = { title: "Classes settings" };
// Saving a connection syncs it immediately.
export const maxDuration = 60;

const link = "font-medium text-foreground underline underline-offset-4";

const HELP: Record<Provider, ReactNode> = {
  gradescope: (
    <ol className="list-decimal space-y-1 pl-4">
      <li>
        On a computer, sign in at{" "}
        <a className={link} href="https://www.gradescope.com" target="_blank" rel="noreferrer">
          gradescope.com
        </a>{" "}
        with CalNet.
      </li>
      <li>Open DevTools (⌥⌘I) → Network, then reload the page.</li>
      <li>Click the first request (gradescope.com), find Request Headers → Cookie, and copy its whole value.</li>
      <li>Paste it here. When it expires (every few weeks) you&apos;ll see a reconnect banner.</li>
    </ol>
  ),
  canvas: (
    <p>
      In{" "}
      <a className={link} href="https://bcourses.berkeley.edu/profile/settings" target="_blank" rel="noreferrer">
        bCourses → Account → Settings
      </a>
      , click <span className="font-medium text-foreground">+ New Access Token</span>, give it a name, and paste
      the token here.
    </p>
  ),
  ed: (
    <p>
      Create a token at{" "}
      <a className={link} href="https://edstem.org/us/settings/api-tokens" target="_blank" rel="noreferrer">
        Ed → Settings → API Tokens
      </a>{" "}
      and paste it here. Only announcements are pulled, not Q&amp;A threads.
    </p>
  ),
};

const PURPOSE: Record<Provider, string> = {
  gradescope: "Due dates and submission status",
  canvas: "Announcements",
  ed: "Announcements",
};

export default function ClassesSettingsPage() {
  return (
    <div className="space-y-6">
      <Link href="/classes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> Classes
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Classes settings</h1>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
        <Settings />
      </Suspense>
    </div>
  );
}

async function Settings() {
  const [connections, courses, study] = await Promise.all([getConnections(), getCourses(), getStudySettings()]);
  const now = currentTime();

  return (
    <>
      {(Object.keys(PROVIDER_LABELS) as Provider[]).map((provider) => {
        const conn = connections.find((c) => c.provider === provider);
        const status = !conn
          ? "Not connected"
          : conn.status === "expired"
            ? "Expired: reconnect below"
            : conn.status === "error"
              ? `Last sync failed: ${conn.last_error ?? "unknown error"}`
              : conn.last_synced_at
                ? `Connected · synced ${age(conn.last_synced_at, now)} ago`
                : "Connected";
        return (
          <Card key={provider}>
            <CardHeader>
              <CardTitle>{PROVIDER_LABELS[provider]}</CardTitle>
              <CardDescription>
                {PURPOSE[provider]} ·{" "}
                <span className={conn && conn.status !== "ok" ? "text-destructive" : undefined}>{status}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(!conn || conn.status !== "ok") && <div className="text-sm text-muted-foreground">{HELP[provider]}</div>}
              <ConnectionForm
                key={`${provider}-${conn?.status ?? "none"}`}
                provider={provider}
                label={PROVIDER_LABELS[provider]}
                connected={!!conn && conn.status === "ok"}
              />
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Study</CardTitle>
          <CardDescription>
            Set a date to have learned every concept by and a daily time budget. They shape how many new cards each day brings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StudyForm targetDate={study.target_date} budgetMinutes={study.budget_minutes} />
        </CardContent>
      </Card>

      {courses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Courses</CardTitle>
            <CardDescription>
              Rename or hide courses. If one class shows up twice, use &ldquo;Same class as…&rdquo; to merge them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {courses.map((c) => (
                <CourseRow
                  key={c.id}
                  course={{
                    id: c.id,
                    code: c.code,
                    name: c.name,
                    hidden: c.hidden,
                    websiteUrl: c.website_url,
                    sources: [c.gradescope_id && "Gradescope", c.canvas_id && "bCourses", c.ed_id && "Ed"]
                      .filter(Boolean)
                      .join(" + "),
                  }}
                  others={courses.filter((o) => o.id !== c.id).map((o) => ({ id: o.id, code: o.code }))}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
