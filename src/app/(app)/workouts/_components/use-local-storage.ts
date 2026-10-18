"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "hub:local-storage";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A string in localStorage, synced across components/tabs. Null on the server and when unavailable. */
export function useLocalStorage(key: string): [string | null, (value: string | null) => void] {
  const value = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(EVENT, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(EVENT, onChange);
      };
    },
    () => read(key),
    () => null,
  );

  const set = useCallback(
    (next: string | null) => {
      try {
        if (next == null) localStorage.removeItem(key);
        else localStorage.setItem(key, next);
      } catch {
        // Storage blocked (private mode); the value just won't persist.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}
