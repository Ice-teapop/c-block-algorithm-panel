import type { RunnerLimits } from "../../../src/shared/limits.js";
import { fingerprintSource } from "../../../src/shared/source-snapshot.js";
import {
  TRACE_OBSERVATION_PROFILE_IDS,
  type TraceObservationProfileId,
  type TraceRequest,
} from "../../../src/shared/trace.js";
import { RunnerFailure } from "./errors.js";
import {
  resolveTraceObservationProfile,
  type ResolvedTraceObservationProfile,
} from "./trace-observation-profiles.js";
import { validateDiagnoseRequest, type ValidatedFixture } from "./validation.js";

export interface ValidatedTraceRequest {
  readonly source: string;
  readonly sourceName: string;
  readonly sourceFingerprint: string;
  readonly args: readonly string[];
  readonly stdin: string;
  readonly fixtures: readonly ValidatedFixture[];
  readonly observationProfile: ResolvedTraceObservationProfile | null;
}

const TRACE_REQUEST_KEYS = Object.freeze([
  "args",
  "fixtures",
  "observationProfileId",
  "source",
  "sourceFingerprint",
  "sourceName",
  "stdin",
]);

export function validateTraceRequest(value: unknown, limits: RunnerLimits): ValidatedTraceRequest {
  const record = requirePlainRecord(value);
  const keys = Object.keys(record).sort();
  if (
    keys.some((key) => !TRACE_REQUEST_KEYS.includes(key)) ||
    !keys.includes("source") ||
    !keys.includes("sourceFingerprint")
  ) {
    throw invalid("Trace 请求字段无效。");
  }
  if (typeof record.sourceFingerprint !== "string" || record.sourceFingerprint.length > 128) {
    throw invalid("sourceFingerprint 必须是受限长度的字符串。");
  }
  const observationProfileId = validateObservationProfileId(record.observationProfileId);
  const validated = validateDiagnoseRequest(
    {
      source: record.source,
      ...(record.sourceName === undefined ? {} : { sourceName: record.sourceName }),
      runtime: {
        ...(record.args === undefined ? {} : { args: record.args }),
        ...(record.stdin === undefined ? {} : { stdin: record.stdin }),
        ...(record.fixtures === undefined ? {} : { fixtures: record.fixtures }),
      },
    },
    limits,
  );
  const runtime = validated.runtime;
  if (runtime === null) throw invalid("Trace runtime 验证失败。");
  const actualFingerprint = fingerprintSource(validated.source);
  if (record.sourceFingerprint !== actualFingerprint) {
    throw new RunnerFailure("TRACE_SOURCE_MISMATCH", "源码指纹与 Trace 请求正文不一致。");
  }
  const observationProfile =
    observationProfileId === null
      ? null
      : resolveTraceObservationProfile(observationProfileId, validated.source);
  if (observationProfileId !== null && observationProfile === null) {
    throw new RunnerFailure(
      "TRACE_SOURCE_MISMATCH",
      "当前源码不完全匹配所选固定 Trace observation profile。",
    );
  }
  return Object.freeze({
    source: validated.source,
    sourceName: validated.sourceName,
    sourceFingerprint: actualFingerprint,
    args: runtime.args,
    stdin: runtime.stdin,
    fixtures: runtime.fixtures,
    observationProfile,
  });
}

export function copyTraceRequest(request: TraceRequest): TraceRequest {
  return Object.freeze({
    source: request.source,
    sourceFingerprint: request.sourceFingerprint,
    ...(request.sourceName === undefined ? {} : { sourceName: request.sourceName }),
    ...(request.args === undefined ? {} : { args: Object.freeze([...request.args]) }),
    ...(request.stdin === undefined ? {} : { stdin: request.stdin }),
    ...(request.fixtures === undefined
      ? {}
      : {
          fixtures: Object.freeze(
            request.fixtures.map((fixture) =>
              Object.freeze({
                path: fixture.path,
                contents:
                  typeof fixture.contents === "string"
                    ? fixture.contents
                    : Uint8Array.from(fixture.contents),
              }),
            ),
          ),
        }),
    ...(request.observationProfileId === undefined
      ? {}
      : { observationProfileId: request.observationProfileId }),
  });
}

function validateObservationProfileId(value: unknown): TraceObservationProfileId | null {
  if (value === undefined) return null;
  if (
    typeof value !== "string" ||
    !TRACE_OBSERVATION_PROFILE_IDS.some((candidate) => candidate === value)
  ) {
    throw invalid("observationProfileId 不是受支持的固定 Trace profile。");
  }
  return value as TraceObservationProfileId;
}

function requirePlainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid("Trace 请求必须是普通对象。");
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid("Trace 请求必须是普通对象。");
  }
  return value as Record<string, unknown>;
}

function invalid(message: string): RunnerFailure {
  return new RunnerFailure("INVALID_REQUEST", message);
}
