import { fingerprintSource } from "../shared/source-snapshot.js";

export const GUIDED_LESSON_PROGRESS_SCHEMA_VERSION = 1 as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const MAX_TEXT_LENGTH = 16_384;
const MAX_SOURCE_LENGTH = 1024 * 1024;
const MAX_CHECKPOINTS = 8;
const MAX_BENCHMARK_SIZES = 64;
const MAX_BENCHMARK_SIZE = 1_000_000;
const MAX_BENCHMARK_REPETITIONS = 10_000;

export interface GuidedLessonScenarioBinding {
  readonly scenarioId: string | null;
  readonly scenarioVersion: string | null;
}

export interface LearningEvidenceBinding extends GuidedLessonScenarioBinding {
  readonly lessonId: string;
  readonly lessonVersion: string;
  readonly workspaceId: string;
  readonly sourceFingerprint: string;
}

interface GuidedRequirementBase {
  readonly id: string;
  readonly label: string;
}

export interface GuidedWorkspaceRequirement extends GuidedRequirementBase {
  readonly kind: "workspace-opened";
  readonly tutorialOwned: boolean;
}

export interface GuidedProjectionRequirement extends GuidedRequirementBase {
  readonly kind: "projection-ready";
  readonly completeness: "complete";
  readonly requireLosslessRoundTrip: boolean;
}

export type GuidedSourceProfile =
  "maximum-complete" | "maximum-skeleton" | "maximum-bug" | "minimum-complete";

export type GuidedExactDiff =
  | "maximum-update-removed"
  | "maximum-update-inserted"
  | "maximum-comparator-bug"
  | "maximum-comparator-restored"
  | "minimum-migration";

export interface GuidedSourceRequirement extends GuidedRequirementBase {
  readonly kind: "source-verified";
  readonly profile: GuidedSourceProfile;
  readonly exactDiff: GuidedExactDiff | null;
  readonly expectedSourceFingerprint: string | null;
  readonly requireReparse: boolean;
  readonly requireLosslessRoundTrip: boolean;
  readonly requireCompleteCfg: boolean;
  readonly requireLinearScan: boolean;
}

export interface GuidedPresetRequirement extends GuidedRequirementBase {
  readonly kind: "preset-inserted";
  readonly presetId: string;
}

export interface GuidedConnectionRequirement extends GuidedRequirementBase {
  readonly kind: "connection-committed";
  readonly presetId: string;
}

export interface GuidedRealRunRequirement extends GuidedRequirementBase {
  readonly kind: "real-run";
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly caseId: string;
  readonly expectedSourceFingerprint: string | null;
  readonly expectedStdout: string;
  readonly historyDisposition: "success" | "teaching-failure";
}

export type GuidedTraceBranchRole = "maximum-update-condition" | "minimum-update-condition";

export interface GuidedRealTraceRequirement extends GuidedRequirementBase {
  readonly kind: "real-trace";
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly caseId: string;
  readonly expectedSourceFingerprint: string;
  readonly branchRole: GuidedTraceBranchRole;
  readonly requiredOutcomes: readonly ("true" | "false")[];
  readonly allowTruncated: boolean;
}

export interface GuidedBenchmarkSeriesRequirement extends GuidedRequirementBase {
  readonly kind: "benchmark-series";
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly expectedSourceFingerprint: string;
  readonly sizes: readonly number[];
  readonly minRepetitions: number;
}

export type GuidedVisualizationId = "trace-chart" | "analysis-chart";

export interface GuidedVisualizationAnswerRequirement extends GuidedRequirementBase {
  readonly kind: "visualization-answer";
  readonly visualizationId: GuidedVisualizationId;
  readonly answerId: string;
}

export type GuidedRequirement =
  | GuidedWorkspaceRequirement
  | GuidedProjectionRequirement
  | GuidedSourceRequirement
  | GuidedPresetRequirement
  | GuidedConnectionRequirement
  | GuidedRealRunRequirement
  | GuidedRealTraceRequirement
  | GuidedBenchmarkSeriesRequirement
  | GuidedVisualizationAnswerRequirement;

export interface GuidedMissionStageDefinition {
  readonly id: string;
  readonly title: string;
  readonly instruction: string;
  readonly requirements: readonly GuidedRequirement[];
}

export interface GuidedMissionDefinition {
  readonly id: string;
  readonly title: string;
  readonly instruction: string;
  readonly why: string;
  readonly hints: readonly [string, string, string];
  readonly locateTargetId: string;
  readonly stages: readonly GuidedMissionStageDefinition[];
}

export interface GuidedLessonDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly summary: string;
  readonly initialSource: string;
  readonly initialScenarioId: string;
  readonly initialScenarioVersion: string;
  readonly initialCaseId: string;
  readonly missions: readonly GuidedMissionDefinition[];
}

interface LearningEvidenceBase {
  readonly binding: LearningEvidenceBinding;
}

export type LearningEvidenceEvent =
  | (LearningEvidenceBase & {
      readonly type: "workspace-opened";
      readonly tutorialOwned: boolean;
    })
  | (LearningEvidenceBase & {
      readonly type: "projection-ready";
      readonly completeness: "complete" | "partial" | "raw";
      readonly roundTripLossless: boolean;
    })
  | (LearningEvidenceBase & {
      readonly type: "source-verified";
      readonly profile: GuidedSourceProfile;
      readonly exactDiff: GuidedExactDiff | null;
      readonly reparsed: boolean;
      readonly roundTripLossless: boolean;
      readonly cfgComplete: boolean;
      readonly linearScan: boolean;
    })
  | (LearningEvidenceBase & {
      readonly type: "preset-inserted";
      readonly presetId: string;
      readonly committed: boolean;
    })
  | (LearningEvidenceBase & {
      readonly type: "connection-committed";
      readonly presetId: string;
      readonly cfgAccepted: boolean;
    })
  | (LearningEvidenceBase & {
      readonly type: "real-run";
      readonly caseId: string;
      readonly mode: "real" | "simulation";
      readonly ok: boolean;
      readonly exitCode: number | null;
      readonly termination: string;
      readonly stdout: string;
      readonly historyDisposition: "success" | "teaching-failure";
    })
  | (LearningEvidenceBase & {
      readonly type: "trace-completed";
      readonly caseId: string;
      readonly mode: "real" | "simulation";
      readonly mapped: boolean;
      readonly truncated: boolean;
      readonly visitedBranches: readonly {
        readonly role: GuidedTraceBranchRole;
        readonly outcome: "true" | "false";
      }[];
    })
  | (LearningEvidenceBase & {
      readonly type: "benchmark-completed";
      readonly sizes: readonly number[];
      readonly repetitions: number;
    })
  | (LearningEvidenceBase & {
      readonly type: "visualization-answer";
      readonly visualizationId: GuidedVisualizationId;
      readonly answerId: string;
    })
  | (LearningEvidenceBase & {
      readonly type: "source-changed";
      readonly previousSourceFingerprint: string;
      readonly reason: "editor" | "preset" | "connection" | "lesson-transform" | "reset";
    });

export interface GuidedRequirementSatisfaction {
  readonly requirementId: string;
  readonly eventType: Exclude<LearningEvidenceEvent["type"], "source-changed">;
  readonly binding: LearningEvidenceBinding;
  readonly caseId: string | null;
}

export interface GuidedSourceCheckpoint {
  readonly id: string;
  readonly missionId: string;
  readonly label: string;
  readonly sourceFingerprint: string;
  readonly source: string;
}

export type GuidedLessonStatus = "active" | "completed" | "exited";

export interface GuidedLessonProgress {
  readonly schemaVersion: typeof GUIDED_LESSON_PROGRESS_SCHEMA_VERSION;
  readonly lessonId: string;
  readonly lessonVersion: string;
  readonly workspaceId: string;
  readonly status: GuidedLessonStatus;
  readonly currentMissionId: string;
  readonly currentStageId: string;
  readonly sourceFingerprint: string;
  readonly satisfiedRequirements: readonly GuidedRequirementSatisfaction[];
  readonly completedStageIds: readonly string[];
  readonly completedMissionIds: readonly string[];
  readonly checkpoints: readonly GuidedSourceCheckpoint[];
}

export interface GuidedLessonContext {
  readonly workspaceId: string;
  readonly sourceFingerprint: string;
}

export type GuidedEvidenceRejectionReason =
  | "lesson-mismatch"
  | "workspace-mismatch"
  | "source-mismatch"
  | "scenario-binding-invalid"
  | "inactive"
  | "no-requirement-match"
  | "duplicate"
  | "invalid-source-change";

export type GuidedEvidenceResult =
  | {
      readonly status: "accepted";
      readonly progress: GuidedLessonProgress;
      readonly matchedRequirementIds: readonly string[];
      readonly stageAdvanced: boolean;
    }
  | {
      readonly status: "rejected";
      readonly progress: GuidedLessonProgress;
      readonly reason: GuidedEvidenceRejectionReason;
    };

export type GuidedProgressResetReason =
  | "missing"
  | "invalid-json"
  | "unsupported-version"
  | "lesson-version-mismatch"
  | "workspace-mismatch"
  | "source-mismatch"
  | "corrupted";

export type GuidedProgressReadResult =
  | { readonly status: "restored"; readonly progress: GuidedLessonProgress }
  | {
      readonly status: "reset";
      readonly reason: GuidedProgressResetReason;
      readonly progress: GuidedLessonProgress;
    };

export interface SaveGuidedCheckpointInput {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly sourceFingerprint: string;
}

export interface GuidedLessonController {
  readonly definition: GuidedLessonDefinition;
  getProgress(): GuidedLessonProgress;
  recordEvidence(event: LearningEvidenceEvent): GuidedEvidenceResult;
  canAdvance(): boolean;
  next(): GuidedLessonProgress;
  saveCheckpoint(input: SaveGuidedCheckpointInput): GuidedLessonProgress;
  resetCurrentMission(sourceFingerprint?: string): GuidedLessonProgress;
  exit(): GuidedLessonProgress;
  resume(): GuidedLessonProgress;
  serialize(): string;
}

export interface GuidedLessonControllerOptions {
  readonly definition: GuidedLessonDefinition;
  readonly progress: GuidedLessonProgress;
  readonly onChange?: ((progress: GuidedLessonProgress) => void) | undefined;
}

export function defineGuidedLesson(definition: GuidedLessonDefinition): GuidedLessonDefinition {
  validateDefinition(definition);
  return freezeDefinition(definition);
}

export function createGuidedLessonProgress(
  definition: GuidedLessonDefinition,
  context: GuidedLessonContext,
): GuidedLessonProgress {
  validateDefinition(definition);
  assertStableId(context.workspaceId, "workspaceId");
  assertFingerprint(context.sourceFingerprint);
  const mission = definition.missions[0];
  const stage = mission?.stages[0];
  if (mission === undefined || stage === undefined) throw new TypeError("课程至少需要一个任务阶段");
  return freezeProgress({
    schemaVersion: GUIDED_LESSON_PROGRESS_SCHEMA_VERSION,
    lessonId: definition.id,
    lessonVersion: definition.version,
    workspaceId: context.workspaceId,
    status: "active",
    currentMissionId: mission.id,
    currentStageId: stage.id,
    sourceFingerprint: context.sourceFingerprint,
    satisfiedRequirements: [],
    completedStageIds: [],
    completedMissionIds: [],
    checkpoints: [],
  });
}

export function recordGuidedLessonEvidence(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
  event: LearningEvidenceEvent,
): GuidedEvidenceResult {
  const current = normalizeProgress(progress, definition);
  assertEvidenceEvent(event);
  if (current.status !== "active") return rejected(current, "inactive");
  if (
    event.binding.lessonId !== definition.id ||
    event.binding.lessonVersion !== definition.version
  ) {
    return rejected(current, "lesson-mismatch");
  }
  if (event.binding.workspaceId !== current.workspaceId) {
    return rejected(current, "workspace-mismatch");
  }
  if (!validScenarioTuple(event.binding)) {
    return rejected(current, "scenario-binding-invalid");
  }
  if (event.type === "source-changed") {
    if (
      event.previousSourceFingerprint !== current.sourceFingerprint ||
      event.binding.sourceFingerprint === current.sourceFingerprint
    ) {
      return rejected(current, "invalid-source-change");
    }
    return Object.freeze({
      status: "accepted",
      progress: freezeProgress({
        ...current,
        sourceFingerprint: event.binding.sourceFingerprint,
        satisfiedRequirements: [],
      }),
      matchedRequirementIds: Object.freeze([]),
      stageAdvanced: false,
    });
  }
  if (event.binding.sourceFingerprint !== current.sourceFingerprint) {
    return rejected(current, "source-mismatch");
  }

  const stage = currentStage(definition, current);
  const already = new Set(current.satisfiedRequirements.map((item) => item.requirementId));
  const matching = stage.requirements.filter(
    (requirement) => !already.has(requirement.id) && requirementMatches(requirement, event),
  );
  if (matching.length === 0) {
    const duplicate = stage.requirements.some(
      (requirement) => already.has(requirement.id) && requirementMatches(requirement, event),
    );
    return rejected(current, duplicate ? "duplicate" : "no-requirement-match");
  }

  const additions = matching.map((requirement) => satisfaction(requirement, event));
  const withEvidence = freezeProgress({
    ...current,
    satisfiedRequirements: [...current.satisfiedRequirements, ...additions],
  });
  const advanced = advanceCompletedIntermediateStage(definition, withEvidence);
  return Object.freeze({
    status: "accepted",
    progress: advanced,
    matchedRequirementIds: Object.freeze(matching.map((requirement) => requirement.id)),
    stageAdvanced: advanced.currentStageId !== withEvidence.currentStageId,
  });
}

export function canAdvanceGuidedLesson(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
): boolean {
  const current = normalizeProgress(progress, definition);
  if (current.status !== "active") return false;
  const stage = currentStage(definition, current);
  const mission = currentMission(definition, current);
  if (mission.stages.at(-1)?.id !== stage.id) return false;
  const satisfied = new Set(current.satisfiedRequirements.map((item) => item.requirementId));
  return stage.requirements.every((requirement) => satisfied.has(requirement.id));
}

export function advanceGuidedLesson(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
): GuidedLessonProgress {
  const current = normalizeProgress(progress, definition);
  if (!canAdvanceGuidedLesson(definition, current)) {
    throw new Error("当前任务的真实验收条件尚未全部满足");
  }
  const missionIndex = definition.missions.findIndex(
    (mission) => mission.id === current.currentMissionId,
  );
  const mission = definition.missions[missionIndex];
  const stage = currentStage(definition, current);
  if (mission === undefined) throw new TypeError("课程进度指向未知任务");
  const completedStageIds = [...current.completedStageIds, stage.id];
  const completedMissionIds = [...current.completedMissionIds, mission.id];
  const next = definition.missions[missionIndex + 1];
  if (next === undefined) {
    return freezeProgress({
      ...current,
      status: "completed",
      completedStageIds,
      completedMissionIds,
      satisfiedRequirements: [],
    });
  }
  const firstStage = next.stages[0];
  if (firstStage === undefined) throw new TypeError("课程任务缺少阶段");
  return freezeProgress({
    ...current,
    currentMissionId: next.id,
    currentStageId: firstStage.id,
    completedStageIds,
    completedMissionIds,
    satisfiedRequirements: [],
  });
}

export function saveGuidedLessonCheckpoint(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
  input: SaveGuidedCheckpointInput,
): GuidedLessonProgress {
  const current = normalizeProgress(progress, definition);
  if (current.status !== "active") throw new Error("非活动课程不能保存检查点");
  assertStableId(input.id, "checkpoint.id");
  assertText(input.label, "checkpoint.label");
  assertSource(input.source);
  assertFingerprint(input.sourceFingerprint);
  if (
    input.sourceFingerprint !== current.sourceFingerprint ||
    fingerprintSource(input.source) !== input.sourceFingerprint
  ) {
    throw new Error("检查点源码与当前源码指纹不一致");
  }
  const checkpoint = Object.freeze({
    id: input.id,
    missionId: current.currentMissionId,
    label: input.label,
    sourceFingerprint: input.sourceFingerprint,
    source: input.source,
  });
  const withoutSameId = current.checkpoints.filter((item) => item.id !== checkpoint.id);
  return freezeProgress({
    ...current,
    checkpoints: [...withoutSameId, checkpoint].slice(-MAX_CHECKPOINTS),
  });
}

export function getGuidedLessonCheckpoint(
  progress: GuidedLessonProgress,
  checkpointId: string,
): GuidedSourceCheckpoint | null {
  return progress.checkpoints.find((item) => item.id === checkpointId) ?? null;
}

export function resetCurrentGuidedMission(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
  sourceFingerprint = progress.sourceFingerprint,
): GuidedLessonProgress {
  const current = normalizeProgress(progress, definition);
  if (current.status === "completed") return current;
  assertFingerprint(sourceFingerprint);
  const mission = currentMission(definition, current);
  const firstStage = mission.stages[0];
  if (firstStage === undefined) throw new TypeError("课程任务缺少阶段");
  const stageIds = new Set(mission.stages.map((stage) => stage.id));
  return freezeProgress({
    ...current,
    status: "active",
    currentStageId: firstStage.id,
    sourceFingerprint,
    satisfiedRequirements: [],
    completedStageIds: current.completedStageIds.filter((id) => !stageIds.has(id)),
  });
}

export function exitGuidedLesson(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
): GuidedLessonProgress {
  const current = normalizeProgress(progress, definition);
  if (current.status === "completed") return current;
  return freezeProgress({ ...current, status: "exited" });
}

export function resumeGuidedLesson(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
): GuidedLessonProgress {
  const current = normalizeProgress(progress, definition);
  if (current.status !== "exited") return current;
  return freezeProgress({ ...current, status: "active" });
}

export function serializeGuidedLessonProgress(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
): string {
  return JSON.stringify(normalizeProgress(progress, definition));
}

export function deserializeGuidedLessonProgress(
  serialized: string | null | undefined,
  definition: GuidedLessonDefinition,
  context: GuidedLessonContext,
): GuidedProgressReadResult {
  const fresh = createGuidedLessonProgress(definition, context);
  if (serialized === null || serialized === undefined || serialized.trim().length === 0) {
    return resetRead("missing", fresh);
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return resetRead("invalid-json", fresh);
  }
  if (!isRecord(value)) return resetRead("corrupted", fresh);
  if (value.schemaVersion !== GUIDED_LESSON_PROGRESS_SCHEMA_VERSION) {
    return resetRead("unsupported-version", fresh);
  }
  if (value.lessonId !== definition.id || value.lessonVersion !== definition.version) {
    return resetRead("lesson-version-mismatch", fresh);
  }
  if (value.workspaceId !== context.workspaceId) return resetRead("workspace-mismatch", fresh);
  if (value.sourceFingerprint !== context.sourceFingerprint)
    return resetRead("source-mismatch", fresh);
  try {
    const progress = normalizeProgress(value, definition);
    return Object.freeze({ status: "restored", progress });
  } catch {
    return resetRead("corrupted", fresh);
  }
}

export function createGuidedLessonController(
  options: GuidedLessonControllerOptions,
): GuidedLessonController {
  const definition = defineGuidedLesson(options.definition);
  let progress = normalizeProgress(options.progress, definition);
  const commit = (next: GuidedLessonProgress): GuidedLessonProgress => {
    if (next !== progress) {
      progress = next;
      options.onChange?.(progress);
    }
    return progress;
  };
  return Object.freeze({
    definition,
    getProgress: () => progress,
    recordEvidence(event: LearningEvidenceEvent): GuidedEvidenceResult {
      const result = recordGuidedLessonEvidence(definition, progress, event);
      if (result.status === "accepted") commit(result.progress);
      return result;
    },
    canAdvance: () => canAdvanceGuidedLesson(definition, progress),
    next: () => commit(advanceGuidedLesson(definition, progress)),
    saveCheckpoint: (input: SaveGuidedCheckpointInput) =>
      commit(saveGuidedLessonCheckpoint(definition, progress, input)),
    resetCurrentMission: (fingerprint?: string) =>
      commit(resetCurrentGuidedMission(definition, progress, fingerprint)),
    exit: () => commit(exitGuidedLesson(definition, progress)),
    resume: () => commit(resumeGuidedLesson(definition, progress)),
    serialize: () => serializeGuidedLessonProgress(definition, progress),
  });
}

function advanceCompletedIntermediateStage(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
): GuidedLessonProgress {
  const mission = currentMission(definition, progress);
  const stageIndex = mission.stages.findIndex((stage) => stage.id === progress.currentStageId);
  const stage = mission.stages[stageIndex];
  const next = mission.stages[stageIndex + 1];
  if (stage === undefined || next === undefined) return progress;
  const satisfied = new Set(progress.satisfiedRequirements.map((item) => item.requirementId));
  if (!stage.requirements.every((requirement) => satisfied.has(requirement.id))) return progress;
  return freezeProgress({
    ...progress,
    currentStageId: next.id,
    completedStageIds: [...progress.completedStageIds, stage.id],
    satisfiedRequirements: [],
  });
}

function requirementMatches(
  requirement: GuidedRequirement,
  event: Exclude<LearningEvidenceEvent, { readonly type: "source-changed" }>,
): boolean {
  switch (requirement.kind) {
    case "workspace-opened":
      return event.type === "workspace-opened" && event.tutorialOwned === requirement.tutorialOwned;
    case "projection-ready":
      return (
        event.type === "projection-ready" &&
        event.completeness === requirement.completeness &&
        (!requirement.requireLosslessRoundTrip || event.roundTripLossless)
      );
    case "source-verified":
      return (
        event.type === "source-verified" &&
        (requirement.expectedSourceFingerprint === null ||
          event.binding.sourceFingerprint === requirement.expectedSourceFingerprint) &&
        event.profile === requirement.profile &&
        event.exactDiff === requirement.exactDiff &&
        (!requirement.requireReparse || event.reparsed) &&
        (!requirement.requireLosslessRoundTrip || event.roundTripLossless) &&
        (!requirement.requireCompleteCfg || event.cfgComplete) &&
        (!requirement.requireLinearScan || event.linearScan)
      );
    case "preset-inserted":
      return (
        event.type === "preset-inserted" &&
        event.presetId === requirement.presetId &&
        event.committed
      );
    case "connection-committed":
      return (
        event.type === "connection-committed" &&
        event.presetId === requirement.presetId &&
        event.cfgAccepted
      );
    case "real-run":
      return (
        event.type === "real-run" &&
        event.mode === "real" &&
        event.binding.scenarioId === requirement.scenarioId &&
        event.binding.scenarioVersion === requirement.scenarioVersion &&
        (requirement.expectedSourceFingerprint === null ||
          event.binding.sourceFingerprint === requirement.expectedSourceFingerprint) &&
        event.caseId === requirement.caseId &&
        event.ok &&
        event.exitCode === 0 &&
        event.termination === "process-exit" &&
        event.stdout === requirement.expectedStdout &&
        event.historyDisposition === requirement.historyDisposition
      );
    case "real-trace":
      return (
        event.type === "trace-completed" &&
        event.mode === "real" &&
        event.binding.scenarioId === requirement.scenarioId &&
        event.binding.scenarioVersion === requirement.scenarioVersion &&
        event.binding.sourceFingerprint === requirement.expectedSourceFingerprint &&
        event.caseId === requirement.caseId &&
        event.mapped &&
        (requirement.allowTruncated || !event.truncated) &&
        requirement.requiredOutcomes.every((outcome) =>
          event.visitedBranches.some(
            (branch) => branch.role === requirement.branchRole && branch.outcome === outcome,
          ),
        )
      );
    case "benchmark-series":
      return (
        event.type === "benchmark-completed" &&
        event.binding.scenarioId === requirement.scenarioId &&
        event.binding.scenarioVersion === requirement.scenarioVersion &&
        event.binding.sourceFingerprint === requirement.expectedSourceFingerprint &&
        event.repetitions >= requirement.minRepetitions &&
        requirement.sizes.every((size) => event.sizes.includes(size))
      );
    case "visualization-answer":
      return (
        event.type === "visualization-answer" &&
        event.visualizationId === requirement.visualizationId &&
        event.answerId === requirement.answerId
      );
  }
}

function satisfaction(
  requirement: GuidedRequirement,
  event: Exclude<LearningEvidenceEvent, { readonly type: "source-changed" }>,
): GuidedRequirementSatisfaction {
  const caseId = "caseId" in event ? event.caseId : null;
  return Object.freeze({
    requirementId: requirement.id,
    eventType: event.type,
    binding: freezeBinding(event.binding),
    caseId,
  });
}

function currentMission(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
): GuidedMissionDefinition {
  const mission = definition.missions.find((item) => item.id === progress.currentMissionId);
  if (mission === undefined) throw new TypeError("课程进度指向未知任务");
  return mission;
}

function currentStage(
  definition: GuidedLessonDefinition,
  progress: GuidedLessonProgress,
): GuidedMissionStageDefinition {
  const stage = currentMission(definition, progress).stages.find(
    (item) => item.id === progress.currentStageId,
  );
  if (stage === undefined) throw new TypeError("课程进度指向未知阶段");
  return stage;
}

function normalizeProgress(
  value: unknown,
  definition: GuidedLessonDefinition,
): GuidedLessonProgress {
  if (!isRecord(value)) throw new TypeError("课程进度必须是对象");
  assertExactKeys(value, [
    "schemaVersion",
    "lessonId",
    "lessonVersion",
    "workspaceId",
    "status",
    "currentMissionId",
    "currentStageId",
    "sourceFingerprint",
    "satisfiedRequirements",
    "completedStageIds",
    "completedMissionIds",
    "checkpoints",
  ]);
  if (value.schemaVersion !== GUIDED_LESSON_PROGRESS_SCHEMA_VERSION) {
    throw new TypeError("课程进度 schemaVersion 不受支持");
  }
  if (value.lessonId !== definition.id || value.lessonVersion !== definition.version) {
    throw new TypeError("课程进度与课程定义不匹配");
  }
  const workspaceId = assertStableId(value.workspaceId, "workspaceId");
  const sourceFingerprint = assertFingerprint(value.sourceFingerprint);
  const status = assertOneOf(value.status, ["active", "completed", "exited"] as const, "status");
  const currentMissionId = assertStableId(value.currentMissionId, "currentMissionId");
  const currentStageId = assertStableId(value.currentStageId, "currentStageId");
  const satisfiedRequirements = normalizeSatisfactions(value.satisfiedRequirements);
  const completedStageIds = normalizeIdArray(value.completedStageIds, "completedStageIds");
  const completedMissionIds = normalizeIdArray(value.completedMissionIds, "completedMissionIds");
  const checkpoints = normalizeCheckpoints(value.checkpoints, definition);
  const normalized = freezeProgress({
    schemaVersion: GUIDED_LESSON_PROGRESS_SCHEMA_VERSION,
    lessonId: definition.id,
    lessonVersion: definition.version,
    workspaceId,
    status,
    currentMissionId,
    currentStageId,
    sourceFingerprint,
    satisfiedRequirements,
    completedStageIds,
    completedMissionIds,
    checkpoints,
  });
  validateProgressSequence(normalized, definition);
  return normalized;
}

function validateProgressSequence(
  progress: GuidedLessonProgress,
  definition: GuidedLessonDefinition,
): void {
  const missionIndex = definition.missions.findIndex(
    (mission) => mission.id === progress.currentMissionId,
  );
  if (missionIndex < 0) throw new TypeError("currentMissionId 无效");
  const mission = definition.missions[missionIndex]!;
  const stageIndex = mission.stages.findIndex((stage) => stage.id === progress.currentStageId);
  if (stageIndex < 0) throw new TypeError("currentStageId 无效");
  const expectedMissions = definition.missions.slice(0, missionIndex).map((item) => item.id);
  if (progress.status === "completed") expectedMissions.push(mission.id);
  if (!sameArray(progress.completedMissionIds, expectedMissions)) {
    throw new TypeError("completedMissionIds 不是合法前缀");
  }
  const expectedStages = definition.missions
    .slice(0, missionIndex)
    .flatMap((item) => item.stages.map((stage) => stage.id));
  expectedStages.push(...mission.stages.slice(0, stageIndex).map((stage) => stage.id));
  if (progress.status === "completed") expectedStages.push(mission.stages[stageIndex]!.id);
  if (!sameArray(progress.completedStageIds, expectedStages)) {
    throw new TypeError("completedStageIds 不是合法前缀");
  }
  const currentRequirements = mission.stages[stageIndex]!.requirements;
  const requirementById = new Map(currentRequirements.map((item) => [item.id, item]));
  const currentRequirementIds = new Set(requirementById.keys());
  const satisfactionIds = progress.satisfiedRequirements.map((item) => item.requirementId);
  if (
    new Set(satisfactionIds).size !== satisfactionIds.length ||
    satisfactionIds.some((id) => !currentRequirementIds.has(id))
  ) {
    throw new TypeError("satisfiedRequirements 不属于当前阶段");
  }
  for (const item of progress.satisfiedRequirements) {
    if (
      item.binding.lessonId !== definition.id ||
      item.binding.lessonVersion !== definition.version ||
      item.binding.workspaceId !== progress.workspaceId ||
      item.binding.sourceFingerprint !== progress.sourceFingerprint
    ) {
      throw new TypeError("已满足条件的证据绑定已失效");
    }
    const requirement = requirementById.get(item.requirementId);
    if (requirement === undefined || !satisfactionMatchesRequirement(item, requirement)) {
      throw new TypeError("已满足条件与课程验收类型不一致");
    }
  }
  if (progress.status === "completed") {
    if (
      missionIndex !== definition.missions.length - 1 ||
      stageIndex !== mission.stages.length - 1 ||
      progress.satisfiedRequirements.length > 0
    ) {
      throw new TypeError("completed 进度结构无效");
    }
  }
}

function satisfactionMatchesRequirement(
  satisfaction: GuidedRequirementSatisfaction,
  requirement: GuidedRequirement,
): boolean {
  switch (requirement.kind) {
    case "workspace-opened":
      return (
        satisfaction.eventType === "workspace-opened" &&
        satisfaction.binding.scenarioId === null &&
        satisfaction.caseId === null
      );
    case "projection-ready":
      return (
        satisfaction.eventType === "projection-ready" &&
        satisfaction.binding.scenarioId === null &&
        satisfaction.caseId === null
      );
    case "source-verified":
      return (
        satisfaction.eventType === "source-verified" &&
        (requirement.expectedSourceFingerprint === null ||
          satisfaction.binding.sourceFingerprint === requirement.expectedSourceFingerprint) &&
        satisfaction.binding.scenarioId === null &&
        satisfaction.caseId === null
      );
    case "preset-inserted":
      return (
        satisfaction.eventType === "preset-inserted" &&
        satisfaction.binding.scenarioId === null &&
        satisfaction.caseId === null
      );
    case "connection-committed":
      return (
        satisfaction.eventType === "connection-committed" &&
        satisfaction.binding.scenarioId === null &&
        satisfaction.caseId === null
      );
    case "real-run":
      return (
        satisfaction.eventType === "real-run" &&
        (requirement.expectedSourceFingerprint === null ||
          satisfaction.binding.sourceFingerprint === requirement.expectedSourceFingerprint) &&
        satisfaction.binding.scenarioId === requirement.scenarioId &&
        satisfaction.binding.scenarioVersion === requirement.scenarioVersion &&
        satisfaction.caseId === requirement.caseId
      );
    case "real-trace":
      return (
        satisfaction.eventType === "trace-completed" &&
        satisfaction.binding.sourceFingerprint === requirement.expectedSourceFingerprint &&
        satisfaction.binding.scenarioId === requirement.scenarioId &&
        satisfaction.binding.scenarioVersion === requirement.scenarioVersion &&
        satisfaction.caseId === requirement.caseId
      );
    case "benchmark-series":
      return (
        satisfaction.eventType === "benchmark-completed" &&
        satisfaction.binding.sourceFingerprint === requirement.expectedSourceFingerprint &&
        satisfaction.binding.scenarioId === requirement.scenarioId &&
        satisfaction.binding.scenarioVersion === requirement.scenarioVersion &&
        satisfaction.caseId === null
      );
    case "visualization-answer":
      return (
        satisfaction.eventType === "visualization-answer" &&
        satisfaction.binding.scenarioId === null &&
        satisfaction.binding.scenarioVersion === null &&
        satisfaction.caseId === null
      );
  }
}

function normalizeSatisfactions(value: unknown): readonly GuidedRequirementSatisfaction[] {
  if (!Array.isArray(value) || value.length > 64) throw new TypeError("验收证据数量无效");
  return Object.freeze(
    value.map((item) => {
      if (!isRecord(item)) throw new TypeError("验收证据必须是对象");
      assertExactKeys(item, ["requirementId", "eventType", "binding", "caseId"]);
      const eventType = assertOneOf(
        item.eventType,
        [
          "workspace-opened",
          "projection-ready",
          "source-verified",
          "preset-inserted",
          "connection-committed",
          "real-run",
          "trace-completed",
          "benchmark-completed",
          "visualization-answer",
        ] as const,
        "eventType",
      );
      if (item.caseId !== null) assertStableId(item.caseId, "caseId");
      return Object.freeze({
        requirementId: assertStableId(item.requirementId, "requirementId"),
        eventType,
        binding: normalizeBinding(item.binding),
        caseId: item.caseId as string | null,
      });
    }),
  );
}

function normalizeCheckpoints(
  value: unknown,
  definition: GuidedLessonDefinition,
): readonly GuidedSourceCheckpoint[] {
  if (!Array.isArray(value) || value.length > MAX_CHECKPOINTS) {
    throw new TypeError("课程检查点数量无效");
  }
  const missionIds = new Set(definition.missions.map((mission) => mission.id));
  const ids = new Set<string>();
  return Object.freeze(
    value.map((item) => {
      if (!isRecord(item)) throw new TypeError("课程检查点必须是对象");
      assertExactKeys(item, ["id", "missionId", "label", "sourceFingerprint", "source"]);
      const id = assertStableId(item.id, "checkpoint.id");
      if (ids.has(id)) throw new TypeError("课程检查点 id 重复");
      ids.add(id);
      const missionId = assertStableId(item.missionId, "checkpoint.missionId");
      if (!missionIds.has(missionId)) throw new TypeError("课程检查点任务无效");
      const source = assertSource(item.source);
      const sourceFingerprint = assertFingerprint(item.sourceFingerprint);
      if (fingerprintSource(source) !== sourceFingerprint)
        throw new TypeError("课程检查点指纹无效");
      return Object.freeze({
        id,
        missionId,
        label: assertText(item.label, "checkpoint.label"),
        sourceFingerprint,
        source,
      });
    }),
  );
}

function normalizeBinding(value: unknown): LearningEvidenceBinding {
  if (!isRecord(value)) throw new TypeError("证据绑定必须是对象");
  assertExactKeys(value, [
    "lessonId",
    "lessonVersion",
    "workspaceId",
    "sourceFingerprint",
    "scenarioId",
    "scenarioVersion",
  ]);
  const binding = {
    lessonId: assertStableId(value.lessonId, "binding.lessonId"),
    lessonVersion: assertSemver(value.lessonVersion, "binding.lessonVersion"),
    workspaceId: assertStableId(value.workspaceId, "binding.workspaceId"),
    sourceFingerprint: assertFingerprint(value.sourceFingerprint),
    scenarioId:
      value.scenarioId === null ? null : assertStableId(value.scenarioId, "binding.scenarioId"),
    scenarioVersion:
      value.scenarioVersion === null
        ? null
        : assertSemver(value.scenarioVersion, "binding.scenarioVersion"),
  };
  if (!validScenarioTuple(binding))
    throw new TypeError("scenarioId 与 scenarioVersion 必须同时存在");
  return freezeBinding(binding);
}

function assertEvidenceEvent(event: LearningEvidenceEvent): void {
  if (!isRecord(event)) throw new TypeError("学习证据必须是对象");
  normalizeBinding(event.binding);
  if (!assertEvidenceScenarioPolicy(event)) throw new TypeError("学习证据的场景绑定无效");
  if (event.type === "trace-completed") {
    if (!Array.isArray(event.visitedBranches) || event.visitedBranches.length > 256) {
      throw new TypeError("Trace 分支证据无效");
    }
  }
  if (event.type === "benchmark-completed") {
    assertBenchmarkSizes(event.sizes, "benchmark.sizes");
    assertPositiveInteger(event.repetitions, "benchmark.repetitions");
  }
  if (event.type === "visualization-answer") {
    assertOneOf(
      event.visualizationId,
      ["trace-chart", "analysis-chart"] as const,
      "visualizationId",
    );
    assertStableId(event.answerId, "answerId");
  }
}

function assertEvidenceScenarioPolicy(event: LearningEvidenceEvent): boolean {
  const hasScenario = event.binding.scenarioId !== null;
  return event.type === "real-run" ||
    event.type === "trace-completed" ||
    event.type === "benchmark-completed"
    ? hasScenario
    : !hasScenario;
}

function validateDefinition(definition: GuidedLessonDefinition): void {
  assertStableId(definition.id, "lesson.id");
  assertSemver(definition.version, "lesson.version");
  assertText(definition.title, "lesson.title");
  assertText(definition.summary, "lesson.summary");
  assertSource(definition.initialSource);
  assertStableId(definition.initialScenarioId, "lesson.initialScenarioId");
  assertSemver(definition.initialScenarioVersion, "lesson.initialScenarioVersion");
  assertStableId(definition.initialCaseId, "lesson.initialCaseId");
  if (definition.missions.length === 0 || definition.missions.length > 16) {
    throw new TypeError("课程任务数量无效");
  }
  const ids = new Set<string>();
  for (const mission of definition.missions) {
    uniqueId(mission.id, ids, "mission.id");
    assertText(mission.title, "mission.title");
    assertText(mission.instruction, "mission.instruction");
    assertText(mission.why, "mission.why");
    assertStableId(mission.locateTargetId, "mission.locateTargetId");
    if (mission.hints.length !== 3) throw new TypeError("每个任务必须恰好提供三级提示");
    mission.hints.forEach((hint) => assertText(hint, "mission.hint"));
    if (mission.stages.length === 0 || mission.stages.length > 8) {
      throw new TypeError("任务阶段数量无效");
    }
    for (const stage of mission.stages) {
      uniqueId(stage.id, ids, "stage.id");
      assertText(stage.title, "stage.title");
      assertText(stage.instruction, "stage.instruction");
      if (stage.requirements.length === 0 || stage.requirements.length > 16) {
        throw new TypeError("阶段验收条件数量无效");
      }
      for (const requirement of stage.requirements) {
        uniqueId(requirement.id, ids, "requirement.id");
        assertText(requirement.label, "requirement.label");
        validateRequirement(requirement);
      }
    }
  }
}

function validateRequirement(requirement: GuidedRequirement): void {
  if (
    requirement.kind === "real-run" ||
    requirement.kind === "real-trace" ||
    requirement.kind === "benchmark-series"
  ) {
    assertStableId(requirement.scenarioId, "requirement.scenarioId");
    assertSemver(requirement.scenarioVersion, "requirement.scenarioVersion");
    if (requirement.kind !== "benchmark-series") {
      assertStableId(requirement.caseId, "requirement.caseId");
    }
    if (
      requirement.kind === "real-trace" ||
      requirement.kind === "benchmark-series" ||
      requirement.expectedSourceFingerprint !== null
    ) {
      assertFingerprint(requirement.expectedSourceFingerprint);
    }
  }
  if (requirement.kind === "source-verified") {
    if (requirement.expectedSourceFingerprint !== null) {
      assertFingerprint(requirement.expectedSourceFingerprint);
    }
  }
  if (requirement.kind === "real-run") {
    if (requirement.expectedStdout.length > MAX_TEXT_LENGTH) throw new TypeError("预期输出过长");
  }
  if (requirement.kind === "real-trace") {
    if (
      requirement.requiredOutcomes.length === 0 ||
      new Set(requirement.requiredOutcomes).size !== requirement.requiredOutcomes.length
    ) {
      throw new TypeError("Trace 必须声明不重复的分支结果");
    }
  }
  if (requirement.kind === "preset-inserted" || requirement.kind === "connection-committed") {
    assertStableId(requirement.presetId, "requirement.presetId");
  }
  if (requirement.kind === "benchmark-series") {
    assertBenchmarkSizes(requirement.sizes, "requirement.sizes");
    assertPositiveInteger(requirement.minRepetitions, "requirement.minRepetitions");
  }
  if (requirement.kind === "visualization-answer") {
    assertOneOf(
      requirement.visualizationId,
      ["trace-chart", "analysis-chart"] as const,
      "requirement.visualizationId",
    );
    assertStableId(requirement.answerId, "requirement.answerId");
  }
}

function freezeDefinition(definition: GuidedLessonDefinition): GuidedLessonDefinition {
  return Object.freeze({
    ...definition,
    missions: Object.freeze(
      definition.missions.map((mission) =>
        Object.freeze({
          ...mission,
          hints: Object.freeze([...mission.hints]) as readonly [string, string, string],
          stages: Object.freeze(
            mission.stages.map((stage) =>
              Object.freeze({
                ...stage,
                requirements: Object.freeze(
                  stage.requirements.map((requirement) =>
                    Object.freeze({
                      ...requirement,
                      ...(requirement.kind === "real-trace"
                        ? { requiredOutcomes: Object.freeze([...requirement.requiredOutcomes]) }
                        : {}),
                      ...(requirement.kind === "benchmark-series"
                        ? { sizes: Object.freeze([...requirement.sizes]) }
                        : {}),
                    }),
                  ),
                ),
              }),
            ),
          ),
        }),
      ),
    ),
  });
}

function freezeProgress(progress: GuidedLessonProgress): GuidedLessonProgress {
  return Object.freeze({
    ...progress,
    satisfiedRequirements: Object.freeze(
      progress.satisfiedRequirements.map((item) =>
        Object.freeze({ ...item, binding: freezeBinding(item.binding) }),
      ),
    ),
    completedStageIds: Object.freeze([...progress.completedStageIds]),
    completedMissionIds: Object.freeze([...progress.completedMissionIds]),
    checkpoints: Object.freeze(progress.checkpoints.map((item) => Object.freeze({ ...item }))),
  });
}

function freezeBinding(binding: LearningEvidenceBinding): LearningEvidenceBinding {
  return Object.freeze({ ...binding });
}

function resetRead(
  reason: GuidedProgressResetReason,
  progress: GuidedLessonProgress,
): GuidedProgressReadResult {
  return Object.freeze({ status: "reset", reason, progress });
}

function rejected(
  progress: GuidedLessonProgress,
  reason: GuidedEvidenceRejectionReason,
): GuidedEvidenceResult {
  return Object.freeze({ status: "rejected", progress, reason });
}

function normalizeIdArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 128) throw new TypeError(`${label} 无效`);
  const ids = value.map((item) => assertStableId(item, label));
  if (new Set(ids).size !== ids.length) throw new TypeError(`${label} 包含重复项`);
  return Object.freeze(ids);
}

function assertBenchmarkSizes(value: unknown, label: string): asserts value is readonly number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_BENCHMARK_SIZES) {
    throw new TypeError(`${label} 无效`);
  }
  if (
    value.some(
      (size) =>
        typeof size !== "number" ||
        !Number.isSafeInteger(size) ||
        size < 1 ||
        size > MAX_BENCHMARK_SIZE,
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new TypeError(`${label} 必须是不重复的正整数`);
  }
}

function assertPositiveInteger(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_BENCHMARK_REPETITIONS
  ) {
    throw new TypeError(`${label} 无效`);
  }
  return value;
}

function validScenarioTuple(value: GuidedLessonScenarioBinding): boolean {
  return (value.scenarioId === null) === (value.scenarioVersion === null);
}

function assertStableId(value: unknown, label: string): string {
  if (typeof value !== "string" || !STABLE_ID.test(value)) throw new TypeError(`${label} 无效`);
  return value;
}

function assertSemver(value: unknown, label: string): string {
  if (typeof value !== "string" || !SEMVER.test(value)) throw new TypeError(`${label} 无效`);
  return value;
}

function assertFingerprint(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) {
    throw new TypeError("sourceFingerprint 无效");
  }
  return value;
}

function assertText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TEXT_LENGTH) {
    throw new TypeError(`${label} 无效`);
  }
  return value;
}

function assertSource(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_SOURCE_LENGTH ||
    value.includes("\0")
  ) {
    throw new TypeError("课程源码无效");
  }
  return value;
}

function assertOneOf<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) throw new TypeError(`${label} 无效`);
  return value as T[number];
}

function uniqueId(value: unknown, ids: Set<string>, label: string): void {
  const id = assertStableId(value, label);
  if (ids.has(id)) throw new TypeError(`课程定义 id 重复：${id}`);
  ids.add(id);
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new TypeError("对象包含未知字段");
  if (keys.some((key) => !(key in value))) throw new TypeError("对象缺少必要字段");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
