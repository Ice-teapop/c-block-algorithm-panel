import { describe, expect, it, vi } from "vitest";
import {
  FIRST_ALGORITHM_BUG_FINGERPRINT,
  FIRST_ALGORITHM_BUG_SOURCE,
  FIRST_ALGORITHM_SCENARIO_VERSION,
  FIRST_ALGORITHM_SKELETON_FINGERPRINT,
  FIRST_ALGORITHM_SOURCE,
  FIRST_ALGORITHM_SOURCE_FINGERPRINT,
  FIRST_GUIDED_LESSON,
  FIRST_GUIDED_LESSON_ID,
  FIRST_GUIDED_LESSON_VERSION,
  FIRST_MINIMUM_ALGORITHM_FINGERPRINT,
  MAXIMUM_SCENARIO_ID,
  MAXIMUM_UPDATE_PRESET_ID,
  MINIMUM_SCENARIO_ID,
  advanceGuidedLesson,
  canAdvanceGuidedLesson,
  createGuidedLessonController,
  createGuidedLessonProgress,
  deserializeGuidedLessonProgress,
  getGuidedLessonCheckpoint,
  recordGuidedLessonEvidence,
  saveGuidedLessonCheckpoint,
  serializeGuidedLessonProgress,
  type GuidedExactDiff,
  type GuidedLessonProgress,
  type GuidedSourceProfile,
  type LearningEvidenceBinding,
  type LearningEvidenceEvent,
} from "../../src/tutorials/index.js";

const WORKSPACE_ID = "tutorial.maximum.workspace";

describe("guided lesson state machine", () => {
  it("starts as deeply immutable progress at mission one", () => {
    const progress = fresh();
    expect(progress).toMatchObject({
      schemaVersion: 1,
      lessonId: FIRST_GUIDED_LESSON_ID,
      lessonVersion: FIRST_GUIDED_LESSON_VERSION,
      workspaceId: WORKSPACE_ID,
      status: "active",
      currentMissionId: "mission.run",
      currentStageId: "mission.run.execute",
      completedMissionIds: [],
      satisfiedRequirements: [],
    });
    expect(Object.isFrozen(progress)).toBe(true);
    expect(Object.isFrozen(progress.satisfiedRequirements)).toBe(true);
    expect(Object.isFrozen(progress.checkpoints)).toBe(true);
  });

  it("requires matching real run evidence and an explicit next action", () => {
    let progress = fresh();
    expect(() => advanceGuidedLesson(FIRST_GUIDED_LESSON, progress)).toThrow(/尚未全部满足/u);

    const simulated = recordGuidedLessonEvidence(
      FIRST_GUIDED_LESSON,
      progress,
      runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n", {
        mode: "simulation",
      }),
    );
    expect(simulated).toMatchObject({ status: "rejected", reason: "no-requirement-match" });
    expect(simulated.progress).toEqual(progress);

    const wrongVersion = recordGuidedLessonEvidence(FIRST_GUIDED_LESSON, progress, {
      ...runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"),
      binding: binding(progress, MAXIMUM_SCENARIO_ID, "9.9.9"),
    });
    expect(wrongVersion).toMatchObject({ status: "rejected", reason: "no-requirement-match" });

    const wrongOutput = recordGuidedLessonEvidence(
      FIRST_GUIDED_LESSON,
      progress,
      runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "7\n"),
    );
    expect(wrongOutput).toMatchObject({ status: "rejected", reason: "no-requirement-match" });

    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"));
    expect(canAdvanceGuidedLesson(FIRST_GUIDED_LESSON, progress)).toBe(true);
    expect(progress.currentMissionId).toBe("mission.run");

    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);
    expect(progress.currentMissionId).toBe("mission.observe");
    expect(progress.completedMissionIds).toEqual(["mission.run"]);
  });

  it("invalidates current-stage evidence on source change and rejects stale results", () => {
    let progress = fresh();
    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"));
    const oldProgress = progress;
    progress = acceptSourceChange(progress, FIRST_ALGORITHM_SKELETON_FINGERPRINT);
    expect(progress.satisfiedRequirements).toEqual([]);
    expect(canAdvanceGuidedLesson(FIRST_GUIDED_LESSON, progress)).toBe(false);

    const stale = recordGuidedLessonEvidence(
      FIRST_GUIDED_LESSON,
      progress,
      runEvent(oldProgress, MAXIMUM_SCENARIO_ID, "normal", "8\n"),
    );
    expect(stale).toMatchObject({ status: "rejected", reason: "source-mismatch" });
    expect(stale.progress).toEqual(progress);

    const currentButWrongSource = recordGuidedLessonEvidence(
      FIRST_GUIDED_LESSON,
      progress,
      runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"),
    );
    expect(currentButWrongSource).toMatchObject({
      status: "rejected",
      reason: "no-requirement-match",
    });

    const invalidChange = recordGuidedLessonEvidence(
      FIRST_GUIDED_LESSON,
      progress,
      sourceChangedEvent(progress, progress.sourceFingerprint),
    );
    expect(invalidChange).toMatchObject({
      status: "rejected",
      reason: "invalid-source-change",
    });
  });

  it("fails closed on lesson, workspace and malformed scenario bindings", () => {
    const progress = fresh();
    const valid = runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n");
    expect(
      recordGuidedLessonEvidence(FIRST_GUIDED_LESSON, progress, {
        ...valid,
        binding: { ...valid.binding, lessonId: "lesson.other" },
      }),
    ).toMatchObject({ status: "rejected", reason: "lesson-mismatch" });
    expect(
      recordGuidedLessonEvidence(FIRST_GUIDED_LESSON, progress, {
        ...valid,
        binding: { ...valid.binding, workspaceId: "workspace.other" },
      }),
    ).toMatchObject({ status: "rejected", reason: "workspace-mismatch" });

    const malformed = {
      ...valid,
      binding: { ...valid.binding, scenarioVersion: null },
    } as unknown as LearningEvidenceEvent;
    expect(() => recordGuidedLessonEvidence(FIRST_GUIDED_LESSON, progress, malformed)).toThrow(
      /scenarioId 与 scenarioVersion/u,
    );
  });

  it("rejects simulated, unmapped, partial and truncated Trace evidence", () => {
    let progress = fresh();
    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"));
    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);

    for (const event of [
      traceEvent(progress, "normal", { mode: "simulation" }),
      traceEvent(progress, "normal", { mapped: false }),
      traceEvent(progress, "normal", { outcomes: ["true"] }),
      traceEvent(progress, "normal", { truncated: true }),
    ]) {
      const result = recordGuidedLessonEvidence(FIRST_GUIDED_LESSON, progress, event);
      expect(result).toMatchObject({ status: "rejected", reason: "no-requirement-match" });
    }

    progress = accept(progress, traceEvent(progress, "normal"));
    expect(canAdvanceGuidedLesson(FIRST_GUIDED_LESSON, progress)).toBe(true);
  });

  it("completes all five missions while preserving sealed debug reproduction evidence", () => {
    let progress = fresh();

    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"));
    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);
    progress = accept(progress, traceEvent(progress, "normal"));
    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);

    progress = acceptSourceChange(progress, FIRST_ALGORITHM_SKELETON_FINGERPRINT);
    const skeleton = acceptResult(
      recordGuidedLessonEvidence(
        FIRST_GUIDED_LESSON,
        progress,
        sourceVerifiedEvent(progress, "maximum-skeleton", "maximum-update-removed", false),
      ),
    );
    expect(skeleton.stageAdvanced).toBe(true);
    progress = skeleton.progress;
    expect(progress.currentStageId).toBe("mission.complete.assemble");

    progress = acceptSourceChange(progress, FIRST_ALGORITHM_SOURCE_FINGERPRINT);
    progress = accept(progress, presetEvent(progress));
    progress = accept(progress, connectionEvent(progress));
    progress = accept(
      progress,
      sourceVerifiedEvent(progress, "maximum-complete", "maximum-update-inserted", true),
    );
    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"));
    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);

    progress = acceptSourceChange(progress, FIRST_ALGORITHM_BUG_FINGERPRINT);
    progress = accept(
      progress,
      sourceVerifiedEvent(progress, "maximum-bug", "maximum-comparator-bug", true),
    );
    progress = accept(
      progress,
      runEvent(progress, MAXIMUM_SCENARIO_ID, "negative", "-12\n", {
        historyDisposition: "teaching-failure",
      }),
    );
    const reproduced = acceptResult(
      recordGuidedLessonEvidence(FIRST_GUIDED_LESSON, progress, traceEvent(progress, "negative")),
    );
    expect(reproduced.stageAdvanced).toBe(true);
    progress = reproduced.progress;
    expect(progress.completedStageIds).toContain("mission.debug.reproduce");
    expect(progress.currentStageId).toBe("mission.debug.repair");

    progress = acceptSourceChange(progress, FIRST_ALGORITHM_SOURCE_FINGERPRINT);
    expect(progress.completedStageIds).toContain("mission.debug.reproduce");
    progress = accept(
      progress,
      sourceVerifiedEvent(progress, "maximum-complete", "maximum-comparator-restored", true),
    );
    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"));
    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "negative", "-4\n"));
    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "single", "42\n"));
    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);

    progress = acceptSourceChange(progress, FIRST_MINIMUM_ALGORITHM_FINGERPRINT);
    progress = accept(
      progress,
      sourceVerifiedEvent(progress, "minimum-complete", "minimum-migration", true),
    );
    progress = accept(progress, runEvent(progress, MINIMUM_SCENARIO_ID, "normal", "2\n"));
    progress = accept(progress, runEvent(progress, MINIMUM_SCENARIO_ID, "negative", "-12\n"));
    progress = accept(progress, runEvent(progress, MINIMUM_SCENARIO_ID, "single", "42\n"));
    expect(canAdvanceGuidedLesson(FIRST_GUIDED_LESSON, progress)).toBe(true);

    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);
    expect(progress.status).toBe("completed");
    expect(progress.completedMissionIds).toEqual([
      "mission.run",
      "mission.observe",
      "mission.complete",
      "mission.debug",
      "mission.migrate",
    ]);
    expect(canAdvanceGuidedLesson(FIRST_GUIDED_LESSON, progress)).toBe(false);
  });

  it("stores checkpoints as inert data and never changes source implicitly", () => {
    let progress = fresh();
    progress = saveGuidedLessonCheckpoint(FIRST_GUIDED_LESSON, progress, {
      id: "checkpoint.correct",
      label: "正确版本",
      source: FIRST_ALGORITHM_SOURCE,
      sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    });
    const checkpoint = getGuidedLessonCheckpoint(progress, "checkpoint.correct");
    expect(checkpoint).toMatchObject({
      source: FIRST_ALGORITHM_SOURCE,
      sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    });

    progress = acceptSourceChange(progress, FIRST_ALGORITHM_BUG_FINGERPRINT);
    expect(progress.sourceFingerprint).toBe(FIRST_ALGORITHM_BUG_FINGERPRINT);
    expect(getGuidedLessonCheckpoint(progress, "checkpoint.correct")?.source).toBe(
      FIRST_ALGORITHM_SOURCE,
    );
    expect(progress.sourceFingerprint).not.toBe(checkpoint?.sourceFingerprint);

    expect(() =>
      saveGuidedLessonCheckpoint(FIRST_GUIDED_LESSON, progress, {
        id: "checkpoint.invalid",
        label: "错误指纹",
        source: FIRST_ALGORITHM_BUG_SOURCE,
        sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
      }),
    ).toThrow(/指纹不一致/u);
  });

  it("round-trips strict progress and safely resets old, corrupt or mismatched data", () => {
    let progress = fresh();
    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"));
    const serialized = serializeGuidedLessonProgress(FIRST_GUIDED_LESSON, progress);
    const restored = deserializeGuidedLessonProgress(serialized, FIRST_GUIDED_LESSON, {
      workspaceId: WORKSPACE_ID,
      sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    });
    expect(restored).toMatchObject({ status: "restored", progress });
    expect(Object.isFrozen(restored.progress)).toBe(true);
    expect(Object.isFrozen(restored.progress.satisfiedRequirements[0]?.binding)).toBe(true);

    expect(read("{broken")).toMatchObject({ status: "reset", reason: "invalid-json" });
    expect(read(JSON.stringify({ schemaVersion: 0 }))).toMatchObject({
      status: "reset",
      reason: "unsupported-version",
    });

    const oldLesson = JSON.parse(serialized) as Record<string, unknown>;
    oldLesson.lessonVersion = "5.0.0";
    expect(read(JSON.stringify(oldLesson))).toMatchObject({
      status: "reset",
      reason: "lesson-version-mismatch",
    });

    const extraField = JSON.parse(serialized) as Record<string, unknown>;
    extraField.untrusted = true;
    expect(read(JSON.stringify(extraField))).toMatchObject({
      status: "reset",
      reason: "corrupted",
    });

    const staleEvidence = JSON.parse(serialized) as {
      satisfiedRequirements: { binding: { sourceFingerprint: string } }[];
    };
    staleEvidence.satisfiedRequirements[0]!.binding.sourceFingerprint = "stale";
    expect(read(JSON.stringify(staleEvidence))).toMatchObject({
      status: "reset",
      reason: "corrupted",
    });

    const forgedType = JSON.parse(serialized) as {
      satisfiedRequirements: { eventType: string }[];
    };
    forgedType.satisfiedRequirements[0]!.eventType = "workspace-opened";
    expect(read(JSON.stringify(forgedType))).toMatchObject({
      status: "reset",
      reason: "corrupted",
    });

    expect(
      deserializeGuidedLessonProgress(serialized, FIRST_GUIDED_LESSON, {
        workspaceId: "another.workspace",
        sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
      }),
    ).toMatchObject({ status: "reset", reason: "workspace-mismatch" });
    expect(
      deserializeGuidedLessonProgress(serialized, FIRST_GUIDED_LESSON, {
        workspaceId: WORKSPACE_ID,
        sourceFingerprint: FIRST_ALGORITHM_BUG_FINGERPRINT,
      }),
    ).toMatchObject({ status: "reset", reason: "source-mismatch" });
  });

  it("provides a controller wrapper without weakening pure transition gates", () => {
    const onChange = vi.fn();
    const controller = createGuidedLessonController({
      definition: FIRST_GUIDED_LESSON,
      progress: fresh(),
      onChange,
    });
    const rejected = controller.recordEvidence(
      runEvent(controller.getProgress(), MAXIMUM_SCENARIO_ID, "normal", "wrong\n"),
    );
    expect(rejected.status).toBe("rejected");
    expect(onChange).not.toHaveBeenCalled();

    const accepted = controller.recordEvidence(
      runEvent(controller.getProgress(), MAXIMUM_SCENARIO_ID, "normal", "8\n"),
    );
    expect(accepted.status).toBe("accepted");
    expect(controller.canAdvance()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    controller.next();
    expect(controller.getProgress().currentMissionId).toBe("mission.observe");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});

function fresh(): GuidedLessonProgress {
  return createGuidedLessonProgress(FIRST_GUIDED_LESSON, {
    workspaceId: WORKSPACE_ID,
    sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
  });
}

function read(serialized: string) {
  return deserializeGuidedLessonProgress(serialized, FIRST_GUIDED_LESSON, {
    workspaceId: WORKSPACE_ID,
    sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
  });
}

function accept(
  progress: GuidedLessonProgress,
  event: LearningEvidenceEvent,
): GuidedLessonProgress {
  return acceptResult(recordGuidedLessonEvidence(FIRST_GUIDED_LESSON, progress, event)).progress;
}

function acceptResult(
  result: ReturnType<typeof recordGuidedLessonEvidence>,
): Extract<ReturnType<typeof recordGuidedLessonEvidence>, { status: "accepted" }> {
  expect(result.status).toBe("accepted");
  if (result.status !== "accepted") throw new Error(`证据被拒绝：${result.reason}`);
  return result;
}

function acceptSourceChange(
  progress: GuidedLessonProgress,
  nextFingerprint: string,
): GuidedLessonProgress {
  return accept(progress, sourceChangedEvent(progress, nextFingerprint));
}

function binding(
  progress: GuidedLessonProgress,
  scenarioId: string | null,
  scenarioVersion: string | null = scenarioId === null ? null : FIRST_ALGORITHM_SCENARIO_VERSION,
): LearningEvidenceBinding {
  return Object.freeze({
    lessonId: FIRST_GUIDED_LESSON_ID,
    lessonVersion: FIRST_GUIDED_LESSON_VERSION,
    workspaceId: WORKSPACE_ID,
    sourceFingerprint: progress.sourceFingerprint,
    scenarioId,
    scenarioVersion,
  });
}

function runEvent(
  progress: GuidedLessonProgress,
  scenarioId: string,
  caseId: "normal" | "negative" | "single",
  stdout: string,
  overrides: Partial<{
    mode: "real" | "simulation";
    historyDisposition: "success" | "teaching-failure";
  }> = {},
): LearningEvidenceEvent {
  return Object.freeze({
    type: "real-run",
    binding: binding(progress, scenarioId),
    caseId,
    mode: overrides.mode ?? "real",
    ok: true,
    exitCode: 0,
    termination: "process-exit",
    stdout,
    historyDisposition: overrides.historyDisposition ?? "success",
  });
}

function traceEvent(
  progress: GuidedLessonProgress,
  caseId: "normal" | "negative" | "single",
  overrides: Partial<{
    mode: "real" | "simulation";
    mapped: boolean;
    truncated: boolean;
    outcomes: readonly ("true" | "false")[];
  }> = {},
): LearningEvidenceEvent {
  return Object.freeze({
    type: "trace-completed",
    binding: binding(progress, MAXIMUM_SCENARIO_ID),
    caseId,
    mode: overrides.mode ?? "real",
    mapped: overrides.mapped ?? true,
    truncated: overrides.truncated ?? false,
    visitedBranches: Object.freeze(
      (overrides.outcomes ?? ["true", "false"]).map((outcome) =>
        Object.freeze({ role: "maximum-update-condition" as const, outcome }),
      ),
    ),
  });
}

function sourceChangedEvent(
  progress: GuidedLessonProgress,
  nextFingerprint: string,
): LearningEvidenceEvent {
  return Object.freeze({
    type: "source-changed",
    binding: Object.freeze({
      ...binding(progress, null),
      sourceFingerprint: nextFingerprint,
    }),
    previousSourceFingerprint: progress.sourceFingerprint,
    reason: "lesson-transform",
  });
}

function sourceVerifiedEvent(
  progress: GuidedLessonProgress,
  profile: GuidedSourceProfile,
  exactDiff: GuidedExactDiff,
  linearScan: boolean,
): LearningEvidenceEvent {
  return Object.freeze({
    type: "source-verified",
    binding: binding(progress, null),
    profile,
    exactDiff,
    reparsed: true,
    roundTripLossless: true,
    cfgComplete: true,
    linearScan,
  });
}

function presetEvent(progress: GuidedLessonProgress): LearningEvidenceEvent {
  return Object.freeze({
    type: "preset-inserted",
    binding: binding(progress, null),
    presetId: MAXIMUM_UPDATE_PRESET_ID,
    committed: true,
  });
}

function connectionEvent(progress: GuidedLessonProgress): LearningEvidenceEvent {
  return Object.freeze({
    type: "connection-committed",
    binding: binding(progress, null),
    presetId: MAXIMUM_UPDATE_PRESET_ID,
    cfgAccepted: true,
  });
}
