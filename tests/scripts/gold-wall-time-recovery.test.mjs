import { describe, expect, it } from "vitest";
import {
  createGoldWallTimeRecoveryGate,
  isPureGoldWallTimeLimit,
} from "../../scripts/lib/gold-wall-time-recovery.mjs";

const wallTimeLimit = (durationMs = 3_001) => ({
  ok: false,
  termination: "wall-time-limit",
  exitCode: null,
  signal: "SIGKILL",
  durationMs,
  error: { code: "RESOURCE_LIMIT" },
});
const success = Object.freeze({
  ok: true,
  termination: "process-exit",
  exitCode: 0,
  signal: null,
  durationMs: 500,
});

describe("gold sample wall-time recovery", () => {
  it("consumes the suite-wide budget once and keeps every attempt on the same caller path", async () => {
    const gate = createGoldWallTimeRecoveryGate();
    const recovered = [];
    let firstAttempts = 0;
    const first = await gate.run(async () => (++firstAttempts === 1 ? wallTimeLimit() : success), {
      label: "sample/direct",
      hasNonRetryableEvidence: () => false,
      onRecovery: (entry) => recovered.push(entry),
    });
    let secondAttempts = 0;
    const second = await gate.run(
      async () => {
        secondAttempts += 1;
        return wallTimeLimit();
      },
      {
        label: "another/leaks",
        hasNonRetryableEvidence: () => false,
        onRecovery: (entry) => recovered.push(entry),
      },
    );

    expect(first).toEqual({ result: success, retried: true });
    expect(firstAttempts).toBe(2);
    expect(second).toEqual({ result: wallTimeLimit(), retried: false });
    expect(secondAttempts).toBe(1);
    expect(recovered).toEqual([{ label: "sample/direct", durationMs: 3_001 }]);
    expect(gate.recoveries).toEqual(recovered);
  });

  it("never retries a timeout that already contains sanitizer or leak evidence", async () => {
    const gate = createGoldWallTimeRecoveryGate();
    let attempts = 0;
    const outcome = await gate.run(
      async () => {
        attempts += 1;
        return wallTimeLimit();
      },
      {
        label: "sample/direct",
        hasNonRetryableEvidence: () => true,
        onRecovery: () => undefined,
      },
    );

    expect(outcome.retried).toBe(false);
    expect(attempts).toBe(1);
    expect(gate.recoveries).toEqual([]);
  });

  it("rejects every non-wall resource or process failure from recovery eligibility", () => {
    expect(isPureGoldWallTimeLimit(wallTimeLimit())).toBe(true);
    expect(isPureGoldWallTimeLimit({ ...wallTimeLimit(), termination: "rss-limit" })).toBe(false);
    expect(isPureGoldWallTimeLimit({ ...wallTimeLimit(), signal: null })).toBe(false);
    expect(
      isPureGoldWallTimeLimit({ ...wallTimeLimit(), error: { code: "PROCESS_CONTROL_FAILED" } }),
    ).toBe(false);
  });
});
