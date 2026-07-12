export type LibraryBranchId =
  | "manual"
  | "canvas-wires"
  | "execution-diagnostics"
  | "c-syntax"
  | "standard-library"
  | "data-structure-dictionary"
  | "algorithms-complexity"
  | "examples"
  | "recovery"
  | "extension-api"
  | "onboarding";

export interface LibraryBranchDefinition {
  readonly id: LibraryBranchId;
  readonly label: string;
  readonly description: string;
  readonly order: number;
}

export type LibraryExampleLanguage = "c" | "typescript" | "json" | "text";

export interface LibraryCodeExample {
  readonly language: LibraryExampleLanguage;
  readonly caption: string;
  readonly code: string;
}

export interface LibraryFeatureLink {
  readonly label: string;
  readonly pageId: string;
  readonly targetId: string;
}

export type LibraryAudience = "learner" | "help" | "developer";

export type LibraryTutorialLevel = "beginner" | "intermediate";

export type LibraryTutorialArtifactKind = "source" | "snippet" | "stdin" | "expected-output";

export interface LibraryTutorialArtifact {
  readonly kind: LibraryTutorialArtifactKind;
  readonly example: LibraryCodeExample;
}

export interface LibraryTutorialStep {
  readonly id: string;
  readonly title: string;
  readonly instruction: string;
  readonly artifacts: readonly LibraryTutorialArtifact[];
  readonly featureLink: LibraryFeatureLink | null;
  readonly check: string;
}

export interface LibraryTutorial {
  /** Opens the evidence-gated lesson instead of rendering its missions as static prose. */
  readonly guidedLessonId?: string | undefined;
  readonly pathId: string;
  readonly order: number;
  readonly level: LibraryTutorialLevel;
  readonly estimatedMinutes: number;
  readonly prerequisiteEntryIds: readonly string[];
  readonly learningGoals: readonly string[];
  readonly steps: readonly LibraryTutorialStep[];
  readonly completionChecks: readonly string[];
}

export interface LibraryEntry {
  readonly id: string;
  readonly branchId: LibraryBranchId;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly details: readonly string[];
  readonly keywords: readonly string[];
  readonly example: LibraryCodeExample | null;
  readonly relatedEntryIds: readonly string[];
  readonly featureLink: LibraryFeatureLink | null;
  /** Intended reader. Older catalogs omit this and are normalized by branch. */
  readonly audience?: LibraryAudience | undefined;
  /** Compact grammar or block notation when it differs from the runnable example. */
  readonly syntax?: LibraryCodeExample | null | undefined;
  /** Complexity statement backed by the entry's stated operation and assumptions. */
  readonly complexity?: string | null | undefined;
  /** Frequent misconceptions or unsafe usage patterns. */
  readonly pitfalls?: readonly string[] | undefined;
  /** Optional guided path. Dictionary-only entries remain valid without it. */
  readonly tutorial?: LibraryTutorial | null | undefined;
}

export interface LibraryEntryInput {
  readonly id: string;
  readonly branchId: LibraryBranchId;
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly aliases?: readonly string[] | undefined;
  readonly keywords?: readonly string[] | undefined;
  readonly example?: LibraryCodeExample | null | undefined;
  readonly relatedEntryIds?: readonly string[] | undefined;
  readonly featureLink?: LibraryFeatureLink | null | undefined;
  readonly audience?: LibraryAudience | undefined;
  readonly syntax?: LibraryCodeExample | null | undefined;
  readonly complexity?: string | null | undefined;
  readonly pitfalls?: readonly string[] | undefined;
  readonly tutorial?: LibraryTutorial | null | undefined;
}

export interface LibrarySearchResult {
  readonly entry: LibraryEntry;
  readonly score: number;
  readonly matchedFields: readonly (
    | "title"
    | "alias"
    | "summary"
    | "detail"
    | "keyword"
    | "code"
    | "syntax"
    | "complexity"
    | "pitfall"
    | "tutorial"
    | "related"
  )[];
}

export interface LibrarySearchOptions {
  readonly branchId?: LibraryBranchId | undefined;
  readonly branchIds?: readonly LibraryBranchId[] | undefined;
  readonly audiences?: readonly LibraryAudience[] | undefined;
  readonly limit?: number | undefined;
}
