// Normalized shapes every source fetcher returns; sync.ts maps them onto the tables.

export type Provider = "gradescope" | "canvas" | "ed";

export type RemoteCourse = { id: string; name: string; code: string; term: string | null };

export type RemoteAssignment = {
  courseId: string;
  externalId: string;
  title: string;
  url: string | null;
  releasedAt: string | null;
  dueAt: string | null;
  lateDueAt: string | null;
  status: "submitted" | "graded" | "missing";
  score: string | null;
};

export type RemoteAnnouncement = {
  courseId: string;
  externalId: string;
  title: string;
  body: string;
  author: string | null;
  url: string | null;
  postedAt: string;
};

/** Credentials were rejected: the user has to reconnect. Any other error is treated as transient. */
export class ExpiredError extends Error {}

/** How far back to pull announcements. */
export const ANNOUNCEMENT_WINDOW_DAYS = 150;
