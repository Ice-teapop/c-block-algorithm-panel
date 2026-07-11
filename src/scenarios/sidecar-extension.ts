import { createEmptyScenarioCatalog, parseScenarioCatalogDocument } from "./catalog.js";
import type { ScenarioCatalogDocument } from "./contracts.js";

export const SCENARIO_CATALOG_EXTENSION_KEY = "customCatalog" as const;

/**
 * Reads the optional catalog field owned by the existing scenarios sidecar writer.
 * Missing data is a v1 migration, while malformed/stale data is rejected for fail-closed recovery.
 */
export function readScenarioCatalogExtension(
  scenariosSidecar: unknown,
  sourceFingerprint: string,
): ScenarioCatalogDocument {
  if (!isRecord(scenariosSidecar)) return createEmptyScenarioCatalog(sourceFingerprint);
  const extension = scenariosSidecar[SCENARIO_CATALOG_EXTENSION_KEY];
  if (extension === undefined) return createEmptyScenarioCatalog(sourceFingerprint);
  return parseScenarioCatalogDocument(extension, sourceFingerprint);
}

/** Preserves every runtime-owned field and replaces only the catalog extension. */
export function withScenarioCatalogExtension(
  scenariosSidecar: Readonly<Record<string, unknown>>,
  catalog: ScenarioCatalogDocument,
): Readonly<Record<string, unknown>> {
  const normalized = parseScenarioCatalogDocument(catalog);
  const sidecarFingerprint = scenariosSidecar.sourceFingerprint;
  if (
    typeof sidecarFingerprint === "string" &&
    sidecarFingerprint !== normalized.sourceFingerprint
  ) {
    throw new Error("Scenario Catalog 与 runtime sidecar 源码指纹不一致");
  }
  return Object.freeze({
    ...scenariosSidecar,
    [SCENARIO_CATALOG_EXTENSION_KEY]: normalized,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
