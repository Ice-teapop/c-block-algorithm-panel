import { describe, expect, it } from "vitest";
import { TRACE_BYTE_LIMIT, TRACE_EVENT_LIMIT } from "../../src/shared/trace.js";
import { FakeClock } from "./fakes.js";
import {
  TraceProtocolParser,
  TraceSessionRegistry,
} from "../../electron/main/runner/trace-session.js";

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
    const session = registry.create(SESSION_ID, "fingerprint");
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

  it("truncates at the hard event boundary and fails malformed sequence closed", () => {
    const registry = new TraceSessionRegistry({ maxEvents: 2, maxBytes: 10_000 });
    const limited = registry.create(SESSION_ID, "fingerprint");
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

    const malformed = registry.create("trace_qrstuvwxyzabcdef", "fingerprint");
    malformed.setRunning();
    expect(malformed.append(event(2))).toBe(false);
    expect(malformed.read(0)).toMatchObject({
      ok: true,
      status: "failed",
      error: { code: "TRACE_PROTOCOL_ERROR" },
    });

    const byteLimited = new TraceSessionRegistry({ maxEvents: 10, maxBytes: 1 }).create(
      "trace_bytesabcdefghijkl",
      "fingerprint",
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
    const session = registry.create(SESSION_ID, "fingerprint");
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
});

function event(sequence: number) {
  return {
    sequence,
    kind: "line" as const,
    line: 2,
    branchTaken: null,
    elapsedMs: sequence,
  };
}
