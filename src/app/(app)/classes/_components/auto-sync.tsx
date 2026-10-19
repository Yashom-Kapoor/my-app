"use client";

import { useEffect } from "react";
import { syncIfStale } from "../actions";

/** Kicks off a background sync when the page opens; the server skips it if data is fresh. */
export function AutoSync() {
  useEffect(() => {
    syncIfStale().catch(() => {});
  }, []);
  return null;
}
