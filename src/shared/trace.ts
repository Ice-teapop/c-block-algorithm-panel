import type { FixtureInput, RunnerError, TerminationReason } from "./api.js";

export const TRACE_EVENT_LIMIT = 10_000;
export const TRACE_BYTE_LIMIT = 8 * 1024 * 1024;
export const TRACE_BATCH_EVENT_LIMIT = 512;

export interface TraceRequest {
  readonly source: string;
  readonly sourceFingerprint: string;
  readonly sourceName?: string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly stdin?: string | undefined;
  readonly fixtures?: readonly FixtureInput[] | undefined;
}

export type TraceEventKind = "line" | "branch";

export interface TraceEvent {
  /** Strictly increasing within one session, beginning at 1. */
  readonly sequence: number;
  readonly kind: TraceEventKind;
  /** One-based line in the unmodified project source. */
  readonly line: number;
  /** Present only for a branch event and equal to the actual C truth value. */
  readonly branchTaken: boolean | null;
  /** Main-process observation time relative to trace process start. */
  readonly elapsedMs: number;
}

export type TraceUnsupportedCode =
  | "source-fingerprint-mismatch"
  | "preprocessor-control"
  | "line-continuation"
  | "multiline-lexeme"
  | "unbalanced-braces"
  | "unsupported-function-layout"
  | "unsupported-control-layout"
  | "unsupported-switch"
  | "unsupported-statement-layout"
  | "no-instrumentable-function";

export interface TraceUnsupportedReason {
  readonly code: TraceUnsupportedCode;
  readonly line: number | null;
  readonly message: string;
}

export type TraceSessionStatus =
  "preparing" | "running" | "completed" | "failed" | "cancelled" | "truncated" | "unsupported";

export interface TraceRunEvidence {
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly termination: TerminationReason;
  readonly durationMs: number;
  readonly peakRssBytes: number;
  readonly peakProcessCount: number;
  readonly outputBytes: number;
  /** Unique instrumented source lines observed in this real run. */
  readonly executedNodeCount: number;
  /** Total bounded line/branch events; an empirical operation proxy, not Big-O. */
  readonly operationCount: number;
}

export type TraceStartResult =
  | {
      readonly ok: true;
      readonly sessionId: string;
      readonly sourceFingerprint: string;
      readonly status: "preparing";
    }
  | {
      readonly ok: false;
      readonly error: RunnerError;
      readonly unsupported: TraceUnsupportedReason | null;
    };

export interface SuccessfulTraceBatch {
  readonly ok: true;
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  readonly status: TraceSessionStatus;
  readonly afterSequence: number;
  readonly nextSequence: number;
  readonly events: readonly TraceEvent[];
  readonly totalEventCount: number;
  readonly totalEventBytes: number;
  readonly truncated: boolean;
  readonly unsupported: TraceUnsupportedReason | null;
  readonly evidence: TraceRunEvidence | null;
  readonly error: RunnerError | null;
}

export interface FailedTraceBatch {
  readonly ok: false;
  readonly sessionId: string;
  readonly error: RunnerError;
}

export type TraceBatch = SuccessfulTraceBatch | FailedTraceBatch;

export type TraceCancelResult =
  | {
      readonly ok: true;
      readonly sessionId: string;
      readonly status: TraceSessionStatus;
    }
  | {
      readonly ok: false;
      readonly sessionId: string;
      readonly error: RunnerError;
    };

export function isTerminalTraceStatus(status: TraceSessionStatus): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "truncated" ||
    status === "unsupported"
  );
}
