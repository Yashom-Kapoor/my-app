// Shapes shared by the material discovery adapters.

export type MaterialKind = "slides" | "discussion" | "solutions" | "exam_prep" | "exam" | "notes" | "other";
export type MaterialFormat = "pdf" | "gslides" | "html";

export type FoundMaterial = {
  kind: MaterialKind;
  format: MaterialFormat;
  title: string;
  weekLabel: string | null;
  /** YYYY-MM-DD */
  sortDate: string | null;
  sourceUrl: string;
  /** For solutions: the source URL of the worksheet they answer. */
  parentUrl?: string;
};

export const KIND_LABELS: Record<MaterialKind, string> = {
  slides: "Slides",
  discussion: "Discussion",
  solutions: "Solutions",
  exam_prep: "Exam prep",
  exam: "Exam",
  notes: "Notes",
  other: "Other",
};
