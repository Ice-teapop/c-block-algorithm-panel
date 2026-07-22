import { Buffer } from "node:buffer";
import type { RunnerError } from "../../../src/shared/api.js";
import {
  TRACE_BATCH_EVENT_LIMIT,
  TRACE_BYTE_LIMIT,
  TRACE_EVENT_LIMIT,
  TRACE_OBSERVATION_PROFILE_IDS,
  isTerminalTraceStatus,
  type TraceBatch,
  type TraceCancelResult,
  type TraceEvent,
  type TraceExecutionIdentity,
  type TraceObservationProfileId,
  type TraceRunEvidence,
  type TraceSessionStatus,
  type TraceUnsupportedReason,
} from "../../../src/shared/trace.js";
import type { RunnerClock } from "./process-host.js";
import { traceProtocolPrefix } from "./trace-instrumentation.js";
import type { ResolvedTraceProbeDefinition } from "./trace-observation-profiles.js";

export interface TraceSessionLimits {
  readonly maxEvents: number;
  readonly maxBytes: number;
  readonly maxBatchEvents: number;
  readonly maxSessions: number;
}

export interface TraceSessionHandle {
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  readonly cancelRequested: boolean;
  readonly status: TraceSessionStatus;
  readonly eventCount: number;
  readonly uniqueLineCount: number;
  setRunning(): void;
  append(event: TraceEvent): boolean;
  fail(error: RunnerError): void;
  cancel(): void;
  complete(evidence: TraceRunEvidence): void;
  read(afterSequence: number): TraceBatch;
}

export interface TraceSessionBinding extends TraceExecutionIdentity {
  readonly sourceFingerprint: string;
}

const DEFAULT_LIMITS: TraceSessionLimits = Object.freeze({
  maxEvents: TRACE_EVENT_LIMIT,
  maxBytes: TRACE_BYTE_LIMIT,
  maxBatchEvents: TRACE_BATCH_EVENT_LIMIT,
  maxSessions: 8,
});

interface MutableTraceSession {
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  readonly inputFingerprint: string;
  readonly observationProfileId: TraceObservationProfileId | null;
  readonly observationAuthorizationDigest: string | null;
  readonly events: TraceEvent[];
  totalBytes: number;
  status: TraceSessionStatus;
  cancelRequested: boolean;
  truncated: boolean;
  unsupported: TraceUnsupportedReason | null;
  evidence: TraceRunEvidence | null;
  error: RunnerError | null;
}

export class TraceSessionRegistry {
  readonly #sessions = new Map<string, MutableTraceSession>();
  readonly #limits: TraceSessionLimits;

  constructor(limits: Partial<TraceSessionLimits> = {}) {
    this.#limits = Object.freeze({ ...DEFAULT_LIMITS, ...limits });
    assertLimits(this.#limits);
  }

  create(sessionId: string, binding: TraceSessionBinding): TraceSessionHandle {
    if (!/^trace_[A-Za-z0-9_-]{16,128}$/u.test(sessionId)) {
      throw new TypeError("Trace session id 格式无效");
    }
    assertSessionBinding(binding);
    this.#purgeOldestTerminalUntilCapacity();
    if (this.#sessions.size >= this.#limits.maxSessions) {
      throw new Error("Trace session capacity reached");
    }
    if (this.#sessions.has(sessionId)) throw new Error("Trace session id collision");
    const session: MutableTraceSession = {
      sessionId,
      sourceFingerprint: binding.sourceFingerprint,
      inputFingerprint: binding.inputFingerprint,
      observationProfileId: binding.observationProfileId,
      observationAuthorizationDigest: binding.observationAuthorizationDigest,
      events: [],
      totalBytes: 0,
      status: "preparing",
      cancelRequested: false,
      truncated: false,
      unsupported: null,
      evidence: null,
      error: null,
    };
    this.#sessions.set(sessionId, session);
    return this.#handle(session);
  }

  read(sessionId: string, afterSequence: number): TraceBatch {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return missingBatch(sessionId);
    return readSession(session, afterSequence, this.#limits.maxBatchEvents);
  }

  cancel(sessionId: string): TraceCancelResult {
    const session = this.#sessions.get(sessionId);
    if (session === undefined) return missingCancel(sessionId);
    if (!isTerminalTraceStatus(session.status)) {
      session.cancelRequested = true;
      session.status = "cancelled";
    }
    return Object.freeze({ ok: true, sessionId, status: session.status });
  }

  has(sessionId: string): boolean {
    return this.#sessions.has(sessionId);
  }

  getStatus(sessionId: string): TraceSessionStatus | null {
    return this.#sessions.get(sessionId)?.status ?? null;
  }

  clear(): void {
    this.#sessions.clear();
  }

  #handle(session: MutableTraceSession): TraceSessionHandle {
    const limits = this.#limits;
    return {
      get sessionId() {
        return session.sessionId;
      },
      get sourceFingerprint() {
        return session.sourceFingerprint;
      },
      get cancelRequested() {
        return session.cancelRequested;
      },
      get status() {
        return session.status;
      },
      get eventCount() {
        return session.events.length;
      },
      get uniqueLineCount() {
        return new Set(session.events.map((event) => event.line)).size;
      },
      setRunning(): void {
        if (session.status === "preparing") session.status = "running";
      },
      append(event: TraceEvent): boolean {
        if (isTerminalTraceStatus(session.status)) return false;
        const expectedSequence = (session.events.at(-1)?.sequence ?? 0) + 1;
        if (event.sequence !== expectedSequence) {
          session.status = "failed";
          session.error = error(
            "TRACE_PROTOCOL_ERROR",
            `Trace 事件序号不连续；期望 ${String(expectedSequence)}，收到 ${String(event.sequence)}。`,
          );
          return false;
        }
        const frozen = freezeEvent(event);
        const eventBytes = Buffer.byteLength(JSON.stringify(frozen), "utf8");
        if (
          session.events.length >= limits.maxEvents ||
          eventBytes > limits.maxBytes - session.totalBytes
        ) {
          session.truncated = true;
          session.status = "truncated";
          session.error = error("TRACE_LIMIT", "Trace 达到 10000 事件或 8 MiB 硬上限，已停止。 ");
          return false;
        }
        session.events.push(frozen);
        session.totalBytes += eventBytes;
        return true;
      },
      fail(runnerError: RunnerError): void {
        if (session.status === "cancelled" || session.status === "truncated") return;
        session.status = "failed";
        session.error = Object.freeze({ ...runnerError });
      },
      cancel(): void {
        if (!isTerminalTraceStatus(session.status)) {
          session.cancelRequested = true;
          session.status = "cancelled";
        }
      },
      complete(evidence: TraceRunEvidence): void {
        if (isTerminalTraceStatus(session.status)) return;
        session.status = "completed";
        session.evidence = copyEvidence(evidence);
      },
      read(afterSequence: number): TraceBatch {
        return readSession(session, afterSequence, limits.maxBatchEvents);
      },
    };
  }

  #purgeOldestTerminalUntilCapacity(): void {
    if (this.#sessions.size < this.#limits.maxSessions) return;
    for (const [sessionId, session] of this.#sessions) {
      if (isTerminalTraceStatus(session.status)) {
        this.#sessions.delete(sessionId);
        if (this.#sessions.size < this.#limits.maxSessions) return;
      }
    }
  }
}

export interface TraceProtocolParserOptions {
  readonly protocolNonce: string;
  readonly startedAtMs: number;
  readonly clock: RunnerClock;
  readonly allowedLines: ReadonlySet<number>;
  readonly allowedProbes?: readonly ResolvedTraceProbeDefinition[] | undefined;
  readonly onEvent: (event: TraceEvent) => boolean;
  readonly onProtocolError: (message: string) => void;
}

export class TraceProtocolParser {
  readonly #prefix: Buffer;
  readonly #options: TraceProtocolParserOptions;
  readonly #allowedProbes: ReadonlyMap<number, ResolvedTraceProbeDefinition>;
  #pending = Buffer.alloc(0);
  #failed = false;
  #lastRuntimeSequence = 0;
  #protocolBytes = 0;

  constructor(options: TraceProtocolParserOptions) {
    this.#options = options;
    this.#prefix = Buffer.from(traceProtocolPrefix(options.protocolNonce), "utf8");
    this.#allowedProbes = indexAllowedProbes(options.allowedProbes ?? [], options.allowedLines);
  }

  push(chunk: Uint8Array): void {
    if (this.#failed || chunk.byteLength === 0) return;
    this.#pending = Buffer.concat([this.#pending, Buffer.from(chunk)]);
    this.#drain();
  }

  finish(): void {
    if (this.#failed) return;
    const prefixIndex = this.#pending.indexOf(this.#prefix);
    if (prefixIndex >= 0) this.#protocolError("Trace 进程结束时留下不完整协议记录。");
    this.#pending = Buffer.alloc(0);
  }

  get protocolBytes(): number {
    return this.#protocolBytes;
  }

  #drain(): void {
    while (!this.#failed) {
      const prefixIndex = this.#pending.indexOf(this.#prefix);
      if (prefixIndex < 0) {
        const retained = Math.max(0, this.#prefix.byteLength - 1);
        this.#pending = this.#pending.subarray(Math.max(0, this.#pending.byteLength - retained));
        return;
      }
      if (prefixIndex > 0) this.#pending = this.#pending.subarray(prefixIndex);
      const lineEnd = this.#pending.indexOf(0x0a, this.#prefix.byteLength);
      if (lineEnd < 0) {
        if (this.#pending.byteLength > 256) this.#protocolError("Trace 协议记录超过长度上限。");
        return;
      }
      const payloadEnd =
        lineEnd > this.#prefix.byteLength && this.#pending[lineEnd - 1] === 0x0d
          ? lineEnd - 1
          : lineEnd;
      const payload = this.#pending.subarray(this.#prefix.byteLength, payloadEnd).toString("ascii");
      this.#protocolBytes += lineEnd + 1;
      this.#pending = this.#pending.subarray(lineEnd + 1);
      const sequenceMatch = /^(\d+):(.+)$/u.exec(payload);
      if (sequenceMatch === null) {
        this.#protocolError("Trace 协议记录格式无效。");
        return;
      }
      const runtimeSequence = Number(sequenceMatch[1]);
      if (
        !Number.isSafeInteger(runtimeSequence) ||
        runtimeSequence !== this.#lastRuntimeSequence + 1
      ) {
        this.#protocolError("Trace 协议序号无效。");
        return;
      }
      const event = this.#parseEvent(runtimeSequence, sequenceMatch[2] ?? "");
      if (event === null) return;
      this.#lastRuntimeSequence = runtimeSequence;
      const accepted = this.#options.onEvent(event);
      if (!accepted) return;
    }
  }

  #parseEvent(runtimeSequence: number, payload: string): TraceEvent | null {
    const control = /^(L|B):(\d+)(?::([01]))?$/u.exec(payload);
    if (control !== null) {
      const line = Number(control[2]);
      if (
        !validSourceLine(line, this.#options.allowedLines) ||
        (control[1] === "L" && control[3] !== undefined) ||
        (control[1] === "B" && control[3] === undefined)
      ) {
        this.#protocolError("Trace 协议行号或分支值无效。");
        return null;
      }
      return freezeEvent({
        sequence: runtimeSequence,
        kind: control[1] === "B" ? "branch" : "line",
        line,
        branchTaken: control[1] === "B" ? control[3] === "1" : null,
        elapsedMs: this.#elapsedMs(),
      });
    }

    const probeRecord = /^P:(\d+):(\d+):(.+)$/u.exec(payload);
    if (probeRecord === null) {
      this.#protocolError("Trace 协议记录格式无效。");
      return null;
    }
    const line = Number(probeRecord[1]);
    const slot = Number(probeRecord[2]);
    const definition = this.#allowedProbes.get(slot);
    if (
      definition === undefined ||
      !definition.lines.includes(line) ||
      !validSourceLine(line, this.#options.allowedLines)
    ) {
      this.#protocolError("Trace probe 未被当前 profile 授权。");
      return null;
    }
    const probe = parseProbePayload(definition, probeRecord[3] ?? "");
    if (probe === null) {
      this.#protocolError("Trace probe payload 无效。");
      return null;
    }
    return freezeEvent({
      sequence: runtimeSequence,
      kind: "probe",
      line,
      branchTaken: null,
      probeId: definition.probeId,
      probe,
      elapsedMs: this.#elapsedMs(),
    });
  }

  #elapsedMs(): number {
    return Math.max(0, this.#options.clock.now() - this.#options.startedAtMs);
  }

  #protocolError(message: string): void {
    if (this.#failed) return;
    this.#failed = true;
    this.#options.onProtocolError(message);
  }
}

function readSession(
  session: MutableTraceSession,
  afterSequence: number,
  maxBatchEvents: number,
): TraceBatch {
  if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
    return Object.freeze({
      ok: false,
      sessionId: session.sessionId,
      error: error("INVALID_REQUEST", "afterSequence 必须是非负安全整数。"),
    });
  }
  const latestSequence = session.events.at(-1)?.sequence ?? 0;
  if (afterSequence > latestSequence) {
    return Object.freeze({
      ok: false,
      sessionId: session.sessionId,
      error: error(
        "INVALID_REQUEST",
        `afterSequence 超过当前 Trace 末尾 ${String(latestSequence)}。`,
      ),
    });
  }
  const events = session.events
    .filter((event) => event.sequence > afterSequence)
    .slice(0, maxBatchEvents)
    .map(freezeEvent);
  return Object.freeze({
    ok: true,
    sessionId: session.sessionId,
    sourceFingerprint: session.sourceFingerprint,
    inputFingerprint: session.inputFingerprint,
    observationProfileId: session.observationProfileId,
    observationAuthorizationDigest: session.observationAuthorizationDigest,
    status: session.status,
    afterSequence,
    nextSequence: events.at(-1)?.sequence ?? afterSequence,
    events: Object.freeze(events),
    totalEventCount: session.events.length,
    totalEventBytes: session.totalBytes,
    truncated: session.truncated,
    unsupported: session.unsupported,
    evidence: session.evidence === null ? null : copyEvidence(session.evidence),
    error: session.error,
  });
}

function freezeEvent(event: TraceEvent): TraceEvent {
  if (event.kind !== "probe" || event.probe === undefined) return Object.freeze({ ...event });
  const probe =
    event.probe.kind === "array"
      ? Object.freeze({ ...event.probe, indices: Object.freeze([...event.probe.indices]) })
      : Object.freeze({ ...event.probe });
  return Object.freeze({ ...event, probe });
}

function copyEvidence(evidence: TraceRunEvidence): TraceRunEvidence {
  return Object.freeze({
    ...evidence,
    ...(evidence.stdout === undefined ? {} : { stdout: Uint8Array.from(evidence.stdout) }),
  });
}

function indexAllowedProbes(
  definitions: readonly ResolvedTraceProbeDefinition[],
  allowedLines: ReadonlySet<number>,
): ReadonlyMap<number, ResolvedTraceProbeDefinition> {
  const bySlot = new Map<number, ResolvedTraceProbeDefinition>();
  const probeIds = new Set<string>();
  for (const definition of definitions) {
    if (
      !Number.isSafeInteger(definition.slot) ||
      definition.slot < 1 ||
      definition.slot > 64 ||
      definition.lines.length === 0 ||
      new Set(definition.lines).size !== definition.lines.length ||
      definition.lines.some((line) => !validSourceLine(line, allowedLines)) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(definition.probeId) ||
      bySlot.has(definition.slot) ||
      probeIds.has(definition.probeId)
    ) {
      throw new TypeError("Trace profile probe definition 无效或重复");
    }
    bySlot.set(
      definition.slot,
      Object.freeze({ ...definition, lines: Object.freeze([...definition.lines]) }),
    );
    probeIds.add(definition.probeId);
  }
  return bySlot;
}

function validSourceLine(line: number, allowedLines: ReadonlySet<number>): boolean {
  return Number.isSafeInteger(line) && line >= 1 && allowedLines.has(line);
}

function parseProbePayload(
  definition: ResolvedTraceProbeDefinition,
  payload: string,
): TraceEvent["probe"] | null {
  const fields = payload.split(":");
  if (definition.kind === "scalar") {
    if (fields.length !== 3 || fields[0] !== "S") return null;
    const value = parseTypedValue(definition.valueType, fields[1], fields[2]);
    return value === null ? null : Object.freeze({ kind: "scalar", value });
  }
  if (definition.kind === "array") {
    if (fields[0] !== "A" || fields.length !== 4 + definition.rank) return null;
    const value = parseTypedValue(definition.valueType, fields[1], fields.at(-1));
    const rank = parseUnsignedInteger(fields[2]);
    const indices = fields.slice(3, -1).map(parseUnsignedInteger);
    if (value === null || rank !== definition.rank || indices.some((index) => index === null)) {
      return null;
    }
    return Object.freeze({
      kind: "array",
      indices: Object.freeze(indices as number[]),
      value,
    });
  }
  if (definition.kind === "call") {
    if (fields.length !== 7 || fields[0] !== "C" || !/^[EX]$/u.test(fields[1] ?? "")) {
      return null;
    }
    const frameId = parsePositiveInteger(fields[2]);
    const parent = parseUnsignedInteger(fields[3]);
    const depth = parseUnsignedInteger(fields[4]);
    const argument = parseNullableInteger(fields[5]);
    const returnValue = parseNullableInteger(fields[6]);
    const phase = fields[1] === "E" ? "enter" : "exit";
    if (
      frameId === null ||
      parent === null ||
      depth === null ||
      argument === undefined ||
      returnValue === undefined ||
      (phase === "enter" && returnValue !== null) ||
      (phase === "exit" && returnValue === null)
    ) {
      return null;
    }
    return Object.freeze({
      kind: "call",
      phase,
      frameId,
      parentFrameId: parent === 0 ? null : parent,
      depth,
      argument,
      returnValue,
    });
  }
  if (fields.length !== 2 || fields[0] !== "O" || !/^[01]$/u.test(fields[1] ?? "")) {
    return null;
  }
  const linked = fields[1] === "1";
  return Object.freeze({
    kind: "object",
    objectId: definition.objectId,
    targetObjectId: linked ? definition.targetObjectId : null,
    fieldId: definition.fieldId,
    value: linked,
  });
}

function parseTypedValue(
  expected: "integer" | "boolean",
  tag: string | undefined,
  raw: string | undefined,
): number | boolean | null {
  if (expected === "boolean") return tag === "B" && /^[01]$/u.test(raw ?? "") ? raw === "1" : null;
  return tag === "I" ? parseInteger(raw) : null;
}

function parseInteger(raw: string | undefined): number | null {
  if (!/^-?(?:0|[1-9]\d{0,15})$/u.test(raw ?? "")) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function parseUnsignedInteger(raw: string | undefined): number | null {
  const value = parseInteger(raw);
  return value !== null && value >= 0 ? value : null;
}

function parsePositiveInteger(raw: string | undefined): number | null {
  const value = parseInteger(raw);
  return value !== null && value > 0 ? value : null;
}

function parseNullableInteger(raw: string | undefined): number | null | undefined {
  return raw === "_" ? null : (parseInteger(raw) ?? undefined);
}

function missingBatch(sessionId: string): TraceBatch {
  return Object.freeze({
    ok: false,
    sessionId,
    error: error("TRACE_SESSION_NOT_FOUND", "找不到 Trace session，或它已被释放。"),
  });
}

function missingCancel(sessionId: string): TraceCancelResult {
  return Object.freeze({
    ok: false,
    sessionId,
    error: error("TRACE_SESSION_NOT_FOUND", "找不到 Trace session，或它已被释放。"),
  });
}

function error(code: RunnerError["code"], message: string): RunnerError {
  return Object.freeze({ code, message: message.trim() });
}

function assertSessionBinding(binding: TraceSessionBinding): void {
  if (!validFingerprint(binding.sourceFingerprint) || !validFingerprint(binding.inputFingerprint)) {
    throw new TypeError("Trace session fingerprint 无效");
  }
  if (binding.observationProfileId === null) {
    if (binding.observationAuthorizationDigest !== null) {
      throw new TypeError("无 observation profile 时授权摘要必须为空");
    }
    return;
  }
  if (
    !TRACE_OBSERVATION_PROFILE_IDS.some(
      (candidate) => candidate === binding.observationProfileId,
    ) ||
    !/^[a-f0-9]{64}$/u.test(binding.observationAuthorizationDigest ?? "")
  ) {
    throw new TypeError("Trace observation profile binding 无效");
  }
}

function validFingerprint(value: string): boolean {
  return value.length > 0 && value.length <= 128 && !value.includes("\0");
}

function assertLimits(limits: TraceSessionLimits): void {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError("Trace session limits 必须是正安全整数");
    }
  }
}
