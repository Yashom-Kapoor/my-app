# Classes, phase 3: flashcards + spaced repetition (design)


## Context
**Where we are:** Phases 1 (deadlines + inbox) and 2 (materials + reader, 51 materials / 1,603 pages transcribed) are done. The ingest hardening is on main too: it was already merged on origin, and local main was fast-forwarded. Phases 4 (Learn + tutor) and 5 (exam prep) come later.

**Why phase 3 (user's words, paraphrased):**
- The user grasps concepts quickly and gets A's by cramming the day before and leaning on the curve.
- Before a midterm they built a big reference sheet of concepts they "should have already known deeply."
- The goal is to go from A to A+ through simple, effective habits, with spaced repetition as the core so they *really* know the material.
- They don't watch lecture, so the deck is also their **first pass** through the material. It has to be friendly as a first exposure and then build to depth and rigor.

**Timing:** about 7 weeks of backlog across CS 161, DATA 101 and PHILOS 12A. Midterms are in 2–3 weeks. The user is somewhat familiar with the material and fine working overtime. No special module for this Thursday's PHILOS quiz.

## Goals
- A spaced-repetition deck (FSRS) built from every class's materials, including projects and assignments.
- The deck works as a first pass (introduced in lecture order, asks before it teaches) and then gets deep (why / apply / contrast / exam-trap cards).
- Weighted toward depth and precision, not trivia, because the user picks up basics fast.
- The backlog gets caught up by a target date, with a visible pace.
- Works for quick phone bursts and for longer dedicated sessions.

## Non-goals
- Full multi-step problems on cards. Worksheet-style practice belongs to phases 4 and 5.
- In-app AI or per-token billing. Card generation runs in Claude Code.
- Scraping Gradescope-only homework (e.g. DATA 101 HW 1), recordings, a special quiz mode.
- Heavy gamification (XP, leaderboards, badges).

## Anti-goals (failure even if it "works")
- A deck full of easy definitions that bores the user and wastes their time.
- A review pile that grows into dread. New cards are capped, and due reviews come first.
- Cards that say something the material doesn't. Every card cites its source page.

## Decisions (user)
- New cards go **straight into the deck**. The user deletes duds as they review.
- **Cards are generated in Claude Code** with a `/make-cards` skill, like `/ingest-materials`, on the user's subscription. New lectures get cards when the skill runs.
- **Self-grading:** flip the card, then tap Again / Hard / Good / Easy. FSRS schedules from that.
- **Both review styles,** with a light Quizlet-style progress bar.
- **Projects and assignments are included,** because exams draw on them and the project ideas are worth reviewing.

## How it works

### Card shape
- **Concepts** are the unit. Each one is a teachable idea from a material, kept in lecture order. Each concept has a ladder of cards:
  - **explain:** what it is. The front asks; the back is a short, clear mini-lesson. This is the first-pass card.
  - **why:** why it's true or needed.
  - **apply:** a small case answerable in under a minute ("given this one-line scheme, what breaks?").
- **Contrast** cards cover look-alike concepts (MAC vs. signature, IND-CPA vs. IND-CCA). Each one links to both concepts.
- **Trap** cards come from exam preps, exams, discussions and their solutions: a common wrong answer or edge case and why it's wrong. They attach to the lecture concept they test.
- **Project/assignment cards** cover key ideas and design reasoning ("why does the client need to do X?"), not code.
- Every card stores its source material + page. The back links to the reader at that page.

### First pass, then depth
- **New cards are introduced in lecture order,** concept by concept, as a guided walk through each lecture. Classes alternate, oldest backlog first.
- **Only explain cards start unlocked.** A concept's why / apply / contrast / trap cards unlock once its explain card has graduated, meaning FSRS has moved it out of learning into review. *Builder's call:* the exact graduation rule.
- Once introduced, reviews are shuffled across all classes (interleaving).

### Catch-up pace
- **Settings take a target date,** for example "caught up by Nov 7".
- Daily explain budget = remaining unintroduced explain cards ÷ days left, rounded up. It sits inside the daily time budget (see "Calls made after the builder check"). If the two conflict, the time budget wins and the pace bar shows "behind".
- The Classes home shows a pace bar: "Backlog 38% · on track" or "behind by N". Doing extra is always allowed.

### Review UI
- **Classes home:** a "Review" card shows "N due · ~M min" plus the pace bar, and starts a session.
- **Session (`/classes/review`):** phone-first.
  - Front, then a tap to show the back (rendered with the existing `_components/markdown.tsx`, so KaTeX works).
  - Four rating buttons, a progress bar ("12 / 20"), and a source link.
  - A delete action for duds.
  - Default session of 20 cards. "Keep going" continues.
  - Due reviews come first, then today's new cards.
  - *Builder's call:* an optional single-class filter.
- **Course page:** each material row shows its card count. *Builder's call:* a small per-course deck stat.

### Data model (new migration, same RLS/owner pattern as `20261019020709_materials.sql`)
- **`concepts`**
  - Columns: `id, user_id, course_id, material_id, title, position` (order within the material).
- **`cards`**
  - Card columns: `id, user_id, course_id, concept_id (nullable for contrast), material_id, page, level ('explain','why','apply','contrast','trap'), front, back` (Markdown), `deleted_at`.
  - FSRS state columns: `due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review`.
  - Contrast cards point at their second concept through a small `card_concepts` join, or a `concept_ids uuid[]`. *Builder's call.*
- **`card_reviews`:** an append-only log (`card_id, rating, reviewed_at, state before/after`) for stats and future FSRS parameter tuning.
- **`study_settings`:** a single row with `target_date`.
- **FSRS library:** `ts-fsrs` pinned at 5.4.2, the current stable release. 6.0 is still in beta.

### Card generation: `.claude/skills/make-cards/`
- Mirrors `ingest-materials`:
  - `SKILL.md` orchestrates. Sonnet subagents work in page-sized batches, scratch files go in a per-material folder under `.cards/<id>/` (git-ignored), and a check script runs at the end.
  - Scripts reuse `ingest-materials/scripts/lib.mjs` (`db`, `ownerId`, `.env.local`).
- **`pending.mjs`:** lists `ready` materials with no concepts yet, or whose `content_hash`/`processed_at` changed since cards were made.
- **`context.mjs <id>`:** writes the material's pages, plus the titles of related concepts that already exist for that course and week, so trap and contrast cards can link to them.
- **`save.mjs <id> cards.json`:** upserts concepts and cards. On a re-run it keeps the FSRS state of unchanged cards and doesn't resurrect deleted ones.
- **`check.mjs`:** counts per material and level.
- **Generation guidance in SKILL.md:**
  - About one concept per 2–4 dense slides.
  - Skip filler: admin slides, "today's agenda", recaps.
  - Explain backs are short and teach, written for someone who skipped lecture.
  - Why/apply cards go for precision and edge cases, not restating the definition.
  - Solutions drive trap cards.
  - Never assert anything that isn't in the material.
- *Builder's call:* the exact JSON schema, batch sizes, and how much the first backlog run is split up.

### Ingesting projects and assignments (extends phase 2 discovery)
- Add `project` and `homework` to `materials.kind`, and `ipynb` to `materials.format`.
- **CS 161:** discover the `/projN/` spec pages and their subpages (e.g. `/proj1/`, `/proj1/customizing/`, `/proj1/deliverables/`) in `src/lib/classes/materials/sites/cs161.ts`. Save them as HTML readings that are `ready` without Claude, the way textbook pages work in `readings.ts`.
- **DATA 101:** the schedule links proj0–2 and the discussion notebooks as DataHub git-pull URLs pointing into the public repo `data-101-berkeley/fa26-materials`.
  - Map each one to the raw GitHub `.ipynb`.
  - Convert markdown cells plus fenced code cells to Markdown, and save it as `ready`.
  - Discussion notebooks attach to their discussion as extra material.
- **PHILOS 12A:** pull assignment descriptions with the existing bCourses token (`canvas.ts`), and save them as `homework`, `ready`.
- Gradescope-only homework stays out of scope.

## Calls made after the builder check (Claude's, not the user's; the user can override)
- **Lectures own the concepts.**
  - Readings (textbook, DATA 101 notes), discussions, exam preps, exams and projects mostly *enrich* existing lecture concepts with why/apply/trap cards.
  - They create a new concept only when no lecture covers the idea. `context.mjs` passes in the course's existing concepts so the skill can deduplicate.
- **Re-runs are incremental.**
  - `/make-cards` on a changed material gets its existing concepts and cards as input, adds cards only for new content, and edits cards the new transcription contradicts. Reviewed cards keep their FSRS state.
  - A `cards_hash` column on `materials` records the `content_hash` the cards were made from, which is how `pending.mjs` spots a change.
- **Ship in two slices.** First the deck + review + `/make-cards` on what's already ingested, so reviewing starts sooner. Then project/assignment ingestion, then cards for those.
- **Daily volume (user chose about 60 min/day during the catch-up):**
  - `study_settings` stores a daily time budget, default 60 min, editable.
  - Each day's session plan:
    1. Due reviews.
    2. The explain-card budget needed to hit the target date.
    3. Unlocked deeper cards fill whatever time is left.
  - That makes it a hard daily ceiling on new cards of any level. Leftover unlocked cards wait and keep flowing after the backlog is done.
  - Time per card is estimated from `card_reviews` once there's history, with a sensible default to start. The pace bar tracks the explain-card first pass. "N due · ~M min" counts only what fits today's budget.

## What's left to the builder
- The FSRS graduation rule for unlocking, the budget floor and cap, the session size default, and the exact time-per-card estimate.
- The table and index details, the contrast-card linking shape, and how the session picks and orders cards.
- Notebook-to-Markdown conversion details, and how to match a DATA 101 notebook URL to its raw path.

## Verification
- Migration, then `get_advisors`. Typecheck and lint.
- Discovery: Sync now. Then check with SQL that CS 161 project pages, DATA 101 notebooks and PHILOS assignments appear as `ready` with sane Markdown.
- `/make-cards` on one CS 161 lecture plus its discussion and exam prep:
  - Inspect the concepts and ladders.
  - Check that trap cards link to lecture concepts.
  - Confirm every card cites a real page.
- Review flow at phone width:
  - A new card, then rate it.
  - After graduation, the deeper cards unlock.
  - Deleting a card removes it.
  - The pace bar moves after a target date is set.
- Then the full backlog generation run.
