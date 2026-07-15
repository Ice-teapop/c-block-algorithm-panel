import { Buffer } from "node:buffer";
import type { RunnerError } from "../../../src/shared/api.js";
import {
  TRACE_BATCH_EVENT_LIMIT,
  TRACE_BYTE_LIMIT,
  TRACE_EVENT_LIMIT,
  isTerminalTraceStatus,
  type TraceBatch,
  type TraceCancelResult,
  type TraceEvent,
  type TraceRunEvidence,
  type TraceSessionStatus,
  type TraceUnsupportedReason,
} from "../../../src/shared/trace.js";
import type { RunnerClock } from "./process-host.js";
import { traceProtocolPrefix } from "./trace-instrumentation.js";

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

const DEFAULT_LIMITS: TraceSessionLimits = Object.freeze({
  maxEvents: TRACE_EVENT_LIMIT,
  maxBytes: TRACE_BYTE_LIMIT,
  maxBatchEvents: TRACE_BATCH_EVENT_LIMIT,
  maxSessions: 8,
});

interface MutableTraceSession {
  readonly sessionId: string;
  readonly sourceFingerprint: string;
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

  create(sessionId: string, sourceFingerprint: string): TraceSessionHandle {
    if (!/^trace_[A-Za-z0-9_-]{16,128}$/u.test(sessionId)) {
      throw new TypeError("Trace session id 格式无效");
    }
    if (sourceFingerprint.length === 0) throw new TypeError("Trace source fingerprint 不得为空");
    this.#purgeOldestTerminalUntilCapacity();
    if (this.#sessions.size >= this.#limits.maxSessions) {
      throw new Error("Trace session capacity reached");
    }
    if (this.#sessions.has(sessionId)) throw new Error("Trace session id collision");
    const session: MutableTraceSession = {
      sessionId,
      sourceFingerprint,
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
        session.evidence = Object.freeze({ ...evidence });
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
  readonly onEvent: (event: TraceEvent) => boolean;
  readonly onProtocolError: (message: string) => void;
}

export class TraceProtocolParser {
  readonly #prefix: Buffer;
  readonly #options: TraceProtocolParserOptions;
  #pending = Buffer.alloc(0);
  #failed = false;
  #lastRuntimeSequence = 0;
  #protocolBytes = 0;

  constructor(options: TraceProtocolParserOptions) {
    this.#options = options;
    this.#prefix = Buffer.from(traceProtocolPrefix(options.protocolNonce), "utf8");
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
      const match = /^(\d+):(L|B):(\d+)(?::([01]))?$/u.exec(payload);
      if (match === null) {
        this.#protocolError("Trace 协议记录格式无效。");
        return;
      }
      const runtimeSequence = Number(match[1]);
      const line = Number(match[3]);
      if (
        !Number.isSafeInteger(runtimeSequence) ||
        runtimeSequence !== this.#lastRuntimeSequence + 1 ||
        !Number.isSafeInteger(line) ||
        line < 1 ||
        !this.#options.allowedLines.has(line) ||
        (match[2] === "L" && match[4] !== undefined) ||
        (match[2] === "B" && match[4] === undefined)
      ) {
        this.#protocolError("Trace 协议序号、行号或分支值无效。");
        return;
      }
      this.#lastRuntimeSequence = runtimeSequence;
      const accepted = this.#options.onEvent(
        Object.freeze({
          sequence: runtimeSequence,
          kind: match[2] === "B" ? "branch" : "line",
          line,
          branchTaken: match[2] === "B" ? match[4] === "1" : null,
          elapsedMs: Math.max(0, this.#options.clock.now() - this.#options.startedAtMs),
        }),
      );
      if (!accepted) return;
    }
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
    status: session.status,
    afterSequence,
    nextSequence: events.at(-1)?.sequence ?? afterSequence,
    events: Object.freeze(events),
    totalEventCount: session.events.length,
    totalEventBytes: session.totalBytes,
    truncated: session.truncated,
    unsupported: session.unsupported,
    evidence: session.evidence,
    error: session.error,
  });
}

function freezeEvent(event: TraceEvent): TraceEvent {
  return Object.freeze({ ...event });
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

function assertLimits(limits: TraceSessionLimits): void {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError("Trace session limits 必须是正安全整数");
    }
  }
}
