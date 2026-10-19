# Classes Flashcards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an FSRS flashcard deck generated from Hub's transcribed course materials, reviewed in a phone-first session that paces a backlog catch-up within a daily time budget. Then the project and assignment specs are added as sources.

**Architecture:**
- Cards live in Supabase (`concepts`, `cards`, `card_reviews`, `study_settings`) under the existing owner-RLS pattern.
- Pure TypeScript modules in `src/lib/classes/cards/` hold the scheduling (ts-fsrs) and session-planning logic, unit-tested with Vitest.
- A `/make-cards` Claude Code skill (mirroring `ingest-materials`) generates concepts and cards from `material_pages` and saves them with node scripts.
- The Next.js app adds a review session page, a Review card on `/classes`, and settings.

**Tech Stack:** Next.js 16.4.2 (App Router, server actions, `refresh()` from `next/cache`), Supabase (`@supabase/ssr`), ts-fsrs 5.4.2, Vitest 4.1.11, cheerio, turndown, zod.

**Spec:** `docs/superpowers/specs/2026-10-19-classes-flashcards-design.md`

## Global Constraints
- **Read first:** `node_modules/next/dist/docs/` for any Next API you touch (AGENTS.md: this Next has breaking changes).
- **Pin exact versions:** `ts-fsrs` `5.4.2` (not 6.x beta), `vitest` `4.1.11`.
- **Database:**
  - Every new table follows `supabase/migrations/20261019020709_materials.sql`: `user_id uuid not null default auth.uid() references auth.users on delete cascade`, RLS enabled, and the owner select/insert/update/delete policies.
  - Apply migrations with the Supabase MCP `apply_migration`, save the same SQL under `supabase/migrations/<timestamp>_<name>.sql`, then regenerate `src/lib/supabase/database.types.ts`.
- **Card levels:** exactly `'explain','why','apply','contrast','trap'`.
- **Defaults:** daily time budget 60 min (editable), session size 20 cards, plus "Keep going".
- **Rating buttons:** labels are exactly Again / Hard / Good / Easy.
- **Pace bar copy:** "Backlog N% · on track" or "Backlog N% · behind by M".
- **Review card copy:** "N due · ~M min".
- **Source links:** every card links to its source page: `/classes/<courseId>/m/<materialId>#p<page>` (the reader already renders `id="p{N}"`).
- **Skill scripts:** reuse `.claude/skills/ingest-materials/scripts/lib.mjs` (`db`, `ownerId`, `env`). Scratch files go only in `.cards/<materialId>/` (git-ignored).
- **Commits:** end each with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work happens on branch `classes-flashcards`.

## Review Focus
1. **Target date in the past or today, or no target set.** The explain budget must not divide by zero or go negative. No target means no catch-up pressure, and the budget falls back to whatever fits the time budget. *(Test in Task 2.)*
2. **More reviews due than the time budget allows.** Due reviews still come first, and new cards drop to 0. The session never shows new cards ahead of overdue ones. *(Test in Task 2.)*
3. **A deleted card or deleted concept on a `/make-cards` re-run.** It must not come back, and an edited card keeps its FSRS state. *(Test in Task 4.)*
4. **Rating the same card twice from a double tap or a stale session.** The second rating must not apply twice. `rateCard` checks that the card's `last_review` matches what the client saw. *(Test in Task 6.)*
5. **Days and timezones.** "Today" is computed in the user's timezone (reuse `today()` from `src/lib/dates.ts`, which uses `TIMEZONE`), not UTC, so the daily budget doesn't reset at 5 pm Pacific. *(Test in Task 2.)*

---

## Slice 1: deck, review, `/make-cards`

### Task 1: Test harness + FSRS wrapper

**Files:**
- Modify: `package.json` (add `ts-fsrs@5.4.2`, dev `vitest@4.1.11`, script `"test": "vitest run"`)
- Create: `vitest.config.ts` (node env, `@` → `src` alias, includes `src/**/*.test.ts` and `.claude/skills/**/*.test.mjs`)
- Create: `src/lib/classes/cards/fsrs.ts`
- Test: `src/lib/classes/cards/fsrs.test.ts`

**Interfaces:**
- Produces:
  - `type CardState = { due: string; stability: number; difficulty: number; elapsed_days: number; scheduled_days: number; learning_steps: number; reps: number; lapses: number; state: 0|1|2|3; last_review: string | null }`. This matches the `cards` columns.
  - `type Grade = 1|2|3|4` (Again..Easy)
  - `newCardState(now: Date): CardState`
  - `rate(card: CardState, grade: Grade, now: Date): { next: CardState; log: { rating: Grade; state_before: number; state_after: number; scheduled_days: number } }`
  - `isGraduated(card: CardState): boolean` (true when `state === 2`, i.e. Review)

- [ ] **Step 1: Write failing tests** in `fsrs.test.ts`:
  - `newCardState` returns `state: 0, reps: 0, due === now.toISOString()`.
  - `rate(new, 4 /*Easy*/, now)` → `next.state === 2`, `isGraduated(next) === true`, `next.scheduled_days >= 1`.
  - `rate(new, 1 /*Again*/, now)` → `next.state === 1`, `isGraduated(next) === false`.
  - Round trip: `rate` output passed back into `rate` works (strings in, strings out, with no `Date` objects leaking).
- [ ] **Step 2:** `npm test -- fsrs` → FAIL (module missing).
- [ ] **Step 3: Implement** with `fsrs({ enable_fuzz: true })` from ts-fsrs, converting ISO strings ↔ `Date` at the boundary.
- [ ] **Step 4:** `npm test -- fsrs` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5: Commit** `Add Vitest and an FSRS wrapper for flashcards`.

### Task 2: Session planner + pace (pure)

**Files:**
- Create: `src/lib/classes/cards/plan.ts`
- Test: `src/lib/classes/cards/plan.test.ts`

**Interfaces:**
- Consumes: `isGraduated` (Task 1).
- Produces:
  - `type PlanCard = { id: string; level: Level; concept_id: string | null; state: number; due: string; course_id: string; material_order: number; concept_position: number; introduced: boolean }`. Here `introduced` means `reps > 0`, and `material_order` is the material's `sort_date` rank.
  - `type Level = 'explain'|'why'|'apply'|'contrast'|'trap'`
  - `explainBudget(remainingExplain: number, today: string, target: string | null): number`. The result is `ceil(remaining / daysLeftInclusive)`. A past or `null` target returns `Infinity`, meaning time-limited only.
  - `secondsPerCard(history: { level: Level; seconds: number }[]): Record<Level, number>`. It returns the median per level and falls back to defaults `explain 20, why 40, apply 60, contrast 45, trap 45` when there are fewer than 10 samples.
  - `planDay(input: { cards: PlanCard[]; unlockedConceptIds: Set<string>; now: Date; today: string; target: string | null; budgetMinutes: number; introducedToday: { explain: number; deeper: number }; spentSecondsToday: number; perCard: Record<Level, number> }): { queue: string[]; dueCount: number; estMinutes: number }`. Order:
    1. Due introduced cards (`due <= now`), shuffled with a seeded shuffle keyed on `today`, so the order is stable within a day.
    2. New explain cards, sorted by `material_order`, then `concept_position`, alternating `course_id`, capped by `explainBudget − introducedToday.explain`.
    3. New deeper cards whose `concept_id` is in `unlockedConceptIds`, in the same order.

    Steps 2 and 3 stop when the cumulative estimated seconds plus `spentSecondsToday` exceed `budgetMinutes * 60`. Due cards are never cut.
  - `pace(totalExplain: number, introducedExplain: number, today: string, target: string | null): { percent: number; behindBy: number }`. Here `behindBy = max(0, expectedByToday − introducedExplain)`, with expected growing linearly from the first-introduction date. *Simplification allowed:* linear from the date the target was set, which is stored as `study_settings.target_set_on`.

- [ ] **Step 1: Write failing tests:**
  - `explainBudget(100, '2026-10-20', '2026-10-29')` → 10.
  - Target equal to today → 100.
  - Past target → `Infinity`. `null` → `Infinity`.
  - `planDay` with 300 due cards at 20 s and a 60-min budget → the queue contains all 300 due cards and zero new ones (Review Focus 2).
  - With 0 due cards, budget 10 min, explain at 20 s → 30 new explain cards, and those come before any deeper card.
  - A deeper card whose concept isn't unlocked is never queued.
  - Two courses with equal order alternate A, B, A, B.
  - The same `today` gives the same order. Changing `today` gives a different order.
  - `pace(200, 50, …)` → `percent: 25`.
- [ ] **Step 2:** `npm test -- plan` → FAIL.
- [ ] **Step 3: Implement** in `plan.ts`. Use a small seeded PRNG (mulberry32 over a string hash of `today`). Get `today` from the caller (Task 6 passes `today()` from `src/lib/dates.ts`). Planner functions never call `new Date()` themselves.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `Plan daily flashcard sessions within a time budget`.

### Task 3: Cards migration

**Files:**
- Create: `supabase/migrations/<timestamp>_cards.sql`
- Modify: `src/lib/supabase/database.types.ts` (regenerated)

**Schema:**
- **`concepts`:**
  - `id uuid pk, user_id, course_id → courses cascade, material_id → materials cascade, key text not null, title text not null, position int not null, deleted_at timestamptz`
  - `unique (material_id, key)`
- **`cards`:**
  - `id uuid pk, user_id, course_id → courses cascade, material_id → materials cascade, concept_id → concepts cascade (nullable), other_concept_id → concepts set null` (contrast cards only), `key text not null, page int, level text check (in the 5 levels), front text not null, back text not null, deleted_at timestamptz, created_at default now()`
  - Plus the FSRS columns exactly as `CardState` (Task 1): `due timestamptz not null default now()`, `state smallint not null default 0`, and so on.
  - `unique (material_id, key)`, index `(user_id, due) where deleted_at is null`.
- **`card_reviews`:** `id bigint identity pk, user_id, card_id → cards cascade, rating smallint check 1–4, state_before smallint, state_after smallint, scheduled_days int, seconds int, reviewed_at timestamptz default now()`, index `(user_id, reviewed_at)`.
- **`study_settings`:** `user_id pk default auth.uid(), target_date date, target_set_on date, budget_minutes int not null default 60 check (between 5 and 300)`.
- **`materials`:** add `cards_hash text`.

- [ ] **Step 1:** Write the SQL using the `do $$ … foreach t in array[...]` RLS loop from the materials migration.
- [ ] **Step 2:** Apply with `apply_migration`. Then `get_advisors` (security) → no new warnings for these tables.
- [ ] **Step 3:** Regenerate the types (`generate_typescript_types`) into `database.types.ts`. `npm run typecheck` → clean.
- [ ] **Step 4: Commit** `Add concepts, cards, reviews and study settings tables`.

### Task 4: `/make-cards` scripts

**Files:**
- Create: `.claude/skills/make-cards/scripts/{pending,context,save,check}.mjs`, `merge.mjs`
- Test: `.claude/skills/make-cards/scripts/merge.test.mjs`
- Modify: `.gitignore` (add `.cards/`), `.claude/settings.json` (allow `node .claude/skills/make-cards/scripts/*.mjs:*`, plus Read/Write/Edit `./.cards/**`)

**Interfaces:**
- **`cards.json` written by the skill:**
  ```json
  { "concepts": [{ "key": "c01", "title": "…", "position": 1, "existing_id": null }],
    "cards": [{ "key": "c01-explain", "concept": "c01", "other_concept_id": null,
                "level": "explain", "page": 3, "front": "…", "back": "…" }] }
  ```
  - `concept` is a key in this file, or `"id:<uuid>"` to attach to an existing concept from another material (enrich mode).
- **`merge.mjs`:** `planSave(existing: {concepts, cards}, incoming): { insertConcepts, updateConcepts, insertCards, updateCards }`. Rules:
  - Match on `key`.
  - A matched card updates `front/back/page/level` only, and its FSRS columns are untouched.
  - An existing row with `deleted_at` is never updated or re-inserted.
  - Existing keys missing from the incoming file are left alone (incremental).
- **`pending.mjs [--limit N] [--course X]`:**
  - Lists `ready` materials where `cards_hash is null or cards_hash <> content_hash`, ordered by `sort_date`.
  - HTML materials have no `content_hash`, so compare against `processed_at::text` and store that instead.
  - Output format matches ingest's `pending.mjs`.
- **`context.mjs <id>`:** writes `.cards/<id>/context.json` with `{ material: {id, kind, title, week_label, course}, pages: [{page, markdown}], course_concepts: [{id, title, material_title, week_label}], existing: {concepts, cards} }`. Solutions are included as `solutions_pages` when the material has a child.
- **`save.mjs <id> <cards.json>`:**
  - Validates levels and keys, checks that `page` is within `page_count`, and that every card has `concept` unless it's a contrast.
  - Applies `planSave`, then sets `materials.cards_hash`.
  - Prints the counts.
- **`check.mjs [--since ISO]`:** one line per material: title, concepts, then cards per level, flagged with `!` when there are 0 explain cards for a `slides` or `notes` material.

- [ ] **Step 1: Write failing `merge.test.mjs`:**
  - A new key → insert.
  - A same key with different text → update, and the returned update has no FSRS fields.
  - An existing deleted key that is also incoming → neither insert nor update (Review Focus 3).
  - An existing key absent from the incoming file → untouched.
- [ ] **Step 2:** `npm test -- merge` → FAIL.
- [ ] **Step 3:** Implement `merge.mjs`, then the four scripts.
- [ ] **Step 4:** `npm test` → PASS. Run `node .claude/skills/make-cards/scripts/pending.mjs` → it prints about 51 waiting plus the HTML readings. Run `context.mjs <a CS 161 lecture id>` → `context.json` has pages.
- [ ] **Step 5: Commit** `Add make-cards scripts with incremental, delete-safe saves`.

### Task 5: `/make-cards` SKILL.md

**Files:** Create `.claude/skills/make-cards/SKILL.md` (frontmatter `name: make-cards`; the description says to use it when Classes shows materials without cards, or the user runs /make-cards).

**Content (structure mirrors ingest's SKILL.md):**
1. **Workflow:**
   - `pending.mjs`.
   - Process in order: slides/notes first (they own concepts), then discussions, exam preps, exams and solutions (enrich), oldest week first.
   - Fan out to Sonnet subagents, about 150 pages per agent, with a lecture and its same-week discussion/exam prep in the same batch where possible.
   - Finish with `check.mjs --since`.
2. **Per material:** `context.mjs`, then write `.cards/<id>/cards.json`, then `save.mjs`.
3. **Card rules, copied to every subagent in full:**
   - **Concepts:** about one per 2–4 dense slides. Skip admin, agenda and recap slides. Concepts follow lecture order.
   - **Each concept gets** 1 explain card plus 1–3 deeper cards (why/apply). Add contrast where look-alikes exist in `course_concepts`.
   - **Explain:** the front is a question. The back is a ≤120-word mini-lesson for someone who skipped lecture, ending with no fluff.
   - **Why / apply:** aim for precision and edge cases, never a restated definition. Apply must be answerable in under 1 minute.
   - **Trap (from solutions):** "a common wrong answer is X; why is it wrong?" Attach it with `"concept": "id:<uuid>"` to the lecture concept it tests. Create a new concept only if no lecture concept covers it.
   - Readings and notes enrich existing concepts. They create new concepts only for uncovered ideas.
   - **Every card** has the `page` that supports it. Never assert anything that isn't on the cited pages. Markdown and KaTeX are allowed.
   - Keys are stable: `c<NN>` and `c<NN>-<level>[-n]`. On a re-run, keep existing keys and only add or edit.
4. Scratch files go only in `.cards/<id>/`.

- [ ] **Step 1:** Write SKILL.md.
- [ ] **Step 2: Dry run.** Run `/make-cards` on one CS 161 lecture plus its same-week discussion and exam prep. Then `check.mjs` → the lecture has concepts and explain cards, and the discussion/exam prep has trap cards whose `concept_id` belongs to the lecture's concepts (verify with SQL). Spot-check that 5 cards' pages support their backs.
- [ ] **Step 3: Commit** `Add the make-cards skill`.

### Task 6: Review data + actions

**Files:**
- Create: `src/app/(app)/classes/review/data.ts`, `src/app/(app)/classes/review/actions.ts`
- Test: `src/lib/classes/cards/rate-guard.test.ts` (pure guard)

**Interfaces:**
- Consumes: `planDay`, `pace`, `explainBudget`, `secondsPerCard` (Task 2); `rate`, `isGraduated` (Task 1).
- Produces:
  - `getStudyOverview(): Promise<{ dueCount: number; estMinutes: number; pace: { percent: number; behindBy: number } | null; queue: string[] }>`
    - Loads non-deleted cards (the columns `PlanCard` needs, joined to `materials.sort_date`), today's `card_reviews`, and `study_settings`.
    - `unlockedConceptIds` = concepts whose explain card `isGraduated`.
    - `today` comes from `today()` in `src/lib/dates.ts`.
  - `getCards(ids: string[]): Promise<ReviewCard[]>`, where `ReviewCard = { id, level, front, back, page, material_id, course_id, course_code, material_title, last_review }`.
  - Server action `rateCard(id: string, grade: Grade, seenLastReview: string | null, seconds: number): Promise<{ ok: boolean }>`.
    - It reads the card, and if `last_review !== seenLastReview` returns `{ ok: false }` without writing (Review Focus 4).
    - Otherwise it runs `rate`, updates the card, and inserts into `card_reviews` (`seconds` clamped to 0–600).
  - Server action `deleteCard(id: string)`: sets `deleted_at = now()`.
  - Server action `saveStudySettings(_prev, formData)` (zod: `target_date` optional date, `budget_minutes` int 5–300). It sets `target_set_on = today` when the target changes.

- [ ] **Step 1:** Extract the stale check as a pure `shouldApplyRating(current: string | null, seen: string | null): boolean`. Write a failing test: equal → true, different → false, both null → true.
- [ ] **Step 2:** `npm test` → FAIL, then implement → PASS.
- [ ] **Step 3:** Implement the data loaders and actions, following the `src/app/(app)/classes/actions.ts` patterns (`createClient`, `refresh()`).
- [ ] **Step 4:** `npm run typecheck && npm run lint` → clean.
- [ ] **Step 5: Commit** `Add flashcard review data and actions`.

### Task 7: Review session page

**Files:**
- Create: `src/app/(app)/classes/review/page.tsx` (server: `getStudyOverview`, then the first 20 ids, then `getCards`)
- Create: `src/app/(app)/classes/review/_components/session.tsx` (client)

**Behavior:**
- **Card view:** a progress bar "i / n" at the top. The card shows the front, and "Show answer" reveals the back.
  - Both sides use `Markdown` from `../_components/markdown.tsx`.
  - Below the back: a source link "<course_code> · <material_title> p.<page>" pointing to `/classes/<course_id>/m/<material_id>#p<page>`, plus a small level badge.
- **Rating:** the four buttons Again / Hard / Good / Easy call `rateCard` with the seconds since the answer was revealed.
  - An Again card goes back in the queue 3 positions later.
- **Delete:** an overflow action calls `deleteCard` and moves to the next card.
- **End of the session:** a done screen with the count reviewed and a "Keep going" button that loads the next 20 from the queue. When the queue is empty: "All caught up for today".
- Phone-first layout. The buttons are thumb-sized at the bottom.

- [ ] **Step 1:** Build it.
- [ ] **Step 2:** Use the `run` skill to start the dev server, then check it with Playwright at 390 px width:
  - Review a card through to a rating, and confirm a `card_reviews` row via SQL.
  - Delete works.
  - A double tap on Good writes one review.
  - KaTeX renders on a CS 161 card.
- [ ] **Step 3: Commit** `Add the flashcard review session`.

### Task 8: Classes home Review card, settings, card counts

**Files:**
- Modify: `src/app/(app)/classes/page.tsx` (a Review card above Due soon)
- Modify: `src/app/(app)/classes/settings/page.tsx` (a Study form: target date, daily minutes)
- Modify: `src/app/(app)/classes/data.ts` (`getMaterials` adds `cards(count)` filtered to non-deleted), `src/app/(app)/classes/[courseId]/page.tsx` (show "N cards" on each material row)

**Behavior:**
- **The Review card** shows:
  - "N due · ~M min";
  - the pace bar ("Backlog N% · on track" or "Backlog N% · behind by M") when a target is set;
  - a Start button linking to `/classes/review`.
- When the deck is empty, the card instead says "No cards yet · run `/make-cards` in Claude Code", in the style of the existing waiting banner.

- [ ] **Step 1:** Build it.
- [ ] **Step 2:** Check in the dev server:
  - Setting a target date shows the pace bar.
  - Changing the daily minutes changes "~M min" and the size of the new-card queue.
  - The course page shows card counts.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npm test` → clean.
- [ ] **Step 4: Commit** `Show review status on Classes and add study settings`.

### Task 9: Slice 1 backlog run

- [ ] **Step 1:** Run `/make-cards` over all pending materials, in rounds as usage allows. Then `check.mjs --since <start>` → no `!` lines.
- [ ] **Step 2:** SQL: count cards per course and level. Every slides material has explain cards, and trap cards exist for discussions and exam preps.
- [ ] **Step 3:** Push the branch and deploy a preview (`vercel:deploy`). Review a session on the phone.

---

## Slice 2: projects and assignments as sources

### Task 10: Kinds and formats migration
- Create: `supabase/migrations/<timestamp>_materials_projects.sql`. It widens `materials.kind` to add `'project','homework'` and `materials.format` to add `'ipynb'` (drop and re-add the check constraints).
- Update `src/lib/classes/materials/types.ts` unions, plus the kind badges and labels on the course page.
- Apply, `get_advisors`, regenerate types, typecheck. Commit `Allow project and homework materials`.

### Task 11: CS 161 project spec pages

**Files:** Modify `src/lib/classes/materials/sites/cs161.ts`. Test: `src/lib/classes/materials/sites/cs161.test.ts` with a saved HTML fixture `__fixtures__/cs161-home.html` (fetched once with curl into the fixture folder).

- **Discovery:**
  - Collect nav links matching `^/proj\d+/` (the `/projN/` index and its subpages), deduplicated.
  - Add each as `{ kind: 'project', format: 'html', title: 'Project N: <link text>', sourceUrl: absolute }`.
  - `weekLabel` stays null. `sortDate` is the project's checkpoint or due date from the calendar row linking `/projN`, if one is present.
- HTML project pages go through the existing `convertReading()` path in `readings.ts`, so they're saved as `ready` without Claude.
- **Test:** the fixture yields `/proj1/`, `/proj1/customizing/` and `/proj1/deliverables/` as `project` items, with no duplicates and no non-project nav links.
- **Verify:** Sync now, then SQL shows them `ready` with Markdown. Commit.

### Task 12: DATA 101 notebooks

**Files:**
- Create: `src/lib/classes/materials/notebook.ts`
- Modify: `src/lib/classes/materials/sites/data101.ts`
- Test: `src/lib/classes/materials/notebook.test.ts`

**Interfaces:**
- `datahubToRaw(href: string): string | null`. It parses the `repo`, `branch` and `urlpath` query params of a DataHub `git-pull` link and returns `https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path after "lab/tree/<repo>/">`.
- `notebookToMarkdown(json: unknown): string`. Markdown cells pass through unchanged. Code cells become ```` ```python ```` fences. Outputs are dropped. Cells are joined by blank lines.

**Discovery:**
- Schedule links whose text starts with "Project" become `{ kind: 'project', format: 'ipynb', title: 'Project N' }`.
- Discussion "Notebook" links become `{ kind: 'discussion', format: 'ipynb', title: '<discussion label> notebook', parentUrl: <that discussion's worksheet url> }`.
- In the readings step, `ipynb` is fetched raw, converted, and saved as a single `ready` page.

**Tests:**
- The proj1 href from the site (`…repo=https%3A%2F%2Fgithub.com%2Fdata-101-berkeley%2Ffa26-materials&branch=main&urlpath=lab%2Ftree%2Ffa26-materials%2Fproj%2Fproj1%2Fproj1.ipynb`) maps to `https://raw.githubusercontent.com/data-101-berkeley/fa26-materials/main/proj/proj1/proj1.ipynb`.
- The proj0 href, which has its params in a different order, maps correctly.
- A notebook with one markdown cell and one code cell converts to the expected string.

**Verify:** Sync now. Then SQL: Projects 0–2 and the discussion notebooks are `ready`. Commit.

### Task 13: PHILOS 12A bCourses assignments
- **Modify:** `src/lib/classes/materials/canvas-files.ts`, adding `discoverCanvasAssignments(...)` next to the file discovery. It uses the existing Canvas client in `src/lib/classes/canvas.ts`, `GET /api/v1/courses/:id/assignments?per_page=100`, and keeps assignments with a non-empty `description`.
- **Each assignment** becomes `{ kind: 'homework', format: 'html', title: name, sortDate: due_at, sourceUrl: html_url }`. Its description HTML goes through the same HTML-to-Markdown conversion as readings and is saved `ready` immediately. The URL isn't fetchable without auth, so the description is passed straight in.
- **Verify:** Sync now. Then SQL: PHILOS homework rows are `ready` with Markdown. Commit.

### Task 14: Cards for the new sources
- Add guidance to `make-cards` SKILL.md: project and homework materials produce key-idea and design-reasoning cards (why/apply), not code. They enrich the course's lecture concepts where they match.
- Run `/make-cards` on the new materials, then `check.mjs`. Spot-check 5 project cards against the spec pages.
- Commit, push, deploy the preview, then merge to main when the user approves.
