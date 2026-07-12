import { describe, expect, it } from "vitest";
import {
  createGoldLeaksToolRecoveryGate,
  isPureLeaksToolFailure,
} from "../../scripts/lib/gold-leaks-tool-recovery.mjs";

const toolFailure = Object.freeze({
  ok: false,
  termination: "process-exit",
  exitCode: 0,
  signal: null,
  error: { code: "PROCESS_CONTROL_FAILED" },
  leakCheck: { ok: false, verdict: "tool-error", summary: "0 leaks" },
});
const success = Object.freeze({
  ok: true,
  termination: "process-exit",
  exitCode: 0,
  signal: null,
  leakCheck: { ok: true, verdict: "clean", summary: "0 leaks" },
});

describe("gold leaks tool recovery", () => {
  it("permits one suite-wide same-path retry for a pure process-control tool failure", async () => {
    const gate = createGoldLeaksToolRecoveryGate();
    const recovered = [];
    let firstAttempts = 0;
    const first = await gate.run(async () => (++firstAttempts === 1 ? toolFailure : success), {
      label: "sample/leaks",
      hasNonRetryableEvidence: () => false,
      onRecovery: (entry) => recovered.push(entry),
    });
    let secondAttempts = 0;
    const second = await gate.run(
      async () => {
        secondAttempts += 1;
        return toolFailure;
      },
      {
        label: "another/leaks",
        hasNonRetryableEvidence: () => false,
        onRecovery: (entry) => recovered.push(entry),
      },
    );

    expect(first).toEqual({ result: success, retried: true });
    expect(firstAttempts).toBe(2);
    expect(second).toEqual({ result: toolFailure, retried: false });
    expect(secondAttempts).toBe(1);
    expect(recovered).toEqual([{ label: "sample/leaks" }]);
    expect(gate.recoveries).toEqual(recovered);
  });

  it("never retries when sanitizer or non-zero leak evidence is present", async () => {
    const gate = createGoldLeaksToolRecoveryGate();
    let attempts = 0;
    const outcome = await gate.run(
      async () => {
        attempts += 1;
        return toolFailure;
      },
      {
        label: "sample/leaks",
        hasNonRetryableEvidence: () => true,
        onRecovery: () => undefined,
      },
    );

    expect(outcome.retried).toBe(false);
    expect(attempts).toBe(1);
    expect(gate.recoveries).toEqual([]);
  });

  it("returns the second tool failure unchanged so the caller still blocks", async () => {
    const gate = createGoldLeaksToolRecoveryGate();
    let attempts = 0;
    const outcome = await gate.run(
      async () => {
        attempts += 1;
        return toolFailure;
      },
      {
        label: "sample/leaks",
        hasNonRetryableEvidence: () => false,
        onRecovery: () => undefined,
      },
    );

    expect(outcome).toEqual({ result: toolFailure, retried: true });
    expect(attempts).toBe(2);
    expect(gate.recoveries).toEqual([{ label: "sample/leaks" }]);
  });

  it("rejects findings, abnormal exits, and unrelated errors from retry eligibility", () => {
    expect(isPureLeaksToolFailure(toolFailure)).toBe(true);
    expect(
      isPureLeaksToolFailure({
        ...toolFailure,
        leakCheck: { ok: false, verdict: "finding", summary: "1 leak" },
      }),
    ).toBe(false);
    expect(isPureLeaksToolFailure({ ...toolFailure, exitCode: 1 })).toBe(false);
    expect(isPureLeaksToolFailure({ ...toolFailure, error: { code: "RESOURCE_LIMIT" } })).toBe(
      false,
    );
  });
});
