export type FoaLocale = "zh" | "en";

export interface FoaLocalizedText {
  readonly zh: string;
  readonly en: string;
}

export type FoaLessonMode =
  "semantic" | "block-observe" | "block-complete" | "block-compose" | "workspace-evidence";

export type FoaLessonPresentation = "worked-example" | "faded-example" | "independent";
export type FoaLessonInteraction = "direct-manipulation" | "guided-blocks" | "workspace";

export type FoaVisualFamily =
  | "execution"
  | "pipeline"
  | "state"
  | "expression"
  | "decision"
  | "loop"
  | "sequence"
  | "call-stack"
  | "memory"
  | "pointer-graph"
  | "tree"
  | "stream"
  | "search"
  | "sorting"
  | "evidence"
  | "bit-grid"
  | "preprocessor"
  | "dependency";

export interface FoaLessonExperience {
  readonly visualFamily: FoaVisualFamily;
  readonly visualModel: FoaLocalizedText;
  readonly primaryAction: FoaLocalizedText;
  readonly semanticSequence: readonly FoaLocalizedText[];
  readonly playbackMs: number;
  readonly playbackPolicy: "guided" | "manual";
  readonly persistentEvidence: FoaLocalizedText;
  readonly hiddenByDefault: FoaLocalizedText;
  readonly researchUrls: readonly string[];
}

export interface FoaKnowledgePoint {
  readonly id: string;
  readonly title: FoaLocalizedText;
  readonly explanation: FoaLocalizedText;
}

export interface FoaLessonCase {
  readonly stdin: string;
  readonly stdout: string;
  readonly description: FoaLocalizedText;
}

export interface FoaWorkspaceExerciseCase extends FoaLessonCase {
  readonly id: string;
  readonly size: number;
}

/**
 * A bounded structural requirement evaluated against the learner's actual C source. Patterns are
 * authored with the curriculum and never accept user-provided regular expressions.
 */
export interface FoaWorkspaceSourceRequirement {
  readonly id: string;
  readonly label: FoaLocalizedText;
  readonly pattern: string;
}

export interface FoaWorkspaceExercise {
  readonly initialSource: string;
  readonly cases: readonly FoaWorkspaceExerciseCase[];
  readonly sourceRequirements: readonly FoaWorkspaceSourceRequirement[];
}

export type FoaLessonCode =
  | {
      readonly kind: "complete";
      readonly text: string;
      readonly placeholders: readonly [];
    }
  | {
      readonly kind: "template";
      readonly text: string;
      readonly placeholders: readonly string[];
    };

export interface FoaComplexity {
  readonly time: string;
  readonly space: string;
  readonly explanation: FoaLocalizedText;
}

export type FoaSemanticEventType =
  | "read"
  | "bind"
  | "compare"
  | "branch"
  | "iterate"
  | "call"
  | "return"
  | "write"
  | "allocate"
  | "release"
  | "measure";

/**
 * An exact, single-line slice of generated C source. Guided lessons require this slice to occur
 * exactly once; consumers must reject missing or ambiguous anchors instead of guessing by event
 * type.
 */
export interface FoaSemanticSourceAnchor {
  readonly exact: string;
}

export interface FoaSemanticEvent {
  readonly id: string;
  readonly type: FoaSemanticEventType;
  readonly label: FoaLocalizedText;
  readonly codeAnchor: string;
  readonly sourceAnchor: FoaSemanticSourceAnchor | null;
}

export type FoaSemanticRelationRole =
  "input" | "value" | "predicate" | "control" | "mutation" | "output" | "evidence";

export interface FoaSemanticRelation {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly role: FoaSemanticRelationRole;
  readonly label: FoaLocalizedText;
}

export interface FoaFadingPlan {
  readonly level: 0 | 1 | 2 | 3 | 4;
  readonly shownSteps: readonly string[];
  readonly learnerSteps: readonly string[];
  readonly hintPolicy: FoaLocalizedText;
}

export interface FoaLessonDefinition {
  readonly id: string;
  readonly order: number;
  readonly chapter: number;
  readonly section: string;
  readonly title: FoaLocalizedText;
  readonly summary: FoaLocalizedText;
  readonly sourceAttribution: "FOA topic adapted";
  readonly evidenceBoundary: FoaLocalizedText;
  readonly mode: FoaLessonMode;
  readonly presentation: FoaLessonPresentation;
  readonly interaction: FoaLessonInteraction;
  readonly experience: FoaLessonExperience;
  readonly prerequisiteIds: readonly string[];
  readonly objectives: readonly FoaLocalizedText[];
  readonly knowledgePoints: readonly FoaKnowledgePoint[];
  readonly case: FoaLessonCase;
  readonly code: FoaLessonCode;
  readonly workspaceExercise: FoaWorkspaceExercise | null;
  readonly complexity: FoaComplexity;
  readonly semanticEvents: readonly FoaSemanticEvent[];
  readonly relations: readonly FoaSemanticRelation[];
  readonly fading: FoaFadingPlan;
  readonly libraryKnowledgeIds: readonly string[];
}

export interface FoaChapterDefinition {
  readonly chapter: number;
  readonly title: FoaLocalizedText;
  readonly lessonIds: readonly string[];
}

export function foaText(zh: string, en: string): FoaLocalizedText {
  if (zh.trim().length === 0 || en.trim().length === 0) {
    throw new TypeError("FOA bilingual text must contain both Chinese and English");
  }
  return Object.freeze({ zh, en });
}
