import type {
  AlgorithmScenarioDefinition,
  AlgorithmScenarioFamily,
  ScenarioRunCase,
} from "../mentor/index.js";

export const SCENARIO_CATALOG_SCHEMA_VERSION = 1 as const;
export const SCENARIO_CATALOG_MAX_CUSTOM = 256;
export const SCENARIO_CATALOG_MAX_CASES = 128;

export interface CustomScenarioCase {
  readonly id: string;
  readonly label: string;
  readonly size: number;
  readonly stdin: string;
  readonly arguments: readonly string[];
  readonly expectedStdout: string;
  readonly explanation: string;
  /** Snapshot-local edge id. Runtime must revalidate it against the current projection. */
  readonly targetBranchId: string | null;
}

export interface CustomScenarioCaseDraft {
  readonly label: string;
  readonly size: number;
  readonly stdin: string;
  readonly arguments: readonly string[];
  readonly expectedStdout: string;
  readonly explanation: string;
  readonly targetBranchId: string | null;
}

export interface CustomScenarioDefinition {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly description: string;
  readonly family: AlgorithmScenarioFamily;
  readonly inputModel: string;
  readonly minimumSize: number;
  readonly maximumSize: number;
  readonly defaultSizes: readonly number[];
  readonly cases: readonly CustomScenarioCase[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomScenarioDraft {
  readonly label: string;
  readonly description: string;
  readonly family: AlgorithmScenarioFamily;
  readonly inputModel: string;
  readonly minimumSize: number;
  readonly maximumSize: number;
  readonly defaultSizes: readonly number[];
  readonly cases: readonly CustomScenarioCaseDraft[];
}

export interface ScenarioCatalogDocument {
  readonly schemaVersion: typeof SCENARIO_CATALOG_SCHEMA_VERSION;
  readonly revision: number;
  readonly sourceFingerprint: string;
  readonly customScenarios: readonly CustomScenarioDefinition[];
}

export interface ScenarioCatalogEntry {
  readonly id: string;
  readonly origin: "builtin" | "custom";
  readonly readOnly: boolean;
  readonly definition: AlgorithmScenarioDefinition;
  readonly cases: readonly ScenarioCatalogCaseEntry[];
}

export interface ScenarioCatalogCaseEntry {
  readonly id: string;
  readonly label: string;
  readonly runCase: ScenarioRunCase;
  readonly targetBranchId: string | null;
}

export type ScenarioCatalogErrorCode =
  | "INVALID_DOCUMENT"
  | "INVALID_SCENARIO"
  | "INVALID_CASE"
  | "NOT_FOUND"
  | "READ_ONLY"
  | "DUPLICATE_ID"
  | "CASE_REQUIRED"
  | "REVISION_LIMIT";

export class ScenarioCatalogError extends Error {
  readonly code: ScenarioCatalogErrorCode;

  constructor(code: ScenarioCatalogErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ScenarioCatalogError";
    this.code = code;
  }
}

export interface ScenarioCatalogIdFactory {
  scenarioId(): string;
  caseId(): string;
}

export interface ScenarioCatalogClock {
  now(): Date;
}
