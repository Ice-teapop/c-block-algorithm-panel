import type { FlowLearningObservation } from "./flow-workbench-controller.js";
import type { GuidedLessonWorkspaceController } from "./guided-lesson-workspace-controller.js";
import type { RuntimeLearningObservation } from "./runtime-workspace-controller.js";
import { FIRST_MINIMUM_ALGORITHM_FINGERPRINT } from "../tutorials/first-lesson.js";

export function forwardRuntimeLearningObservation(
  lesson: GuidedLessonWorkspaceController | null,
  observation: RuntimeLearningObservation,
  course?: Pick<
    { recordRuntimeObservation(value: RuntimeLearningObservation): void },
    "recordRuntimeObservation"
  >,
): void {
  course?.recordRuntimeObservation(observation);
  if (lesson === null) return;
  if (observation.type === "benchmark-completed") {
    const binding = lesson.binding(
      observation.sourceFingerprint,
      observation.scenarioId,
      observation.scenarioVersion,
    );
    if (binding === null || binding.workspaceId !== observation.workspaceId) return;
    lesson.recordEvidence({
      type: "benchmark-completed",
      binding,
      sizes: observation.sizes,
      repetitions: observation.repetitions,
    });
    return;
  }
  const caseId = caseIdForSize(observation.size);
  if (caseId === null) return;
  const binding = lesson.binding(
    observation.sourceFingerprint,
    observation.scenarioId,
    observation.scenarioVersion,
  );
  if (binding === null || binding.workspaceId !== observation.workspaceId) return;
  if (observation.type === "run-completed") {
    lesson.recordEvidence({
      type: "real-run",
      binding,
      caseId,
      mode: "real",
      ok: observation.ok,
      exitCode: observation.exitCode,
      termination: observation.termination,
      stdout: observation.stdout,
      historyDisposition: observation.historyDisposition,
    });
    return;
  }
  const role =
    observation.sourceFingerprint === FIRST_MINIMUM_ALGORITHM_FINGERPRINT
      ? "minimum-update-condition"
      : "maximum-update-condition";
  const outcomes = new Set<"true" | "false">();
  if (observation.branchKinds.includes("branch-true")) outcomes.add("true");
  if (observation.branchKinds.includes("branch-false")) outcomes.add("false");
  lesson.recordEvidence({
    type: "trace-completed",
    binding,
    caseId,
    mode: "real",
    mapped: observation.mapped,
    truncated: observation.truncated,
    visitedBranches: Object.freeze(
      [...outcomes].map((outcome) => Object.freeze({ role, outcome })),
    ),
  });
}

export function forwardFlowLearningObservation(
  lesson: GuidedLessonWorkspaceController | null,
  observation: FlowLearningObservation,
): void {
  if (lesson === null) return;
  const binding = lesson.binding(observation.sourceFingerprint);
  if (binding === null || binding.workspaceId !== observation.workspaceId) return;
  if (observation.type === "preset-inserted") {
    lesson.recordEvidence({
      type: "preset-inserted",
      binding,
      presetId: observation.presetId,
      committed: observation.committed,
    });
    return;
  }
  lesson.recordEvidence({
    type: "connection-committed",
    binding,
    presetId: observation.presetId,
    cfgAccepted: observation.cfgAccepted,
  });
}

function caseIdForSize(size: number): "normal" | "negative" | "single" | null {
  if (size === 5) return "normal";
  if (size === 4) return "negative";
  if (size === 1) return "single";
  return null;
}
