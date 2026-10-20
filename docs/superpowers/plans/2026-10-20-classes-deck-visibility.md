# Classes Deck Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** per-class review, a Cards tab with deck stats, a waiting-materials page, and a legible daily budget.

**Architecture:** extend the existing review data layer (`src/app/(app)/classes/review/data.ts`, `src/lib/classes/cards/plan.ts`) with a course filter, a plan breakdown and a pure `cardStatus`; add UI on the Classes home, the class page and a new `/classes/waiting` page.

**Tech Stack:** Next.js 16.4.2, Supabase, Vitest 4.1.11, ts-fsrs 5.4.2.

**Spec:** docs/superpowers/specs/2026-10-19-classes-flashcards-design.md plus the approved change request below.

## Context
The phase 3 deck is built (1,636 cards across CS 161, DATA 101 and PHILOS 12A) on branch `classes-flashcards`, which isn't merged yet. After first use, the user asked for four things:

1. Review everything together, or just one class from that class's page.
2. See what cards a class has and their progress or status.
3. Click the "N materials waiting" banner to see which materials are pending.
4. Make the 60-min daily budget understandable; today the UI doesn't explain it.

They also asked to stop `save.mjs` accepting self-contrast cards; this is a leftover finding.


## Global Constraints
- Read node_modules/next/dist/docs/ for any Next API you touch.
- One daily budget: class-scoped review filters the global day plan; it never plans a separate budget.
- PostgREST 1000-row cap: page large queries with `fetchAll` (src/lib/classes/cards/fetch-all.ts).
- Phone-first (390 px); reuse `_components/markdown.tsx`, `src/components/ui/*`, lucide icons.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `classes-flashcards`.

## Review Focus
1. A class with zero cards: Review card and Cards tab render an empty state, not errors.
2. A course filter on a course id the user doesn't own or that's hidden: empty, not a crash.
3. Budget bar when spent > budget (extra study): bar caps at full, text shows actual minutes.
4. Waiting page when nothing is waiting: says so; banner hidden.
5. Deleting a card in the Cards tab updates counts on reload and never resurrects.

---

### Task 1: Data layer — course filter, plan breakdown, cardStatus

- **Route:** `/classes/review?course=<id>`.
  - `getStudyOverview()` and `getExtraQueue()` in `src/app/(app)/classes/review/data.ts` take an optional `courseId`.
  - The shared `loadPlanningState` still plans the whole day, then the queue is filtered to that class.
  - This keeps one daily budget, so per-class sessions can't add up to double the new cards. "Learn 20 more" is filtered the same way.
- **UI:**
  - `[courseId]/page.tsx` Overview tab gets the same Review card, scoped to the class ("CS 161 · 14 due · ~6 min").
  - Extract the existing card from `classes/page.tsx` into `_components/review-card.tsx` with an optional `courseId`.
  - The session's `loadMoreCards` and `loadCards` actions pass `courseId` through.

- A third tab, `?tab=cards`, next to Overview and Materials.
- **Header stats** come from one new loader, `getDeckStats(courseId)`, which reuses `loadPlanningState`:
  - first-pass progress (explain introduced ÷ explain total, as a bar);
  - counts by state: New, Locked (concept not unlocked), Learning (state 1/3), Review, and Mastered (scheduled_days ≥ 21);
  - due today;
  - 30-day accuracy: the Good/Easy share of `card_reviews` in the last 30 days.

- Also from section 4: `planDay` returns `{ reviews, newExplain, newDeeper }` counts and getStudyOverview returns `spentMinutes` and `budgetMinutes`.
- `cardStatus(card, unlockedConceptIds, now)` → 'new'|'locked'|'learning'|'due'|'review'|'mastered' (+ due date), pure, tested in plan.test.ts.
- Data only in this task (loaders/actions + tests); UI in Tasks 2–3.

### Task 2: Review card extraction, class-scoped review, budget copy

- Extract the Classes home Review card into `src/app/(app)/classes/_components/review-card.tsx` with optional `courseId`; use it on the home and on the class Overview tab.
- `/classes/review?course=<id>` passes the course through page → session → `loadCards`/`loadMoreCards`.
- **Review card:**
  - Replace "N due · ~M min" with a breakdown, e.g. "8 reviews · 24 new · 12 deeper · ~38 min".
  - Add a thin bar showing today's minutes used out of the budget ("22 of 60 min today").
  - `planDay` already knows the parts. Return `{ reviews, newExplain, newDeeper, spentMinutes }` alongside the queue.
- **Settings `study-form.tsx`:** add help text under each field.
  - "Minutes per day: how much new material Hub plans each day. Reviews that are due always come first and aren't cut."
  - "Learn everything by: Hub introduces just enough new cards each day to finish the first pass by this date."
- **Session done screen:** "Today's plan is done (60 min budget). Learn 20 more goes beyond it."
- **Pace line:** "Backlog N% · on track", plus "(~X new/day)" when a target is set.

### Task 3: Cards tab

- A third tab, `?tab=cards`, next to Overview and Materials.
- **Header stats** come from one new loader, `getDeckStats(courseId)`, which reuses `loadPlanningState`:
  - first-pass progress (explain introduced ÷ explain total, as a bar);
  - counts by state: New, Locked (concept not unlocked), Learning (state 1/3), Review, and Mastered (scheduled_days ≥ 21);
  - due today;
  - 30-day accuracy: the Good/Easy share of `card_reviews` in the last 30 days.
- **Deck list:**
  - `getDeckCards(courseId)` is paged with the existing `fetchAll` and grouped by material, then concept, in material order.
  - Each row shows the level badge, the front (one line), and a status chip ("New", "Locked", "Due today", "Due in 4d", "Mastered").
  - Tapping a row expands the back, using `_components/markdown.tsx`, plus the source link.
  - Delete reuses `deleteCard`.
  - Each material group is collapsed by default with a card count, to keep the phone view short.
- Put the state-classification logic as a pure function in `src/lib/classes/cards/plan.ts`, e.g. `cardStatus(card, unlocked, now)`, with tests.

### Task 4: Waiting page + self-contrast validation

- The banner on `classes/page.tsx` becomes a link to `/classes/waiting`.
- **"Waiting to transcribe"** lists materials with status pending, processing or failed, excluding html and ipynb (the same filter as `getWaitingMaterialCount`). They're grouped by class and show their status, plus the error for failed ones. Each row links to the material's reader page, or to the source URL if it isn't ready.
- **"Need cards"** lists ready, parentless materials whose `cards_hash` is null or stale. This is the same rule as `make-cards/scripts/pending.mjs`; port that predicate to a TS helper next to `getWaitingMaterialCount`. A hint line says "run `/make-cards` in Claude Code".
- If the "Need cards" list isn't empty, the Classes home shows a small second banner linking to the same page.

- `.claude/skills/make-cards/scripts/merge.mjs` `validateCards` rejects a contrast whose `other_concept` resolves to the same concept as `concept`. Add a test.


## Verification
- `npm test`, `npm run typecheck` and `npx eslint src .claude/skills` pass.
- Playwright at 390 px, signing in through admin `generateLink` → `/auth/confirm` as before:
  - the home Review card shows the breakdown and budget bar;
  - a class page's Review card starts a session that contains only that class's cards;
  - the Cards tab shows stats and the grouped list, and expanding and deleting work (delete a throwaway card, then hard-delete it);
  - the waiting banner opens `/classes/waiting`.
- No real ratings are left behind; any test reviews are reverted.
