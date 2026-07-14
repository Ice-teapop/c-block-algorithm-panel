export type WorkbenchPrimaryActionKind = "run" | "observe" | "problem";

export type WorkbenchPrimaryRunState = "none" | "passed" | "failed";
export type WorkbenchPrimaryObservationState = "none" | "completed" | "failed";

export interface WorkbenchPrimaryActionState {
  readonly sourceFingerprint: string;
  readonly run: WorkbenchPrimaryRunState;
  readonly observation: WorkbenchPrimaryObservationState;
  readonly problemPresent: boolean;
}

export type WorkbenchPrimaryActionEvent =
  | {
      readonly type: "source-reset";
      readonly sourceFingerprint: string;
    }
  | {
      readonly type: "run-finished";
      readonly sourceFingerprint: string;
      readonly ok: boolean;
    }
  | {
      readonly type: "observation-finished";
      readonly sourceFingerprint: string;
      readonly ok: boolean;
    }
  | {
      readonly type: "problem-changed";
      readonly sourceFingerprint: string;
      readonly present: boolean;
    };

export function createWorkbenchPrimaryActionState(
  sourceFingerprint: string,
): WorkbenchPrimaryActionState {
  assertFingerprint(sourceFingerprint);
  return freezeState(sourceFingerprint, "none", "none", false);
}

export function reduceWorkbenchPrimaryActionState(
  state: WorkbenchPrimaryActionState,
  event: WorkbenchPrimaryActionEvent,
): WorkbenchPrimaryActionState {
  assertFingerprint(event.sourceFingerprint);
  if (event.type === "source-reset") {
    return createWorkbenchPrimaryActionState(event.sourceFingerprint);
  }
  if (event.sourceFingerprint !== state.sourceFingerprint) return state;

  if (event.type === "run-finished") {
    return freezeState(
      state.sourceFingerprint,
      event.ok ? "passed" : "failed",
      "none",
      state.problemPresent,
    );
  }
  if (event.type === "observation-finished") {
    // A validation Trace may finish inside a scenario run. It must not skip the explicit
    // observation step until a successful run for this exact source has been recorded.
    if (state.run !== "passed") return state;
    return freezeState(
      state.sourceFingerprint,
      state.run,
      event.ok ? "completed" : "failed",
      state.problemPresent,
    );
  }
  return freezeState(state.sourceFingerprint, state.run, state.observation, event.present);
}

export function selectWorkbenchPrimaryAction(
  state: WorkbenchPrimaryActionState,
): WorkbenchPrimaryActionKind {
  if (state.run === "failed" || state.observation === "failed") return "problem";
  if (state.run !== "passed") return "run";
  if (state.problemPresent) return "problem";
  if (state.observation !== "completed") return "observe";
  return "run";
}

function freezeState(
  sourceFingerprint: string,
  run: WorkbenchPrimaryRunState,
  observation: WorkbenchPrimaryObservationState,
  problemPresent: boolean,
): WorkbenchPrimaryActionState {
  return Object.freeze({ sourceFingerprint, run, observation, problemPresent });
}

function assertFingerprint(value: string): void {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new TypeError("主操作源码指纹必须是非空且无首尾空白的字符串");
  }
}
