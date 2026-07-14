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
  defineGuidedLesson,
  getGuidedLessonCheckpoint,
  recordGuidedLessonEvidence,
  saveGuidedLessonCheckpoint,
  serializeGuidedLessonProgress,
  type GuidedExactDiff,
  type GuidedLessonDefinition,
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

  it("accepts benchmark and visualization evidence only with exact trusted bindings", () => {
    const definition = evidenceLesson();
    let progress = createGuidedLessonProgress(definition, {
      workspaceId: WORKSPACE_ID,
      sourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
    });
    const scenarioBinding = Object.freeze({
      lessonId: definition.id,
      lessonVersion: definition.version,
      workspaceId: WORKSPACE_ID,
      sourceFingerprint: progress.sourceFingerprint,
      scenarioId: MAXIMUM_SCENARIO_ID,
      scenarioVersion: FIRST_ALGORITHM_SCENARIO_VERSION,
    });
    const noScenarioBinding = Object.freeze({
      ...scenarioBinding,
      scenarioId: null,
      scenarioVersion: null,
    });

    expect(
      recordGuidedLessonEvidence(definition, progress, {
        type: "benchmark-completed",
        binding: scenarioBinding,
        sizes: Object.freeze([8, 32]),
        repetitions: 3,
      }),
    ).toMatchObject({ status: "rejected", reason: "no-requirement-match" });
    expect(() =>
      recordGuidedLessonEvidence(definition, progress, {
        type: "benchmark-completed",
        binding: scenarioBinding,
        sizes: [8, 32, 32, 128],
        repetitions: 3,
      }),
    ).toThrow(/不重复/u);

    progress = acceptFor(
      definition,
      progress,
      Object.freeze({
        type: "benchmark-completed",
        binding: scenarioBinding,
        sizes: Object.freeze([128, 8, 32]),
        repetitions: 4,
      }),
    );
    expect(
      recordGuidedLessonEvidence(definition, progress, {
        type: "visualization-answer",
        binding: noScenarioBinding,
        visualizationId: "analysis-chart",
        answerId: "wrong-answer",
      }),
    ).toMatchObject({ status: "rejected", reason: "no-requirement-match" });
    expect(() =>
      recordGuidedLessonEvidence(definition, progress, {
        type: "visualization-answer",
        binding: scenarioBinding,
        visualizationId: "analysis-chart",
        answerId: "supports-not-proves",
      }),
    ).toThrow(/场景绑定/u);

    progress = acceptFor(definition, progress, {
      type: "visualization-answer",
      binding: noScenarioBinding,
      visualizationId: "analysis-chart",
      answerId: "supports-not-proves",
    });
    expect(canAdvanceGuidedLesson(definition, progress)).toBe(true);
    expect(progress.satisfiedRequirements.map((item) => item.eventType)).toEqual([
      "benchmark-completed",
      "visualization-answer",
    ]);
    const frozenRequirement = definition.missions[0]?.stages[0]?.requirements[0];
    expect(frozenRequirement?.kind).toBe("benchmark-series");
    if (frozenRequirement?.kind !== "benchmark-series") throw new Error("缺少 Benchmark 条件");
    expect(Object.isFrozen(frozenRequirement.sizes)).toBe(true);

    const restored = deserializeGuidedLessonProgress(
      serializeGuidedLessonProgress(definition, progress),
      definition,
      { workspaceId: WORKSPACE_ID, sourceFingerprint: progress.sourceFingerprint },
    );
    expect(restored).toMatchObject({ status: "restored", progress });
  });

  it("completes all seven missions while preserving sealed debug reproduction evidence", () => {
    let progress = fresh();

    progress = accept(progress, runEvent(progress, MAXIMUM_SCENARIO_ID, "normal", "8\n"));
    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);
    progress = accept(progress, traceEvent(progress, "normal"));
    progress = advanceGuidedLesson(FIRST_GUIDED_LESSON, progress);

    progress = accept(progress, visualizationEvent(progress, "trace-chart", "later-event"));
    progress = accept(
      progress,
      visualizationEvent(progress, "trace-chart", "work-above-reference"),
    );
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

    progress = accept(progress, benchmarkEvent(progress, [8, 32, 128], 3));
    progress = accept(progress, visualizationEvent(progress, "analysis-chart", "larger-variation"));
    progress = accept(
      progress,
      visualizationEvent(progress, "analysis-chart", "supports-not-proves"),
    );
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
      "mission.read-trace-chart",
      "mission.complete",
      "mission.read-analysis-chart",
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

function acceptFor(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
  event: LearningEvidenceEvent,
): GuidedLessonProgress {
  return acceptResult(recordGuidedLessonEvidence(definition, progress, event)).progress;
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

function benchmarkEvent(
  progress: GuidedLessonProgress,
  sizes: readonly number[],
  repetitions: number,
): LearningEvidenceEvent {
  return Object.freeze({
    type: "benchmark-completed",
    binding: binding(progress, MAXIMUM_SCENARIO_ID),
    sizes: Object.freeze([...sizes]),
    repetitions,
  });
}

function visualizationEvent(
  progress: GuidedLessonProgress,
  visualizationId: "trace-chart" | "analysis-chart",
  answerId: string,
): LearningEvidenceEvent {
  return Object.freeze({
    type: "visualization-answer",
    binding: binding(progress, null),
    visualizationId,
    answerId,
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

function evidenceLesson(): GuidedLessonDefinition {
  return defineGuidedLesson({
    id: "lesson.evidence-gates",
    version: "1.0.0",
    title: "证据门禁",
    summary: "验证 Benchmark 与图表理解证据。",
    initialSource: FIRST_ALGORITHM_SOURCE,
    initialScenarioId: MAXIMUM_SCENARIO_ID,
    initialScenarioVersion: FIRST_ALGORITHM_SCENARIO_VERSION,
    initialCaseId: "normal",
    missions: [
      {
        id: "mission.evidence",
        title: "证据",
        instruction: "完成真实性能运行并解释图表。",
        why: "防止旧源码或错误图表答案冒充完成。",
        hints: ["检查源码。", "检查规模。", "检查答案。"],
        locateTargetId: "analysis-chart",
        stages: [
          {
            id: "mission.evidence.collect",
            title: "收集并解释",
            instruction: "运行三组规模并回答分析图问题。",
            requirements: [
              {
                id: "mission.evidence.benchmark",
                kind: "benchmark-series",
                label: "完成三组真实 Benchmark",
                scenarioId: MAXIMUM_SCENARIO_ID,
                scenarioVersion: FIRST_ALGORITHM_SCENARIO_VERSION,
                expectedSourceFingerprint: FIRST_ALGORITHM_SOURCE_FINGERPRINT,
                sizes: [8, 32, 128],
                minRepetitions: 3,
              },
              {
                id: "mission.evidence.answer",
                kind: "visualization-answer",
                label: "正确解释分析图",
                visualizationId: "analysis-chart",
                answerId: "supports-not-proves",
              },
            ],
          },
        ],
      },
    ],
  });
}
