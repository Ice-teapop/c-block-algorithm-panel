export const LEARNING_CATALOG_FILE_SCHEMA_VERSION = 1;
export const LEARNING_CATALOG_MAX_BYTES = 2 * 1024 * 1024;

export type LearningCatalogStoreErrorCode =
  | "LEARNING_CATALOG_CONFLICT"
  | "LEARNING_CATALOG_CONTEXT_CLOSED"
  | "LEARNING_CATALOG_CORRUPT"
  | "LEARNING_CATALOG_INVALID_DOCUMENT"
  | "LEARNING_CATALOG_INVALID_REQUEST"
  | "LEARNING_CATALOG_NOT_REGULAR_FILE"
  | "LEARNING_CATALOG_READ_FAILED"
  | "LEARNING_CATALOG_ROOT_UNAVAILABLE"
  | "LEARNING_CATALOG_TOO_LARGE"
  | "LEARNING_CATALOG_WRITE_FAILED";

export interface LearningCatalogStoreError {
  readonly code: LearningCatalogStoreErrorCode;
  readonly message: string;
}

/** The absolute Documents path is deliberately absent from this renderer-facing value. */
export interface LearningCatalogStoreDocument {
  readonly revision: number;
  readonly serialized: string;
}

export interface SaveLearningCatalogRequest {
  /** null means that no catalog file was observed when the renderer loaded. */
  readonly expectedRevision: number | null;
  /** A complete, versioned learning-catalog JSON document. */
  readonly serialized: string;
}

export type LearningCatalogReadResult =
  | { readonly status: "ready"; readonly document: LearningCatalogStoreDocument }
  | { readonly status: "missing" }
  | { readonly status: "failed"; readonly error: LearningCatalogStoreError };

export type LearningCatalogSaveResult =
  | { readonly status: "saved"; readonly document: LearningCatalogStoreDocument }
  | { readonly status: "failed"; readonly error: LearningCatalogStoreError };

export interface ValidatedLearningCatalogDocument {
  readonly revision: number;
  /** Compact canonical JSON, safe to return over IPC or write to disk. */
  readonly serialized: string;
}

export type LearningCatalogDocumentValidation =
  | { readonly ok: true; readonly document: ValidatedLearningCatalogDocument }
  | { readonly ok: false; readonly reason: "invalid" | "too-large" };

/**
 * Validates the persisted custom-definition document without importing renderer catalog code.
 * The renderer performs the richer semantic checks when createLearningCatalog consumes it;
 * this boundary independently rejects malformed/prototype-bearing IPC payloads.
 */
export function validateLearningCatalogDocument(
  serialized: unknown,
): LearningCatalogDocumentValidation {
  if (typeof serialized !== "string") return invalid("invalid");
  if (utf8Length(serialized) > LEARNING_CATALOG_MAX_BYTES) return invalid("too-large");

  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return invalid("invalid");
  }
  if (!isExactObject(value, ["revision", "schemaVersion", "templates", "tombstones"])) {
    return invalid("invalid");
  }
  const document = value as Record<string, unknown>;
  if (
    document.schemaVersion !== LEARNING_CATALOG_FILE_SCHEMA_VERSION ||
    !isRevision(document.revision) ||
    !Array.isArray(document.templates) ||
    !Array.isArray(document.tombstones)
  ) {
    return invalid("invalid");
  }

  const ids = new Set<string>();
  if (!document.templates.every((entry) => isStoredTemplate(entry, ids))) {
    return invalid("invalid");
  }
  if (!document.tombstones.every((entry) => isStoredTombstone(entry, ids))) {
    return invalid("invalid");
  }

  const canonical = JSON.stringify(value);
  if (utf8Length(canonical) > LEARNING_CATALOG_MAX_BYTES) return invalid("too-large");
  return Object.freeze({
    ok: true,
    document: Object.freeze({
      revision: document.revision,
      serialized: canonical,
    }),
  });
}

export function emptyLearningCatalogDocument(revision: number): ValidatedLearningCatalogDocument {
  if (!isRevision(revision)) throw new RangeError("目录 revision 必须是非负安全整数");
  return Object.freeze({
    revision,
    serialized: JSON.stringify({
      schemaVersion: LEARNING_CATALOG_FILE_SCHEMA_VERSION,
      revision,
      templates: [],
      tombstones: [],
    }),
  });
}

export function learningCatalogStoreFailure(
  code: LearningCatalogStoreErrorCode,
  message: string,
): { readonly status: "failed"; readonly error: LearningCatalogStoreError } {
  return Object.freeze({ status: "failed", error: Object.freeze({ code, message }) });
}

function isStoredTemplate(value: unknown, ids: Set<string>): boolean {
  if (!isObjectWithOptionalKeys(value, TEMPLATE_REQUIRED_KEYS, ["deprecation"])) return false;
  const entry = value as Record<string, unknown>;
  if (
    entry.kind !== "template" ||
    entry.origin !== "custom" ||
    (entry.lifecycle !== "active" && entry.lifecycle !== "deprecated") ||
    !isStableId(entry.id) ||
    ids.has(entry.id) ||
    !isNonEmptyText(entry.version) ||
    !isNonEmptyText(entry.label) ||
    !isStableId(entry.category) ||
    !isStableId(entry.stage) ||
    typeof entry.source !== "string" ||
    !isNonEmptyText(entry.description) ||
    (entry.fragmentKind !== "statement" && entry.fragmentKind !== "control") ||
    !isSourceBlockKind(entry.blockKind) ||
    !isPorts(entry.ports) ||
    !isPlacement(entry.placement) ||
    !isExplanation(entry.explanation) ||
    !isScenarios(entry.scenarios) ||
    !isAlternatives(entry.alternatives)
  ) {
    return false;
  }
  if (
    (entry.lifecycle === "active" && entry.deprecation !== undefined) ||
    (entry.lifecycle === "deprecated" && !isLifecycleChange(entry.deprecation))
  ) {
    return false;
  }
  ids.add(entry.id);
  return true;
}

function isStoredTombstone(value: unknown, ids: Set<string>): boolean {
  if (!isObjectWithOptionalKeys(value, TOMBSTONE_REQUIRED_KEYS, ["replacementId"])) return false;
  const entry = value as Record<string, unknown>;
  if (
    entry.kind !== "tombstone" ||
    entry.origin !== "custom" ||
    entry.lifecycle !== "retired" ||
    !isStableId(entry.id) ||
    ids.has(entry.id) ||
    !isNonEmptyText(entry.lastVersion) ||
    !isNonEmptyText(entry.label) ||
    !isStableId(entry.category) ||
    !isStableId(entry.stage) ||
    !isNonEmptyText(entry.description) ||
    !isNonEmptyText(entry.reason) ||
    (entry.replacementId !== undefined && !isStableId(entry.replacementId))
  ) {
    return false;
  }
  ids.add(entry.id);
  return true;
}

function isPorts(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const ids = new Set<string>();
  return value.every((candidate) => {
    if (!isObjectWithOptionalKeys(candidate, PORT_REQUIRED_KEYS, ["branch", "dataType"])) {
      return false;
    }
    const port = candidate as Record<string, unknown>;
    if (
      !isStableId(port.id) ||
      ids.has(port.id) ||
      !isNonEmptyText(port.label) ||
      (port.direction !== "input" && port.direction !== "output") ||
      (port.channel !== "control" && port.channel !== "data") ||
      (port.cardinality !== "one" && port.cardinality !== "many") ||
      (port.branch !== undefined && !isStableId(port.branch)) ||
      (port.dataType !== undefined && !isStableId(port.dataType))
    ) {
      return false;
    }
    ids.add(port.id);
    return true;
  });
}

function isPlacement(value: unknown): boolean {
  if (
    !isObjectWithOptionalKeys(value, PLACEMENT_KEYS, [
      "acceptedSyntaxSlots",
      "requiredAnyAncestorCapabilities",
      "providedSyntaxSlots",
    ])
  ) {
    return false;
  }
  const placement = value as Record<string, unknown>;
  return (
    placement.scope === "function-body" &&
    isStableIdArray(placement.allowedParentNodeTypes) &&
    isStableIdArray(placement.requiresHeaders) &&
    isStableIdArray(placement.requiresSymbols) &&
    (placement.acceptedSyntaxSlots === undefined ||
      isSyntaxSlotKindArray(placement.acceptedSyntaxSlots)) &&
    (placement.requiredAnyAncestorCapabilities === undefined ||
      isSyntaxAncestorCapabilityArray(placement.requiredAnyAncestorCapabilities)) &&
    (placement.providedSyntaxSlots === undefined ||
      isProvidedSyntaxSlots(placement.providedSyntaxSlots))
  );
}

function isSyntaxAncestorCapabilityArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((candidate) => candidate === "loop" || candidate === "switch")
  );
}

function isSyntaxSlotKindArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every(
      (candidate) =>
        candidate === "function-body" ||
        candidate === "compound-body" ||
        candidate === "loop-body" ||
        candidate === "switch-case",
    )
  );
}

function isProvidedSyntaxSlots(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((candidate) => {
    if (!isObjectWithOptionalKeys(candidate, ["cardinality", "id", "kind", "label"], ["branch"])) {
      return false;
    }
    const slot = candidate as Record<string, unknown>;
    if (
      !isStableId(slot.id) ||
      ids.has(slot.id) ||
      !isNonEmptyText(slot.label) ||
      !isSyntaxSlotKindArray([slot.kind]) ||
      (slot.cardinality !== "one" && slot.cardinality !== "many") ||
      (slot.branch !== undefined && !isStableId(slot.branch))
    ) {
      return false;
    }
    ids.add(slot.id);
    return true;
  });
}

function isExplanation(value: unknown): boolean {
  if (!isExactObject(value, EXPLANATION_KEYS)) return false;
  const explanation = value as Record<string, unknown>;
  return (
    isNonEmptyText(explanation.summary) &&
    isNonEmptyText(explanation.principle) &&
    isNonEmptyTextArray(explanation.whenToUse) &&
    isNonEmptyTextArray(explanation.pitfalls)
  );
}

function isScenarios(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const ids = new Set<string>();
  return value.every((candidate) => {
    if (!isObjectWithOptionalKeys(candidate, SCENARIO_REQUIRED_KEYS, ["expectedOutput"])) {
      return false;
    }
    const scenario = candidate as Record<string, unknown>;
    if (
      !isStableId(scenario.id) ||
      ids.has(scenario.id) ||
      !isNonEmptyText(scenario.label) ||
      !isNonEmptyText(scenario.description) ||
      (scenario.mode !== "teaching" && scenario.mode !== "real-run") ||
      typeof scenario.stdin !== "string" ||
      !isStringArray(scenario.arguments) ||
      (scenario.expectedOutput !== undefined && typeof scenario.expectedOutput !== "string")
    ) {
      return false;
    }
    ids.add(scenario.id);
    return true;
  });
}

function isAlternatives(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  const versions = new Set<string>();
  return value.every((candidate) => {
    if (!isExactObject(candidate, ALTERNATIVE_KEYS)) return false;
    const alternative = candidate as Record<string, unknown>;
    if (
      !isNonEmptyText(alternative.version) ||
      versions.has(alternative.version) ||
      !isNonEmptyText(alternative.label) ||
      !isNonEmptyText(alternative.description) ||
      typeof alternative.source !== "string" ||
      typeof alternative.recommended !== "boolean"
    ) {
      return false;
    }
    versions.add(alternative.version);
    return true;
  });
}

function isLifecycleChange(value: unknown): boolean {
  if (!isObjectWithOptionalKeys(value, ["reason"], ["replacementId"])) return false;
  const change = value as Record<string, unknown>;
  return (
    isNonEmptyText(change.reason) &&
    (change.replacementId === undefined || isStableId(change.replacementId))
  );
}

function isStableIdArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(isStableId) &&
    new Set(value as readonly string[]).size === value.length
  );
}

function isNonEmptyTextArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyText);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSourceBlockKind(value: unknown): boolean {
  return value === "statement" || value === "control" || value === "function" || value === "module";
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_IDENTIFIER_PATTERN.test(value);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isObjectWithOptionalKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function isExactObject(value: unknown, expectedKeys: readonly string[]): boolean {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function invalid(reason: "invalid" | "too-large"): LearningCatalogDocumentValidation {
  return Object.freeze({ ok: false, reason });
}

const STABLE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const TEMPLATE_REQUIRED_KEYS = Object.freeze([
  "alternatives",
  "blockKind",
  "category",
  "description",
  "explanation",
  "fragmentKind",
  "id",
  "kind",
  "label",
  "lifecycle",
  "origin",
  "placement",
  "ports",
  "scenarios",
  "source",
  "stage",
  "version",
]);
const TOMBSTONE_REQUIRED_KEYS = Object.freeze([
  "category",
  "description",
  "id",
  "kind",
  "label",
  "lastVersion",
  "lifecycle",
  "origin",
  "reason",
  "stage",
]);
const PORT_REQUIRED_KEYS = Object.freeze(["cardinality", "channel", "direction", "id", "label"]);
const PLACEMENT_KEYS = Object.freeze([
  "allowedParentNodeTypes",
  "requiresHeaders",
  "requiresSymbols",
  "scope",
]);
const EXPLANATION_KEYS = Object.freeze(["pitfalls", "principle", "summary", "whenToUse"]);
const SCENARIO_REQUIRED_KEYS = Object.freeze([
  "arguments",
  "description",
  "id",
  "label",
  "mode",
  "stdin",
]);
const ALTERNATIVE_KEYS = Object.freeze([
  "description",
  "label",
  "recommended",
  "source",
  "version",
]);
