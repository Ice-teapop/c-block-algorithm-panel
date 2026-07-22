import { describe, expect, it } from "vitest";
import { TRACE_BYTE_LIMIT, TRACE_EVENT_LIMIT } from "../../src/shared/trace.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import { FakeClock } from "./fakes.js";
import {
  TraceProtocolParser,
  TraceSessionRegistry,
} from "../../electron/main/runner/trace-session.js";
import type { ResolvedTraceProbeDefinition } from "../../electron/main/runner/trace-observation-profiles.js";

const SESSION_ID = "trace_abcdefghijklmnop";
const NONCE = "0123456789abcdef";

describe("bounded Trace session storage and protocol", () => {
  it("locks the public hard limits to 10000 events and 8 MiB", () => {
    expect(TRACE_EVENT_LIMIT).toBe(10_000);
    expect(TRACE_BYTE_LIMIT).toBe(8 * 1024 * 1024);
  });

  it("parses split records, paginates by sequence and preserves actual branch values", () => {
    const clock = new FakeClock(100);
    const registry = new TraceSessionRegistry({ maxBatchEvents: 1 });
    const session = registry.create(SESSION_ID, binding());
    session.setRunning();
    const parser = new TraceProtocolParser({
      protocolNonce: NONCE,
      startedAtMs: 100,
      clock,
      allowedLines: new Set([2, 4]),
      onEvent: (event) => session.append(event),
      onProtocolError: (message) => session.fail({ code: "TRACE_PROTOCOL_ERROR", message }),
    });

    parser.push(Buffer.from(`user stderr\u001eCBT:${NONCE}:1:L:`));
    clock.advanceBy(7);
    parser.push(Buffer.from(`2\n\u001eCBT:${NONCE}:2:B:4:0\n`));
    parser.finish();

    const first = registry.read(SESSION_ID, 0);
    expect(first).toMatchObject({
      ok: true,
      inputFingerprint: fingerprintSource(""),
      observationProfileId: null,
      observationAuthorizationDigest: null,
      status: "running",
      nextSequence: 1,
      totalEventCount: 2,
      events: [{ sequence: 1, kind: "line", line: 2, branchTaken: null, elapsedMs: 7 }],
    });
    const second = registry.read(SESSION_ID, 1);
    expect(second).toMatchObject({
      ok: true,
      nextSequence: 2,
      events: [{ sequence: 2, kind: "branch", line: 4, branchTaken: false }],
    });
    expect(registry.read(SESSION_ID, 99)).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
  });

  it("accepts fragmented Windows CRLF protocol records without counting CR as payload", () => {
    const registry = new TraceSessionRegistry();
    const session = registry.create(SESSION_ID, binding());
    session.setRunning();
    const parser = new TraceProtocolParser({
      protocolNonce: NONCE,
      startedAtMs: 0,
      clock: new FakeClock(),
      allowedLines: new Set([2]),
      onEvent: (event) => session.append(event),
      onProtocolError: (message) => session.fail({ code: "TRACE_PROTOCOL_ERROR", message }),
    });

    parser.push(Buffer.from(`\u001eCBT:${NONCE}:1:L:2\r`));
    parser.push(Buffer.from("\n"));
    parser.finish();

    expect(session.read(0)).toMatchObject({
      ok: true,
      status: "running",
      totalEventCount: 1,
      events: [{ sequence: 1, kind: "line", line: 2 }],
    });
    expect(parser.protocolBytes).toBe(Buffer.byteLength(`\u001eCBT:${NONCE}:1:L:2\r\n`));
  });

  it("truncates at the hard event boundary and fails malformed sequence closed", () => {
    const registry = new TraceSessionRegistry({ maxEvents: 2, maxBytes: 10_000 });
    const limited = registry.create(SESSION_ID, binding());
    limited.setRunning();
    expect(limited.append(event(1))).toBe(true);
    expect(limited.append(event(2))).toBe(true);
    expect(limited.append(event(3))).toBe(false);
    expect(limited.read(0)).toMatchObject({
      ok: true,
      status: "truncated",
      truncated: true,
      totalEventCount: 2,
      error: { code: "TRACE_LIMIT" },
    });

    const malformed = registry.create("trace_qrstuvwxyzabcdef", binding());
    malformed.setRunning();
    expect(malformed.append(event(2))).toBe(false);
    expect(malformed.read(0)).toMatchObject({
      ok: true,
      status: "failed",
      error: { code: "TRACE_PROTOCOL_ERROR" },
    });

    const byteLimited = new TraceSessionRegistry({ maxEvents: 10, maxBytes: 1 }).create(
      "trace_bytesabcdefghijkl",
      binding(),
    );
    byteLimited.setRunning();
    expect(byteLimited.append(event(1))).toBe(false);
    expect(byteLimited.read(0)).toMatchObject({
      ok: true,
      status: "truncated",
      totalEventBytes: 0,
      error: { code: "TRACE_LIMIT" },
    });
  });

  it("rejects protocol records for non-instrumented lines", () => {
    const clock = new FakeClock();
    const registry = new TraceSessionRegistry();
    const session = registry.create(SESSION_ID, binding());
    session.setRunning();
    const parser = new TraceProtocolParser({
      protocolNonce: NONCE,
      startedAtMs: 0,
      clock,
      allowedLines: new Set([2]),
      onEvent: (event) => session.append(event),
      onProtocolError: (message) => session.fail({ code: "TRACE_PROTOCOL_ERROR", message }),
    });

    parser.push(Buffer.from(`\u001eCBT:${NONCE}:1:L:999\n`));
    expect(session.read(0)).toMatchObject({
      ok: true,
      status: "failed",
      totalEventCount: 0,
      error: { code: "TRACE_PROTOCOL_ERROR" },
    });
  });

  it("decodes only profile-authorized scalar, array, call and object probes", () => {
    const registry = new TraceSessionRegistry();
    const session = registry.create(SESSION_ID, binding());
    session.setRunning();
    const parser = new TraceProtocolParser({
      protocolNonce: NONCE,
      startedAtMs: 0,
      clock: new FakeClock(12),
      allowedLines: new Set([2, 3, 4, 5]),
      allowedProbes: probeDefinitions(),
      onEvent: (traceEvent) => session.append(traceEvent),
      onProtocolError: (message) => session.fail({ code: "TRACE_PROTOCOL_ERROR", message }),
    });

    parser.push(
      Buffer.from(
        [
          `\u001eCBT:${NONCE}:1:P:2:1:S:I:-4`,
          `\u001eCBT:${NONCE}:2:P:3:2:A:I:2:1:2:7`,
          `\u001eCBT:${NONCE}:3:P:4:3:C:E:1:0:0:4:_`,
          `\u001eCBT:${NONCE}:4:P:4:3:C:X:1:0:0:4:15`,
          `\u001eCBT:${NONCE}:5:P:5:4:O:1`,
        ].join("\n") + "\n",
      ),
    );
    parser.finish();

    expect(session.read(0)).toMatchObject({
      ok: true,
      status: "running",
      totalEventCount: 5,
      events: [
        { kind: "probe", probeId: "scalar", probe: { kind: "scalar", value: -4 } },
        {
          kind: "probe",
          probeId: "array",
          probe: { kind: "array", indices: [1, 2], value: 7 },
        },
        {
          kind: "probe",
          probeId: "call",
          probe: {
            kind: "call",
            phase: "enter",
            frameId: 1,
            parentFrameId: null,
            depth: 0,
            argument: 4,
            returnValue: null,
          },
        },
        {
          kind: "probe",
          probeId: "call",
          probe: { kind: "call", phase: "exit", returnValue: 15 },
        },
        {
          kind: "probe",
          probeId: "object",
          probe: {
            kind: "object",
            objectId: "link",
            targetObjectId: "counter",
            fieldId: null,
            value: true,
          },
        },
      ],
    });
  });

  it("fails closed for an unauthorized probe slot, malformed payload or oversized record", () => {
    for (const [suffix, record] of [
      ["slot", `\u001eCBT:${NONCE}:1:P:2:9:S:I:4\n`],
      ["payload", `\u001eCBT:${NONCE}:1:P:2:1:S:B:1\n`],
      ["oversized", `\u001eCBT:${NONCE}:1:P:2:1:S:I:${"1".repeat(300)}`],
    ] as const) {
      const registry = new TraceSessionRegistry();
      const session = registry.create(`trace_${suffix.padEnd(16, "x")}`, binding());
      session.setRunning();
      const parser = new TraceProtocolParser({
        protocolNonce: NONCE,
        startedAtMs: 0,
        clock: new FakeClock(),
        allowedLines: new Set([2]),
        allowedProbes: [probeDefinitions()[0]!],
        onEvent: (traceEvent) => session.append(traceEvent),
        onProtocolError: (message) => session.fail({ code: "TRACE_PROTOCOL_ERROR", message }),
      });
      parser.push(Buffer.from(record));
      parser.finish();
      expect(session.read(0)).toMatchObject({
        ok: true,
        status: "failed",
        totalEventCount: 0,
        error: { code: "TRACE_PROTOCOL_ERROR" },
      });
    }
  });
});

function probeDefinitions(): readonly ResolvedTraceProbeDefinition[] {
  return Object.freeze([
    Object.freeze({
      slot: 1,
      lines: Object.freeze([2]),
      probeId: "scalar",
      kind: "scalar",
      valueType: "integer",
    }),
    Object.freeze({
      slot: 2,
      lines: Object.freeze([3]),
      probeId: "array",
      kind: "array",
      valueType: "integer",
      rank: 2,
    }),
    Object.freeze({ slot: 3, lines: Object.freeze([4]), probeId: "call", kind: "call" }),
    Object.freeze({
      slot: 4,
      lines: Object.freeze([5]),
      probeId: "object",
      kind: "object",
      objectId: "link",
      targetObjectId: "counter",
      fieldId: null,
    }),
  ]);
}

function binding() {
  return Object.freeze({
    sourceFingerprint: "fingerprint",
    inputFingerprint: fingerprintSource(""),
    observationProfileId: null,
    observationAuthorizationDigest: null,
  });
}

function event(sequence: number) {
  return {
    sequence,
    kind: "line" as const,
    line: 2,
    branchTaken: null,
    elapsedMs: sequence,
  };
}
