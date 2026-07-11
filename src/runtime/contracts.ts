import type { TerminationReason } from "../shared/api.js";

export const RUN_HISTORY_SCHEMA_VERSION = 1;
export const RUN_HISTORY_MAX_ENTRIES = 100;

export interface RunScenarioIdentity {
  readonly id: string;
  readonly version: string;
}

export interface RunToolchainIdentity {
  readonly compiler: string;
  readonly compilerVersion: string;
  readonly target: string;
  readonly runnerVersion: string;
}

export interface RunMeasurement {
  readonly compileDurationMs: number | null;
  readonly durationMs: number;
  readonly peakRssBytes: number | null;
  readonly peakProcessCount: number | null;
  readonly outputBytes: number;
  readonly executedNodeCount: number | null;
  readonly operationCount: number | null;
  readonly termination: TerminationReason;
  readonly ok: boolean;
}

export interface RunTraceNodeVisit {
  readonly nodeId: string;
  readonly count: number;
}

export interface RunTraceSummary {
  readonly status: "validated";
  readonly nodeVisits: readonly RunTraceNodeVisit[];
  readonly edgeIds: readonly string[];
  readonly targetBranchId: string | null;
}

export interface RunHistoryEntryInput {
  readonly id: string;
  readonly recordedAt: string;
  readonly mode: "real" | "simulation";
  readonly sourceFingerprint: string;
  readonly scenario: RunScenarioIdentity;
  /** Exact stdin/args/fixture identity for direct comparison. */
  readonly caseFingerprint: string;
  readonly toolchain: RunToolchainIdentity;
  /** Positive problem size used by the scenario generator, or null for an unscaled case. */
  readonly inputSize: number | null;
  /** Bounded strict-trace summary; null for manual runs without a validated trace. */
  readonly trace?: RunTraceSummary | null | undefined;
  readonly measurement: RunMeasurement;
}

export interface RunHistoryEntry extends Omit<RunHistoryEntryInput, "mode"> {
  readonly mode: "real";
}

export interface RunHistoryDocument {
  readonly schemaVersion: typeof RUN_HISTORY_SCHEMA_VERSION;
  readonly revision: number;
  readonly entries: readonly RunHistoryEntry[];
}

export interface RunComparisonKey {
  readonly sourceFingerprint: string;
  readonly scenario: RunScenarioIdentity;
  readonly toolchain: RunToolchainIdentity;
  readonly inputSize: number | null;
  readonly caseFingerprint: string;
}

export interface RunMetricSummary {
  readonly sampleCount: number;
  readonly median: number | null;
}

export interface OperationGrowthPoint {
  readonly inputSize: number;
  readonly sampleCount: number;
  readonly medianOperationCount: number;
}

export interface OperationGrowthEvidence {
  readonly basis: "instrumented-operation-count";
  readonly points: readonly OperationGrowthPoint[];
  readonly trend: "insufficient" | "stable" | "increasing" | "non-monotonic";
  readonly estimatedLogLogSlope: number | null;
  readonly confidence: "insufficient" | "low" | "medium";
  readonly evidence: string;
}

export interface RunHistorySummary {
  readonly key: RunComparisonKey;
  readonly runIds: readonly string[];
  readonly growthRunIds: readonly string[];
  readonly compileDurationMs: RunMetricSummary;
  readonly durationMs: RunMetricSummary;
  readonly peakRssBytes: RunMetricSummary;
  readonly operationCount: RunMetricSummary;
  readonly growth: OperationGrowthEvidence;
  readonly evidence: string;
}

export type RunHistoryErrorCode =
  | "DUPLICATE_RUN_ID"
  | "INVALID_COMPARISON_KEY"
  | "INVALID_DOCUMENT"
  | "INVALID_ENTRY"
  | "REVISION_LIMIT"
  | "SIMULATION_NOT_PERSISTABLE";

export class RunHistoryError extends Error {
  readonly code: RunHistoryErrorCode;

  constructor(code: RunHistoryErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "RunHistoryError";
    this.code = code;
  }
}
