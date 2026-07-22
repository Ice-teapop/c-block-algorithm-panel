import type { FixtureInput, RunnerError, TerminationReason } from "./api.js";

export const TRACE_EVENT_LIMIT = 10_000;
export const TRACE_BYTE_LIMIT = 8 * 1024 * 1024;
export const TRACE_BATCH_EVENT_LIMIT = 512;

export const TRACE_OBSERVATION_PROFILE_IDS = Object.freeze([
  "foa-transition-63-v1",
  "foa-transition-70-v1",
  "foa-transition-75-v1",
  "foa-transition-80-v1",
] as const);

export type TraceObservationProfileId = (typeof TRACE_OBSERVATION_PROFILE_IDS)[number];

export interface TraceRequest {
  readonly source: string;
  readonly sourceFingerprint: string;
  readonly sourceName?: string | undefined;
  readonly args?: readonly string[] | undefined;
  readonly stdin?: string | undefined;
  readonly fixtures?: readonly FixtureInput[] | undefined;
  readonly observationProfileId?: TraceObservationProfileId | undefined;
}

export type TraceEventKind = "line" | "branch" | "probe";

export type TraceProbeScalarValue = number | boolean;

export type TraceProbePayload =
  | {
      readonly kind: "scalar";
      readonly value: TraceProbeScalarValue;
    }
  | {
      readonly kind: "array";
      readonly indices: readonly number[];
      readonly value: TraceProbeScalarValue;
    }
  | {
      readonly kind: "call";
      readonly phase: "enter" | "exit";
      readonly frameId: number;
      readonly parentFrameId: number | null;
      readonly depth: number;
      readonly argument: number | null;
      readonly returnValue: number | null;
    }
  | {
      readonly kind: "object";
      readonly objectId: string;
      readonly targetObjectId: string | null;
      readonly fieldId: string | null;
      readonly value: TraceProbeScalarValue | null;
    };

export interface TraceEvent {
  /** Strictly increasing within one session, beginning at 1. */
  readonly sequence: number;
  readonly kind: TraceEventKind;
  /** One-based line in the unmodified project source. */
  readonly line: number;
  /** Present only for a branch event and equal to the actual C truth value. */
  readonly branchTaken: boolean | null;
  /** Present only for a profile-authorized probe event. */
  readonly probeId?: string | undefined;
  /** Bounded payload decoded by the main process from a fixed observation profile. */
  readonly probe?: TraceProbePayload | undefined;
  /** Main-process observation time relative to trace process start. */
  readonly elapsedMs: number;
}

export interface TraceProbeEvent extends TraceEvent {
  readonly kind: "probe";
  readonly branchTaken: null;
  readonly probeId: string;
  readonly probe: TraceProbePayload;
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
  | "observation-profile-mismatch"
  | "no-instrumentable-function";

export interface TraceUnsupportedReason {
  readonly code: TraceUnsupportedCode;
  readonly line: number | null;
  readonly message: string;
}

export type TraceSessionStatus =
  "preparing" | "running" | "completed" | "failed" | "cancelled" | "truncated" | "unsupported";

/** Main-process-bound identity echoed on start and every successful batch. */
export interface TraceExecutionIdentity {
  /** fingerprintSource() of the validated stdin actually passed to the C process. */
  readonly inputFingerprint: string;
  readonly observationProfileId: TraceObservationProfileId | null;
  /** Main-owned fixed-profile authorization digest; null exactly when no profile is active. */
  readonly observationAuthorizationDigest: string | null;
}

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
  /** Total bounded line/branch/probe events; an empirical operation proxy, not Big-O. */
  readonly operationCount: number;
  /** Exact bounded stdout captured from this real run. Always present on new Trace completions. */
  readonly stdout?: Uint8Array | undefined;
}

export type TraceStartResult =
  | (TraceExecutionIdentity & {
      readonly ok: true;
      readonly sessionId: string;
      readonly sourceFingerprint: string;
      readonly status: "preparing";
    })
  | {
      readonly ok: false;
      readonly error: RunnerError;
      readonly unsupported: TraceUnsupportedReason | null;
    };

export interface SuccessfulTraceBatch extends TraceExecutionIdentity {
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

export function isTraceProbeEvent(event: TraceEvent): event is TraceProbeEvent {
  return event.kind === "probe" && typeof event.probeId === "string" && event.probe !== undefined;
}
