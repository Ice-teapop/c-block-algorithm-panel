import { describe, expect, it } from "vitest";
import {
  createWorkbenchPrimaryActionState,
  reduceWorkbenchPrimaryActionState,
  selectWorkbenchPrimaryAction,
} from "../../src/app/workbench-primary-action.js";

const SOURCE_A = "100:source-a";
const SOURCE_B = "100:source-b";

describe("workbench primary action state", () => {
  it("keeps a known problem behind run, then prioritizes it after real execution", () => {
    let state = createWorkbenchPrimaryActionState(SOURCE_A);
    expect(selectWorkbenchPrimaryAction(state)).toBe("run");

    state = reduceWorkbenchPrimaryActionState(state, {
      type: "problem-changed",
      sourceFingerprint: SOURCE_A,
      present: true,
    });
    expect(selectWorkbenchPrimaryAction(state)).toBe("run");

    state = reduceWorkbenchPrimaryActionState(state, {
      type: "run-finished",
      sourceFingerprint: SOURCE_A,
      ok: true,
    });
    expect(selectWorkbenchPrimaryAction(state)).toBe("problem");
  });

  it("returns to run after a successful observation when no problem exists", () => {
    let state = createWorkbenchPrimaryActionState(SOURCE_A);
    state = reduceWorkbenchPrimaryActionState(state, {
      type: "run-finished",
      sourceFingerprint: SOURCE_A,
      ok: true,
    });
    state = reduceWorkbenchPrimaryActionState(state, {
      type: "observation-finished",
      sourceFingerprint: SOURCE_A,
      ok: true,
    });

    expect(state.observation).toBe("completed");
    expect(selectWorkbenchPrimaryAction(state)).toBe("run");
  });

  it("routes run and observation failures directly to problem", () => {
    const runFailed = reduceWorkbenchPrimaryActionState(
      createWorkbenchPrimaryActionState(SOURCE_A),
      { type: "run-finished", sourceFingerprint: SOURCE_A, ok: false },
    );
    expect(selectWorkbenchPrimaryAction(runFailed)).toBe("problem");

    let observationFailed = createWorkbenchPrimaryActionState(SOURCE_A);
    observationFailed = reduceWorkbenchPrimaryActionState(observationFailed, {
      type: "run-finished",
      sourceFingerprint: SOURCE_A,
      ok: true,
    });
    observationFailed = reduceWorkbenchPrimaryActionState(observationFailed, {
      type: "observation-finished",
      sourceFingerprint: SOURCE_A,
      ok: false,
    });
    expect(selectWorkbenchPrimaryAction(observationFailed)).toBe("problem");
  });

  it("ignores stale evidence and resets all progress for a source change", () => {
    let state = createWorkbenchPrimaryActionState(SOURCE_A);
    const stale = reduceWorkbenchPrimaryActionState(state, {
      type: "run-finished",
      sourceFingerprint: SOURCE_B,
      ok: true,
    });
    expect(stale).toBe(state);

    const earlyObservation = reduceWorkbenchPrimaryActionState(state, {
      type: "observation-finished",
      sourceFingerprint: SOURCE_A,
      ok: true,
    });
    expect(earlyObservation).toBe(state);

    state = reduceWorkbenchPrimaryActionState(state, {
      type: "run-finished",
      sourceFingerprint: SOURCE_A,
      ok: true,
    });
    state = reduceWorkbenchPrimaryActionState(state, {
      type: "source-reset",
      sourceFingerprint: SOURCE_B,
    });

    expect(state).toEqual({
      sourceFingerprint: SOURCE_B,
      run: "none",
      observation: "none",
      problemPresent: false,
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(selectWorkbenchPrimaryAction(state)).toBe("run");
  });
});
