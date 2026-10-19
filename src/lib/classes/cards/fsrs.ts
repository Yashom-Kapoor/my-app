import { createEmptyCard, fsrs, type Card, type Grade as FsrsGrade } from "ts-fsrs";

/** Plain-JSON card scheduling state; matches the `cards` table columns. */
export type CardState = {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  /** 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: 0 | 1 | 2 | 3;
  last_review: string | null;
};

/** 1 Again, 2 Hard, 3 Good, 4 Easy */
export type Grade = 1 | 2 | 3 | 4;

export type ReviewLogEntry = {
  rating: Grade;
  state_before: number;
  state_after: number;
  scheduled_days: number;
};

const scheduler = fsrs({ enable_fuzz: true });

function toCard(c: CardState): Card {
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  };
}

function fromCard(c: Card): CardState {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

export function newCardState(now: Date): CardState {
  return fromCard(createEmptyCard(now));
}

export function rate(
  card: CardState,
  grade: Grade,
  now: Date,
): { next: CardState; log: ReviewLogEntry } {
  const { card: next } = scheduler.next(toCard(card), now, grade as FsrsGrade);
  return {
    next: fromCard(next),
    log: {
      rating: grade,
      state_before: card.state,
      state_after: next.state,
      scheduled_days: next.scheduled_days,
    },
  };
}

export function isGraduated(card: CardState): boolean {
  return card.state === 2;
}
