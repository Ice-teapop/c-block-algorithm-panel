import type { PanelApi } from "../shared/api.js";
import type { FoaLocale } from "../tutorials/foa-contracts.js";

/** Transient renderer phase only; the caller owns persisted course progress. */
export type FoaTaskLessonPhase = "intro" | "task" | "completed";

export type FoaLocalEvidenceType =
  | "semantic-sequence-completed"
  | "block-observation-completed"
  | "block-gap-completed"
  | "block-composition-completed";

/** Proves only a bounded learner action; it is not evidence of C execution. */
export interface FoaTaskLessonLocalEvidence {
  readonly type: FoaLocalEvidenceType;
  readonly lessonId: string;
  readonly complete: true;
}

/** Must originate from the verified workspace pipeline, never from a lesson renderer. */
export interface FoaVerifiedWorkspaceEvidence {
  readonly lessonId: string;
  readonly mastered: boolean;
  readonly completedCaseId: string | null;
  readonly nextCaseId: string | null;
  readonly verified: true;
}

/** Host-owned services and callbacks exposed to a lesson renderer. */
export interface FoaTaskLessonOptions {
  readonly locale: FoaLocale;
  readonly traceApi?: Pick<PanelApi, "startTrace" | "readTrace" | "cancelTrace"> | undefined;
  readonly onPhaseChange?: ((phase: FoaTaskLessonPhase) => void) | undefined;
  readonly onLocalEvidence?: ((evidence: FoaTaskLessonLocalEvidence) => void) | undefined;
  readonly onOpenWorkspace?: (() => void) | undefined;
  readonly onOpenLibraryEntry?: ((entryId: string) => void) | undefined;
  readonly reducedMotion?: boolean | undefined;
}

/** Public lifecycle shared by every FOA lesson renderer. */
export interface FoaTaskLesson {
  readonly phase: FoaTaskLessonPhase;
  setLocale(locale: FoaLocale): void;
  setVerifiedWorkspaceEvidence(evidence: FoaVerifiedWorkspaceEvidence): void;
  setReducedMotion(reducedMotion: boolean): void;
  destroy(): void;
}
