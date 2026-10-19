import "server-only";
import * as cheerio from "cheerio";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function loadPage(url: string) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Hub personal sync)" }, cache: "no-store" });
  if (!res.ok) throw new Error(`${new URL(url).hostname} returned ${res.status}`);
  return cheerio.load(await res.text());
}

/** "Wed Aug 26" / "Thu, Aug 27" + year → "2026-08-26". */
export function parseDay(text: string, year: number): string | null {
  const m = text.match(/\b([A-Z][a-z]{2})\w*\.?\s+(\d{1,2})\b/);
  const month = m ? MONTHS.indexOf(m[1]) : -1;
  if (!m || month < 0) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/** Canonical Google Slides URL (export/edit suffixes and query strings dropped), or null. */
export function slidesUrl(href: string): string | null {
  const id = href.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/)?.[1];
  return id ? `https://docs.google.com/presentation/d/${id}` : null;
}

export const clean = (text: string) => text.replace(/\s+/g, " ").trim();
