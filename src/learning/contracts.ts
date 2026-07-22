export const LEARNING_CATALOG_SCHEMA_VERSION = 1;
export const DEFAULT_LEARNING_CATALOG_STORAGE_KEY = "c-block-algorithm-panel.learning-catalog";

export type LearningFragmentKind = "statement" | "control";
export type LearningTemplateOrigin = "builtin" | "custom";
export type LearningTemplateLifecycle = "active" | "deprecated";
export type LearningCatalogStorageStatus = "memory" | "empty" | "loaded" | "degraded";

export type PresetBlockKind = "statement" | "control" | "function" | "module" | "virtual";
export type PresetBlockLifecycle = "active" | "deprecated" | "retired";
export type PresetPortDirection = "input" | "output";
export type PresetPortChannel = "control" | "data";
export type PresetPortCardinality = "one" | "many";
export type PresetPlacementScope = "function-body" | "flow-canvas";
/**
 * Structural C locations exposed by the projected block tree. These are UX hints only:
 * the parser, exact source diff and CFG gate remain authoritative for every insertion.
 */
export type PresetSyntaxSlotKind = "function-body" | "compound-body" | "loop-body" | "switch-case";

/** Enclosing control constructs that make context-sensitive statements legal. */
export type PresetSyntaxAncestorCapability = "loop" | "switch";

export interface PresetProvidedSyntaxSlot {
  readonly id: string;
  readonly label: string;
  readonly kind: PresetSyntaxSlotKind;
  readonly cardinality: PresetPortCardinality;
  /** Stable semantic branch such as true, false, body, case-0 or default. */
  readonly branch?: string;
}

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

export interface PresetPortDefinition {
  readonly id: string;
  readonly label: string;
  readonly direction: PresetPortDirection;
  readonly channel: PresetPortChannel;
  readonly cardinality: PresetPortCardinality;
  readonly dataType?: string;
  /** Stable semantic branch such as true, false, body, exit or default. */
  readonly branch?: string;
}

export interface PresetPlacementCondition {
  readonly scope: PresetPlacementScope;
  readonly allowedParentNodeTypes: readonly string[];
  readonly requiresHeaders: readonly string[];
  readonly requiresSymbols: readonly string[];
  /** Candidate structural slots shown before the source/CFG validation gate runs. */
  readonly acceptedSyntaxSlots: readonly PresetSyntaxSlotKind[];
  /**
   * When non-empty, at least one capability must exist in the slot's ancestor chain.
   * This models statements such as break and continue without conflating them with the
   * immediate compound-body slot.
   */
  readonly requiredAnyAncestorCapabilities: readonly PresetSyntaxAncestorCapability[];
  /** Child slots contributed by a structural preset such as if, loop or switch. */
  readonly providedSyntaxSlots: readonly PresetProvidedSyntaxSlot[];
}

export interface PresetBlockExplanation {
  readonly summary: string;
  readonly principle: string;
  readonly whenToUse: readonly string[];
  readonly pitfalls: readonly string[];
}

export interface PresetBlockScenario {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly mode: "teaching" | "real-run";
  readonly stdin: string;
  readonly arguments: readonly string[];
  readonly expectedOutput?: string;
}

export interface PresetAlternativeVersion {
  readonly version: string;
  readonly label: string;
  readonly description: string;
  readonly source: string | null;
  readonly recommended: boolean;
}

interface PresetBlockMetadata {
  readonly blockKind: PresetBlockKind;
  readonly lifecycle: PresetBlockLifecycle;
  readonly ports: readonly PresetPortDefinition[];
  readonly placement: PresetPlacementCondition;
  readonly explanation: PresetBlockExplanation;
  readonly scenarios: readonly PresetBlockScenario[];
  readonly alternatives: readonly PresetAlternativeVersion[];
}

/** A source-backed preset still expands through the conservative M3b statement insertion gate. */
export interface PresetSourceBlockDefinition
  extends LearningTemplateDefinition, PresetBlockMetadata {
  readonly blockKind: Exclude<PresetBlockKind, "virtual">;
  readonly lifecycle: "active" | "deprecated";
}

/** A virtual preset controls the flow canvas and never emits a C fragment. */
export interface PresetVirtualBlockDefinition extends PresetBlockMetadata {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly category: string;
  readonly stage: string;
  readonly source: null;
  readonly description: string;
  readonly fragmentKind: null;
  readonly blockKind: "virtual";
  readonly lifecycle: "active" | "deprecated";
}

export type PresetBlockDefinition = PresetSourceBlockDefinition | PresetVirtualBlockDefinition;

export interface LearningTemplateDeprecation {
  readonly reason: string;
  readonly replacementId?: string;
}

export interface CatalogLearningTemplate extends Omit<PresetSourceBlockDefinition, "lifecycle"> {
  readonly kind: "template";
  readonly origin: LearningTemplateOrigin;
  readonly lifecycle: LearningTemplateLifecycle;
  readonly deprecation?: LearningTemplateDeprecation;
}

export interface CatalogVirtualPresetBlock extends PresetVirtualBlockDefinition {
  readonly kind: "virtual-preset";
  readonly origin: "builtin";
}

export type CatalogPresetBlock = CatalogLearningTemplate | CatalogVirtualPresetBlock;

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
  /** Rich source and virtual presets. Existing templates remains the source-only compatibility API. */
  readonly presets: readonly CatalogPresetBlock[];
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
