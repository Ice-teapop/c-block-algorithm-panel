export const LEARNING_CATALOG_SCHEMA_VERSION = 1;
export const DEFAULT_LEARNING_CATALOG_STORAGE_KEY = "c-block-algorithm-panel.learning-catalog";

export type LearningFragmentKind = "statement" | "control";
export type LearningTemplateOrigin = "builtin" | "custom";
export type LearningTemplateLifecycle = "active" | "deprecated";
export type LearningCatalogStorageStatus = "memory" | "empty" | "loaded" | "degraded";

export interface LearningStageDefinition {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly order: number;
  readonly prerequisites: readonly string[];
  readonly description: string;
}

/** A catalog item expands to exactly one top-level C statement or control fragment. */
export interface LearningTemplateDefinition {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly category: string;
  readonly stage: string;
  readonly source: string;
  readonly description: string;
  readonly fragmentKind: LearningFragmentKind;
}

export interface LearningTemplateDeprecation {
  readonly reason: string;
  readonly replacementId?: string;
}

export interface CatalogLearningTemplate extends LearningTemplateDefinition {
  readonly kind: "template";
  readonly origin: LearningTemplateOrigin;
  readonly lifecycle: LearningTemplateLifecycle;
  readonly deprecation?: LearningTemplateDeprecation;
}

/** Retired custom definitions retain identity and migration facts, never source text. */
export interface RetiredLearningTemplateTombstone {
  readonly kind: "tombstone";
  readonly origin: "custom";
  readonly lifecycle: "retired";
  readonly id: string;
  readonly lastVersion: string;
  readonly label: string;
  readonly category: string;
  readonly stage: string;
  readonly description: string;
  readonly reason: string;
  readonly replacementId?: string;
}

export type LearningCatalogEntry = CatalogLearningTemplate | RetiredLearningTemplateTombstone;

export interface LearningCatalogSnapshot {
  readonly schemaVersion: typeof LEARNING_CATALOG_SCHEMA_VERSION;
  readonly revision: number;
  readonly storageStatus: LearningCatalogStorageStatus;
  readonly stages: readonly LearningStageDefinition[];
  /** Active and deprecated definitions; retired definitions live only as tombstones. */
  readonly templates: readonly CatalogLearningTemplate[];
  readonly tombstones: readonly RetiredLearningTemplateTombstone[];
}

export interface LearningCatalogStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LifecycleChangeInput {
  readonly reason: string;
  readonly replacementId?: string;
}

export type LearningCatalogErrorCode =
  | "BUILTIN_IMMUTABLE"
  | "CUSTOM_ID_REQUIRED"
  | "DUPLICATE_TEMPLATE_ID"
  | "INVALID_LIFECYCLE"
  | "INVALID_STAGE"
  | "INVALID_TEMPLATE"
  | "REPLACEMENT_CYCLE"
  | "STAGE_CYCLE"
  | "STORAGE_WRITE_FAILED"
  | "TEMPLATE_NOT_FOUND"
  | "TEMPLATE_REFERENCED"
  | "TEMPLATE_RETIRED"
  | "UNKNOWN_REPLACEMENT"
  | "UNKNOWN_STAGE";

export class LearningCatalogError extends Error {
  readonly code: LearningCatalogErrorCode;

  constructor(code: LearningCatalogErrorCode, message: string, options?: ErrorOptions) {
    super(`${code}: ${message}`, options);
    this.name = "LearningCatalogError";
    this.code = code;
  }
}
