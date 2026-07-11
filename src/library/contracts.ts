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
}

export interface LibrarySearchResult {
  readonly entry: LibraryEntry;
  readonly score: number;
  readonly matchedFields: readonly (
    "title" | "alias" | "summary" | "detail" | "keyword" | "code"
  )[];
}

export interface LibrarySearchOptions {
  readonly branchId?: LibraryBranchId | undefined;
  readonly limit?: number | undefined;
}
