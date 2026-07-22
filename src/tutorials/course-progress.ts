import {
  defineCourse,
  findCourseUnit,
  type CourseDefinition,
  type CourseEvidenceRequirement,
  type CourseEvidenceValue,
  type CourseStageDefinition,
  type CourseUnitDefinition,
} from "./course-model.js";

export const COURSE_PROGRESS_SCHEMA_VERSION = 1 as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FINGERPRINT = /^[A-Za-z0-9._:-]{1,256}$/u;
const MAX_UNITS = 2_048;
const MAX_EVIDENCE = 2_048;
const MAX_SERIALIZED_BYTES = 8 * 1024 * 1024;

export type CourseUnitStatus = "not-started" | "active" | "in-progress" | "mastered" | "skipped";

export interface CourseEvidenceBinding {
  readonly courseId: string;
  readonly courseVersion: string;
  readonly unitId: string;
  readonly unitVersion: string;
  readonly stageId: string;
  readonly workspaceId: string | null;
  readonly sourceFingerprint: string | null;
  readonly scenarioId: string | null;
  readonly scenarioVersion: string | null;
}

export interface CourseEvidenceEvent {
  readonly id: string;
  readonly type: string;
  readonly trusted: boolean;
  readonly binding: CourseEvidenceBinding;
  readonly values: Readonly<Record<string, CourseEvidenceValue>>;
}

export interface CourseRequirementSatisfaction {
  readonly requirementId: string;
  readonly evidenceId: string;
  readonly evidenceType: string;
  readonly trusted: boolean;
  readonly workspaceId: string | null;
  readonly sourceFingerprint: string | null;
}

export interface CourseStageEvidenceBinding {
  readonly workspaceId: string;
  readonly sourceFingerprint: string | null;
}

export interface CourseUnitProgress {
  readonly unitId: string;
  readonly unitVersion: string;
  readonly status: CourseUnitStatus;
  readonly currentStageId: string | null;
  readonly completedStageIds: readonly string[];
  readonly satisfactions: readonly CourseRequirementSatisfaction[];
  /** Locked by the first workspace-bound satisfaction in the active stage. */
  readonly stageEvidenceBinding: CourseStageEvidenceBinding | null;
  readonly attempts: number;
}

export interface CourseProgress {
  readonly schemaVersion: typeof COURSE_PROGRESS_SCHEMA_VERSION;
  readonly courseId: string;
  readonly courseVersion: string;
  readonly activeUnitId: string | null;
  readonly units: readonly CourseUnitProgress[];
}

export interface CourseCompletionSummary {
  readonly totalUnits: number;
  readonly masteredUnits: number;
  readonly skippedUnits: number;
  readonly inProgressUnits: number;
  readonly notStartedUnits: number;
  readonly masteryPercent: number;
  readonly visitedPercent: number;
  readonly allVisited: boolean;
  readonly fullyMastered: boolean;
  readonly knowledgePoints: readonly CourseKnowledgePointSummary[];
}

export interface CourseKnowledgePointSummary {
  readonly knowledgePointId: string;
  readonly totalUnits: number;
  readonly masteredUnits: number;
  readonly masteryPercent: number;
  readonly mastered: boolean;
}

export type CourseEvidenceRejectionReason =
  | "inactive"
  | "binding-mismatch"
  | "workspace-missing"
  | "source-missing"
  | "scenario-binding-invalid"
  | "untrusted"
  | "duplicate"
  | "no-requirement-match";

export type CourseEvidenceResult =
  | {
      readonly status: "accepted";
      readonly progress: CourseProgress;
      readonly matchedRequirementIds: readonly string[];
    }
  | {
      readonly status: "rejected";
      readonly progress: CourseProgress;
      readonly reason: CourseEvidenceRejectionReason;
    };

export type CourseProgressResetReason =
  | "missing"
  | "invalid-json"
  | "unsupported-version"
  | "course-mismatch"
  | "corrupted"
  | "storage-error";

export type CourseProgressMigrationReason = "schema-v0" | "course-version";

export type CourseProgressReadResult =
  | { readonly status: "restored"; readonly progress: CourseProgress }
  | {
      readonly status: "migrated";
      readonly reason: CourseProgressMigrationReason;
      readonly progress: CourseProgress;
    }
  | {
      readonly status: "reset";
      readonly reason: CourseProgressResetReason;
      readonly progress: CourseProgress;
    };

/** Renderer storage boundary. Implementations may use localStorage, IndexedDB or a test double. */
export interface CourseProgressStorageAdapter {
  read(courseId: string): Promise<string | null>;
  write(courseId: string, serialized: string): Promise<void>;
  remove(courseId: string): Promise<void>;
}

export interface CourseControllerOptions {
  readonly definition: CourseDefinition;
  readonly progress: CourseProgress;
  readonly onChange?: ((progress: CourseProgress) => void) | undefined;
}

export interface CourseController {
  readonly definition: CourseDefinition;
  getProgress(): CourseProgress;
  getSummary(): CourseCompletionSummary;
  startUnit(unitId: string): CourseProgress;
  recordEvidence(event: CourseEvidenceEvent): CourseEvidenceResult;
  canAdvanceStage(): boolean;
  advanceStage(): CourseProgress;
  skipUnit(unitId: string): CourseProgress;
  invalidateSourceEvidence(input: InvalidateCourseSourceEvidenceInput): CourseProgress;
  resetUnit(unitId: string): CourseProgress;
  resetCourse(): CourseProgress;
  serialize(): string;
}

export interface InvalidateCourseSourceEvidenceInput {
  readonly workspaceId: string;
  readonly previousSourceFingerprint: string;
  readonly nextSourceFingerprint: string;
}

export function createCourseProgress(definitionInput: CourseDefinition): CourseProgress {
  const definition = defineCourse(definitionInput);
  return freezeProgress({
    schemaVersion: COURSE_PROGRESS_SCHEMA_VERSION,
    courseId: definition.id,
    courseVersion: definition.version,
    activeUnitId: null,
    units: definition.units.map(freshUnitProgress),
  });
}

export function startCourseUnit(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
  unitId: string,
): CourseProgress {
  const definition = defineCourse(definitionInput);
  const progress = normalizeProgress(progressInput, definition);
  const unit = requireUnit(definition, unitId);
  const current = requireUnitProgress(progress, unit.id);
  if (current.status === "mastered") return progress;
  if (current.status === "active" && progress.activeUnitId === unit.id) return progress;
  const unmet = unit.prerequisiteUnitIds.filter(
    (id) => requireUnitProgress(progress, id).status !== "mastered",
  );
  if (unmet.length > 0) throw new Error(`单元 ${unit.id} 的先修单元尚未掌握：${unmet.join(", ")}`);

  const units = progress.units.map((item) => {
    if (item.unitId === unit.id) {
      return freezeUnitProgress({
        ...item,
        status: "active",
        currentStageId: item.currentStageId ?? unit.stages[0]!.id,
        attempts: item.attempts + 1,
      });
    }
    return item.status === "active" ? freezeUnitProgress({ ...item, status: "in-progress" }) : item;
  });
  return freezeProgress({ ...progress, activeUnitId: unit.id, units });
}

export function recordCourseEvidence(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
  eventInput: CourseEvidenceEvent,
): CourseEvidenceResult {
  const definition = defineCourse(definitionInput);
  const progress = normalizeProgress(progressInput, definition);
  const event = freezeEvidenceEvent(eventInput);
  const active = activeContext(definition, progress);
  if (active === null) return rejected(progress, "inactive");
  if (!bindingMatches(event.binding, definition, active.unit, active.stage)) {
    return rejected(progress, "binding-mismatch");
  }
  if (!validScenarioTuple(event.binding)) return rejected(progress, "scenario-binding-invalid");

  const existingRequirementIds = new Set(
    active.progress.satisfactions.map((item) => item.requirementId),
  );
  const duplicateEvidence = active.progress.satisfactions.some(
    (item) => item.evidenceId === event.id,
  );
  if (duplicateEvidence) return rejected(progress, "duplicate");

  let bindingFailure: CourseEvidenceRejectionReason | null = null;
  const matching = active.stage.requirements.filter((requirement) => {
    if (existingRequirementIds.has(requirement.id)) return false;
    if (requirement.evidenceType !== event.type) return false;
    if (requirement.trust === "verified" && !event.trusted) {
      bindingFailure ??= "untrusted";
      return false;
    }
    if (requirement.binding !== "stage" && event.binding.workspaceId === null) {
      bindingFailure ??= "workspace-missing";
      return false;
    }
    if (requirement.binding === "workspace-source" && event.binding.sourceFingerprint === null) {
      bindingFailure ??= "source-missing";
      return false;
    }
    if (
      requirement.binding !== "stage" &&
      !stageBindingAccepts(
        active.progress.stageEvidenceBinding,
        event.binding.workspaceId,
        event.binding.sourceFingerprint,
      )
    ) {
      bindingFailure ??= "binding-mismatch";
      return false;
    }
    return requirementExpectationsMatch(requirement, event.values);
  });
  if (matching.length === 0) {
    const duplicateRequirement = active.stage.requirements.some(
      (requirement) =>
        existingRequirementIds.has(requirement.id) &&
        requirement.evidenceType === event.type &&
        requirementExpectationsMatch(requirement, event.values),
    );
    return rejected(
      progress,
      duplicateRequirement ? "duplicate" : (bindingFailure ?? "no-requirement-match"),
    );
  }

  const additions = matching.map((requirement) =>
    freezeSatisfaction({
      requirementId: requirement.id,
      evidenceId: event.id,
      evidenceType: event.type,
      trusted: event.trusted,
      workspaceId: event.binding.workspaceId,
      sourceFingerprint: event.binding.sourceFingerprint,
    }),
  );
  const matchedWorkspaceRequirement = matching.find(
    (requirement) => requirement.binding !== "stage",
  );
  const stageEvidenceBinding =
    matchedWorkspaceRequirement === undefined
      ? active.progress.stageEvidenceBinding
      : mergeStageEvidenceBinding(active.progress.stageEvidenceBinding, event.binding);
  const nextUnit = freezeUnitProgress({
    ...active.progress,
    satisfactions: [...active.progress.satisfactions, ...additions],
    stageEvidenceBinding,
  });
  const next = replaceUnitProgress(progress, nextUnit);
  return Object.freeze({
    status: "accepted",
    progress: next,
    matchedRequirementIds: Object.freeze(matching.map((requirement) => requirement.id)),
  });
}

export function canAdvanceCourseStage(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
): boolean {
  const definition = defineCourse(definitionInput);
  const progress = normalizeProgress(progressInput, definition);
  const active = activeContext(definition, progress);
  if (active === null) return false;
  const satisfied = new Set(active.progress.satisfactions.map((item) => item.requirementId));
  return active.stage.requirements.every((requirement) => satisfied.has(requirement.id));
}

export function advanceCourseStage(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
): CourseProgress {
  const definition = defineCourse(definitionInput);
  const progress = normalizeProgress(progressInput, definition);
  const active = activeContext(definition, progress);
  if (active === null) throw new Error("没有活动课程单元");
  if (!canAdvanceCourseStage(definition, progress)) {
    throw new Error("当前阶段的证据验收条件尚未全部满足");
  }
  const stageIndex = active.unit.stages.findIndex((stage) => stage.id === active.stage.id);
  const nextStage = active.unit.stages[stageIndex + 1];
  const completedStageIds = Object.freeze([...active.progress.completedStageIds, active.stage.id]);
  if (nextStage !== undefined) {
    return replaceUnitProgress(
      progress,
      freezeUnitProgress({
        ...active.progress,
        currentStageId: nextStage.id,
        completedStageIds,
        satisfactions: [],
        stageEvidenceBinding: null,
      }),
    );
  }
  const mastered = replaceUnitProgress(
    progress,
    freezeUnitProgress({
      ...active.progress,
      status: "mastered",
      currentStageId: null,
      completedStageIds,
      satisfactions: [],
      stageEvidenceBinding: null,
    }),
  );
  return freezeProgress({ ...mastered, activeUnitId: null });
}

/** Skipping is traversal only. It can never add completed stages or mark a unit mastered. */
export function skipCourseUnit(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
  unitId: string,
): CourseProgress {
  const definition = defineCourse(definitionInput);
  const progress = normalizeProgress(progressInput, definition);
  requireUnit(definition, unitId);
  const unitProgress = requireUnitProgress(progress, unitId);
  if (unitProgress.status === "mastered") return progress;
  const next = replaceUnitProgress(
    progress,
    freezeUnitProgress({ ...unitProgress, status: "skipped" }),
  );
  return progress.activeUnitId === unitId ? freezeProgress({ ...next, activeUnitId: null }) : next;
}

export function invalidateCourseSourceEvidence(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
  input: InvalidateCourseSourceEvidenceInput,
): CourseProgress {
  const definition = defineCourse(definitionInput);
  const progress = normalizeProgress(progressInput, definition);
  assertStableId(input.workspaceId, "workspaceId");
  assertFingerprint(input.previousSourceFingerprint, "previousSourceFingerprint");
  assertFingerprint(input.nextSourceFingerprint, "nextSourceFingerprint");
  if (input.previousSourceFingerprint === input.nextSourceFingerprint) {
    throw new Error("源码变化必须产生不同指纹");
  }
  const active = activeContext(definition, progress);
  if (active === null) return progress;
  const retained = active.progress.satisfactions.filter(
    (item) =>
      item.workspaceId !== input.workspaceId ||
      item.sourceFingerprint !== input.previousSourceFingerprint,
  );
  if (retained.length === active.progress.satisfactions.length) return progress;
  return replaceUnitProgress(
    progress,
    freezeUnitProgress({
      ...active.progress,
      satisfactions: retained,
      stageEvidenceBinding: bindingFromSatisfactions(retained),
    }),
  );
}

export function resetCourseUnit(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
  unitId: string,
): CourseProgress {
  const definition = defineCourse(definitionInput);
  const progress = normalizeProgress(progressInput, definition);
  const unit = requireUnit(definition, unitId);
  const next = replaceUnitProgress(progress, freshUnitProgress(unit));
  return progress.activeUnitId === unitId ? freezeProgress({ ...next, activeUnitId: null }) : next;
}

export function resetCourseProgress(definitionInput: CourseDefinition): CourseProgress {
  return createCourseProgress(definitionInput);
}

export function summarizeCourseProgress(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
): CourseCompletionSummary {
  const definition = defineCourse(definitionInput);
  const progress = normalizeProgress(progressInput, definition);
  const masteredUnits = countStatus(progress, "mastered");
  const skippedUnits = countStatus(progress, "skipped");
  const inProgressUnits = countStatus(progress, "active") + countStatus(progress, "in-progress");
  const notStartedUnits = countStatus(progress, "not-started");
  const totalUnits = progress.units.length;
  const visitedUnits = totalUnits - notStartedUnits;
  const knowledgePoints = Object.freeze(
    definition.knowledgePoints.map((point) => {
      const relatedUnits = definition.units.filter((unit) =>
        unit.knowledgePointIds.includes(point.id),
      );
      const relatedIds = new Set(relatedUnits.map((unit) => unit.id));
      const relatedMastered = progress.units.filter(
        (unit) => relatedIds.has(unit.unitId) && unit.status === "mastered",
      ).length;
      return Object.freeze({
        knowledgePointId: point.id,
        totalUnits: relatedUnits.length,
        masteredUnits: relatedMastered,
        masteryPercent: percent(relatedMastered, relatedUnits.length),
        mastered: relatedUnits.length > 0 && relatedMastered === relatedUnits.length,
      });
    }),
  );
  return Object.freeze({
    totalUnits,
    masteredUnits,
    skippedUnits,
    inProgressUnits,
    notStartedUnits,
    masteryPercent: percent(masteredUnits, totalUnits),
    visitedPercent: percent(visitedUnits, totalUnits),
    allVisited: visitedUnits === totalUnits,
    fullyMastered: masteredUnits === totalUnits,
    knowledgePoints,
  });
}

export function serializeCourseProgress(
  definitionInput: CourseDefinition,
  progressInput: CourseProgress,
): string {
  const definition = defineCourse(definitionInput);
  return JSON.stringify(normalizeProgress(progressInput, definition));
}

export function deserializeCourseProgress(
  serialized: string | null | undefined,
  definitionInput: CourseDefinition,
): CourseProgressReadResult {
  const definition = defineCourse(definitionInput);
  const fresh = createCourseProgress(definition);
  if (serialized === null || serialized === undefined || serialized.trim().length === 0) {
    return resetRead("missing", fresh);
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_SERIALIZED_BYTES) {
    return resetRead("corrupted", fresh);
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return resetRead("invalid-json", fresh);
  }
  if (!isRecord(value)) return resetRead("corrupted", fresh);
  if (value.courseId !== definition.id) return resetRead("course-mismatch", fresh);
  if (value.schemaVersion === 0) {
    try {
      return Object.freeze({
        status: "migrated",
        reason: "schema-v0",
        progress: migrateLegacyProgress(value, definition),
      });
    } catch {
      return resetRead("corrupted", fresh);
    }
  }
  if (value.schemaVersion !== COURSE_PROGRESS_SCHEMA_VERSION) {
    return resetRead("unsupported-version", fresh);
  }
  try {
    if (value.courseVersion !== definition.version) {
      return Object.freeze({
        status: "migrated",
        reason: "course-version",
        progress: rebaseProgressForCourseVersion(value, definition),
      });
    }
    return Object.freeze({ status: "restored", progress: normalizeProgress(value, definition) });
  } catch {
    return resetRead("corrupted", fresh);
  }
}

export async function readCourseProgress(
  storage: CourseProgressStorageAdapter,
  definition: CourseDefinition,
): Promise<CourseProgressReadResult> {
  try {
    return deserializeCourseProgress(await storage.read(definition.id), definition);
  } catch {
    return resetRead("storage-error", createCourseProgress(definition));
  }
}

export async function writeCourseProgress(
  storage: CourseProgressStorageAdapter,
  definition: CourseDefinition,
  progress: CourseProgress,
): Promise<void> {
  await storage.write(definition.id, serializeCourseProgress(definition, progress));
}

export async function clearStoredCourseProgress(
  storage: CourseProgressStorageAdapter,
  definition: CourseDefinition,
): Promise<void> {
  await storage.remove(definition.id);
}

export function createCourseController(options: CourseControllerOptions): CourseController {
  const definition = defineCourse(options.definition);
  let progress = normalizeProgress(options.progress, definition);
  const commit = (next: CourseProgress): CourseProgress => {
    if (next !== progress) {
      progress = next;
      options.onChange?.(progress);
    }
    return progress;
  };
  return Object.freeze({
    definition,
    getProgress: () => progress,
    getSummary: () => summarizeCourseProgress(definition, progress),
    startUnit: (unitId: string) => commit(startCourseUnit(definition, progress, unitId)),
    recordEvidence(event: CourseEvidenceEvent): CourseEvidenceResult {
      const result = recordCourseEvidence(definition, progress, event);
      if (result.status === "accepted") commit(result.progress);
      return result;
    },
    canAdvanceStage: () => canAdvanceCourseStage(definition, progress),
    advanceStage: () => commit(advanceCourseStage(definition, progress)),
    skipUnit: (unitId: string) => commit(skipCourseUnit(definition, progress, unitId)),
    invalidateSourceEvidence: (input: InvalidateCourseSourceEvidenceInput) =>
      commit(invalidateCourseSourceEvidence(definition, progress, input)),
    resetUnit: (unitId: string) => commit(resetCourseUnit(definition, progress, unitId)),
    resetCourse: () => commit(resetCourseProgress(definition)),
    serialize: () => serializeCourseProgress(definition, progress),
  });
}

function activeContext(
  definition: CourseDefinition,
  progress: CourseProgress,
): {
  readonly unit: CourseUnitDefinition;
  readonly stage: CourseStageDefinition;
  readonly progress: CourseUnitProgress;
} | null {
  if (progress.activeUnitId === null) return null;
  const unit = requireUnit(definition, progress.activeUnitId);
  const unitProgress = requireUnitProgress(progress, unit.id);
  if (unitProgress.status !== "active" || unitProgress.currentStageId === null) return null;
  const stage = unit.stages.find((item) => item.id === unitProgress.currentStageId);
  if (stage === undefined) throw new TypeError("课程进度指向未知阶段");
  return Object.freeze({ unit, stage, progress: unitProgress });
}

function requirementExpectationsMatch(
  requirement: CourseEvidenceRequirement,
  values: Readonly<Record<string, CourseEvidenceValue>>,
): boolean {
  return requirement.expectations.every(
    (expectation) =>
      Object.hasOwn(values, expectation.key) && values[expectation.key] === expectation.value,
  );
}

function stageBindingAccepts(
  current: CourseStageEvidenceBinding | null,
  workspaceId: string | null,
  sourceFingerprint: string | null,
): boolean {
  if (workspaceId === null) return false;
  if (current === null) return true;
  return (
    current.workspaceId === workspaceId &&
    (current.sourceFingerprint === null ||
      sourceFingerprint === null ||
      current.sourceFingerprint === sourceFingerprint)
  );
}

function mergeStageEvidenceBinding(
  current: CourseStageEvidenceBinding | null,
  binding: CourseEvidenceBinding,
): CourseStageEvidenceBinding {
  if (binding.workspaceId === null) throw new TypeError("工作区证据缺少 workspaceId");
  if (!stageBindingAccepts(current, binding.workspaceId, binding.sourceFingerprint)) {
    throw new TypeError("工作区证据与当前阶段绑定不一致");
  }
  return Object.freeze({
    workspaceId: binding.workspaceId,
    sourceFingerprint: current?.sourceFingerprint ?? binding.sourceFingerprint,
  });
}

function bindingFromSatisfactions(
  satisfactions: readonly CourseRequirementSatisfaction[],
): CourseStageEvidenceBinding | null {
  let workspaceId: string | null = null;
  let sourceFingerprint: string | null = null;
  for (const satisfaction of satisfactions) {
    if (satisfaction.workspaceId === null) continue;
    if (
      workspaceId !== null &&
      (workspaceId !== satisfaction.workspaceId ||
        (sourceFingerprint !== null &&
          satisfaction.sourceFingerprint !== null &&
          sourceFingerprint !== satisfaction.sourceFingerprint))
    ) {
      throw new TypeError("同一阶段包含相互冲突的工作区证据");
    }
    workspaceId = satisfaction.workspaceId;
    sourceFingerprint ??= satisfaction.sourceFingerprint;
  }
  return workspaceId === null ? null : Object.freeze({ workspaceId, sourceFingerprint });
}

function normalizeStageEvidenceBinding(value: unknown): CourseStageEvidenceBinding | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new TypeError("stageEvidenceBinding 无效");
  assertStableId(value.workspaceId, "stageEvidenceBinding.workspaceId");
  assertNullableFingerprint(value.sourceFingerprint, "stageEvidenceBinding.sourceFingerprint");
  return Object.freeze({
    workspaceId: value.workspaceId,
    sourceFingerprint: value.sourceFingerprint,
  });
}

function sameStageEvidenceBinding(
  left: CourseStageEvidenceBinding | null,
  right: CourseStageEvidenceBinding | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    left.workspaceId === right.workspaceId && left.sourceFingerprint === right.sourceFingerprint
  );
}

function bindingMatches(
  binding: CourseEvidenceBinding,
  definition: CourseDefinition,
  unit: CourseUnitDefinition,
  stage: CourseStageDefinition,
): boolean {
  return (
    binding.courseId === definition.id &&
    binding.courseVersion === definition.version &&
    binding.unitId === unit.id &&
    binding.unitVersion === unit.version &&
    binding.stageId === stage.id
  );
}

function validScenarioTuple(binding: CourseEvidenceBinding): boolean {
  return (binding.scenarioId === null) === (binding.scenarioVersion === null);
}

function replaceUnitProgress(
  progress: CourseProgress,
  replacement: CourseUnitProgress,
): CourseProgress {
  return freezeProgress({
    ...progress,
    units: progress.units.map((unit) => (unit.unitId === replacement.unitId ? replacement : unit)),
  });
}

function freshUnitProgress(unit: CourseUnitDefinition): CourseUnitProgress {
  return freezeUnitProgress({
    unitId: unit.id,
    unitVersion: unit.version,
    status: "not-started",
    currentStageId: unit.stages[0]!.id,
    completedStageIds: [],
    satisfactions: [],
    stageEvidenceBinding: null,
    attempts: 0,
  });
}

function rebaseProgressForCourseVersion(
  value: Readonly<Record<string, unknown>>,
  definition: CourseDefinition,
): CourseProgress {
  if (!Array.isArray(value.units) || value.units.length > MAX_UNITS) {
    throw new TypeError("课程单元进度损坏");
  }
  const previous = new Map<string, Readonly<Record<string, unknown>>>();
  for (const item of value.units) {
    if (!isRecord(item) || typeof item.unitId !== "string") throw new TypeError("单元进度损坏");
    if (previous.has(item.unitId)) throw new TypeError("单元进度重复");
    previous.set(item.unitId, item);
  }
  return freezeProgress({
    schemaVersion: COURSE_PROGRESS_SCHEMA_VERSION,
    courseId: definition.id,
    courseVersion: definition.version,
    activeUnitId: null,
    units: definition.units.map((unit) => {
      const old = previous.get(unit.id);
      if (
        old === undefined ||
        old.unitVersion !== unit.version ||
        (old.status !== "mastered" && old.status !== "skipped")
      ) {
        return freshUnitProgress(unit);
      }
      return freezeUnitProgress({
        ...freshUnitProgress(unit),
        status: old.status,
        currentStageId: old.status === "mastered" ? null : unit.stages[0]!.id,
        completedStageIds: old.status === "mastered" ? unit.stages.map((stage) => stage.id) : [],
      });
    }),
  });
}

function migrateLegacyProgress(
  value: Readonly<Record<string, unknown>>,
  definition: CourseDefinition,
): CourseProgress {
  if (!Array.isArray(value.units) || value.units.length > MAX_UNITS) {
    throw new TypeError("旧课程进度损坏");
  }
  const oldById = new Map<string, Readonly<Record<string, unknown>>>();
  for (const item of value.units) {
    if (!isRecord(item) || typeof item.unitId !== "string") throw new TypeError("旧单元进度损坏");
    if (oldById.has(item.unitId)) throw new TypeError("旧单元进度重复");
    oldById.set(item.unitId, item);
  }
  return freezeProgress({
    schemaVersion: COURSE_PROGRESS_SCHEMA_VERSION,
    courseId: definition.id,
    courseVersion: definition.version,
    activeUnitId: null,
    units: definition.units.map((unit) => {
      const old = oldById.get(unit.id);
      if (old === undefined || old.unitVersion !== unit.version) return freshUnitProgress(unit);
      const status = old.status === "completed" ? "mastered" : old.status;
      if (status !== "mastered" && status !== "skipped") return freshUnitProgress(unit);
      return freezeUnitProgress({
        ...freshUnitProgress(unit),
        status,
        currentStageId: status === "mastered" ? null : unit.stages[0]!.id,
        completedStageIds: status === "mastered" ? unit.stages.map((stage) => stage.id) : [],
      });
    }),
  });
}

function normalizeProgress(value: unknown, definition: CourseDefinition): CourseProgress {
  if (!isRecord(value)) throw new TypeError("课程进度必须是对象");
  if (value.schemaVersion !== COURSE_PROGRESS_SCHEMA_VERSION) {
    throw new TypeError("课程进度 schema 不受支持");
  }
  if (value.courseId !== definition.id || value.courseVersion !== definition.version) {
    throw new TypeError("课程进度与课程定义不匹配");
  }
  if (value.activeUnitId !== null && typeof value.activeUnitId !== "string") {
    throw new TypeError("activeUnitId 无效");
  }
  if (!Array.isArray(value.units) || value.units.length !== definition.units.length) {
    throw new TypeError("课程单元进度不完整");
  }
  const units = value.units.map((item, index) =>
    normalizeUnitProgress(item, definition.units[index]!),
  );
  const active = units.filter((item) => item.status === "active");
  if (active.length > 1) throw new TypeError("课程同时存在多个活动单元");
  if (
    (active.length === 0 && value.activeUnitId !== null) ||
    (active.length === 1 && active[0]!.unitId !== value.activeUnitId)
  ) {
    throw new TypeError("activeUnitId 与单元状态不一致");
  }
  return freezeProgress({
    schemaVersion: COURSE_PROGRESS_SCHEMA_VERSION,
    courseId: definition.id,
    courseVersion: definition.version,
    activeUnitId: value.activeUnitId,
    units,
  });
}

function normalizeUnitProgress(value: unknown, unit: CourseUnitDefinition): CourseUnitProgress {
  if (!isRecord(value)) throw new TypeError("单元进度必须是对象");
  if (value.unitId !== unit.id || value.unitVersion !== unit.version) {
    throw new TypeError("单元进度与定义不匹配");
  }
  assertUnitStatus(value.status);
  if (value.currentStageId !== null && typeof value.currentStageId !== "string") {
    throw new TypeError("currentStageId 无效");
  }
  const knownStageIds = new Set(unit.stages.map((stage) => stage.id));
  if (value.currentStageId !== null && !knownStageIds.has(value.currentStageId)) {
    throw new TypeError("单元进度指向未知阶段");
  }
  if (value.status === "mastered" && value.currentStageId !== null) {
    throw new TypeError("已掌握单元不能保留当前阶段");
  }
  if (value.status !== "mastered" && value.currentStageId === null) {
    throw new TypeError("未掌握单元必须保留当前阶段");
  }
  const completedStageIds = freezeKnownUniqueIds(value.completedStageIds, knownStageIds);
  if (value.status === "mastered" && completedStageIds.length !== unit.stages.length) {
    throw new TypeError("已掌握单元必须完成全部阶段");
  }
  if (!Array.isArray(value.satisfactions) || value.satisfactions.length > MAX_EVIDENCE) {
    throw new TypeError("单元证据损坏或超限");
  }
  const satisfactions = Object.freeze(value.satisfactions.map(normalizeSatisfaction));
  const stageEvidenceBinding = normalizeStageEvidenceBinding(value.stageEvidenceBinding);
  const requirementIds = new Set<string>();
  const evidenceIds = new Set<string>();
  for (const satisfaction of satisfactions) {
    if (requirementIds.has(satisfaction.requirementId)) throw new TypeError("验收条件证据重复");
    if (evidenceIds.has(satisfaction.evidenceId)) throw new TypeError("证据事件重复");
    requirementIds.add(satisfaction.requirementId);
    evidenceIds.add(satisfaction.evidenceId);
  }
  if (value.currentStageId !== null) {
    const stage = unit.stages.find((item) => item.id === value.currentStageId)!;
    const currentRequirementIds = new Set(stage.requirements.map((item) => item.id));
    if (satisfactions.some((item) => !currentRequirementIds.has(item.requirementId))) {
      throw new TypeError("证据不属于当前阶段");
    }
  } else if (satisfactions.length > 0) {
    throw new TypeError("已掌握单元不能保留临时证据");
  }
  const derivedBinding = bindingFromSatisfactions(satisfactions);
  if (!sameStageEvidenceBinding(stageEvidenceBinding, derivedBinding)) {
    throw new TypeError("阶段证据绑定与证据记录不一致");
  }
  if (!Number.isSafeInteger(value.attempts) || (value.attempts as number) < 0) {
    throw new TypeError("attempts 无效");
  }
  return freezeUnitProgress({
    unitId: unit.id,
    unitVersion: unit.version,
    status: value.status,
    currentStageId: value.currentStageId,
    completedStageIds,
    satisfactions,
    stageEvidenceBinding,
    attempts: value.attempts as number,
  });
}

function normalizeSatisfaction(value: unknown): CourseRequirementSatisfaction {
  if (!isRecord(value)) throw new TypeError("证据记录必须是对象");
  assertStableId(value.requirementId, "requirementId");
  assertStableId(value.evidenceId, "evidenceId");
  assertStableId(value.evidenceType, "evidenceType");
  if (typeof value.trusted !== "boolean") throw new TypeError("trusted 无效");
  assertNullableStableId(value.workspaceId, "workspaceId");
  assertNullableFingerprint(value.sourceFingerprint, "sourceFingerprint");
  return freezeSatisfaction({
    requirementId: value.requirementId,
    evidenceId: value.evidenceId,
    evidenceType: value.evidenceType,
    trusted: value.trusted,
    workspaceId: value.workspaceId,
    sourceFingerprint: value.sourceFingerprint,
  });
}

function freezeEvidenceEvent(input: CourseEvidenceEvent): CourseEvidenceEvent {
  assertStableId(input.id, "evidence.id");
  assertStableId(input.type, "evidence.type");
  if (typeof input.trusted !== "boolean") throw new TypeError("evidence.trusted 无效");
  const binding = input.binding;
  assertStableId(binding.courseId, "binding.courseId");
  assertStableId(binding.courseVersion, "binding.courseVersion");
  assertStableId(binding.unitId, "binding.unitId");
  assertStableId(binding.unitVersion, "binding.unitVersion");
  assertStableId(binding.stageId, "binding.stageId");
  assertNullableStableId(binding.workspaceId, "binding.workspaceId");
  assertNullableFingerprint(binding.sourceFingerprint, "binding.sourceFingerprint");
  assertNullableStableId(binding.scenarioId, "binding.scenarioId");
  assertNullableStableId(binding.scenarioVersion, "binding.scenarioVersion");
  if (!isRecord(input.values)) throw new TypeError("evidence.values 必须是对象");
  const values: Record<string, CourseEvidenceValue> = {};
  for (const [key, value] of Object.entries(input.values)) {
    assertStableId(key, "evidence.values key");
    assertEvidenceValue(value, `evidence.values.${key}`);
    values[key] = value;
  }
  return Object.freeze({
    id: input.id,
    type: input.type,
    trusted: input.trusted,
    binding: Object.freeze({ ...binding }),
    values: Object.freeze(values),
  });
}

function freezeProgress(input: CourseProgress): CourseProgress {
  return Object.freeze({
    schemaVersion: COURSE_PROGRESS_SCHEMA_VERSION,
    courseId: input.courseId,
    courseVersion: input.courseVersion,
    activeUnitId: input.activeUnitId,
    units: Object.freeze([...input.units]),
  });
}

function freezeUnitProgress(input: CourseUnitProgress): CourseUnitProgress {
  return Object.freeze({
    unitId: input.unitId,
    unitVersion: input.unitVersion,
    status: input.status,
    currentStageId: input.currentStageId,
    completedStageIds: Object.freeze([...input.completedStageIds]),
    satisfactions: Object.freeze([...input.satisfactions]),
    stageEvidenceBinding:
      input.stageEvidenceBinding === null ? null : Object.freeze({ ...input.stageEvidenceBinding }),
    attempts: input.attempts,
  });
}

function freezeSatisfaction(input: CourseRequirementSatisfaction): CourseRequirementSatisfaction {
  return Object.freeze({ ...input });
}

function requireUnit(definition: CourseDefinition, unitId: string): CourseUnitDefinition {
  assertStableId(unitId, "unitId");
  const unit = findCourseUnit(definition, unitId);
  if (unit === null) throw new RangeError(`未知课程单元：${unitId}`);
  return unit;
}

function requireUnitProgress(progress: CourseProgress, unitId: string): CourseUnitProgress {
  const unit = progress.units.find((item) => item.unitId === unitId);
  if (unit === undefined) throw new TypeError(`课程进度缺少单元：${unitId}`);
  return unit;
}

function countStatus(progress: CourseProgress, status: CourseUnitStatus): number {
  return progress.units.filter((unit) => unit.status === status).length;
}

function percent(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 10_000) / 100;
}

function rejected(
  progress: CourseProgress,
  reason: CourseEvidenceRejectionReason,
): CourseEvidenceResult {
  return Object.freeze({ status: "rejected", progress, reason });
}

function resetRead(
  reason: CourseProgressResetReason,
  progress: CourseProgress,
): CourseProgressReadResult {
  return Object.freeze({ status: "reset", reason, progress });
}

function freezeKnownUniqueIds(value: unknown, known: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_UNITS) throw new TypeError("ID 列表损坏");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of value) {
    assertStableId(id, "ID");
    if (!known.has(id) || seen.has(id)) throw new TypeError("ID 列表包含未知或重复项");
    seen.add(id);
    result.push(id);
  }
  return Object.freeze(result);
}

function assertUnitStatus(value: unknown): asserts value is CourseUnitStatus {
  if (
    value !== "not-started" &&
    value !== "active" &&
    value !== "in-progress" &&
    value !== "mastered" &&
    value !== "skipped"
  ) {
    throw new TypeError("未知课程单元状态");
  }
}

function assertStableId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !STABLE_ID.test(value)) {
    throw new TypeError(`${label} 必须是稳定 ID`);
  }
}

function assertNullableStableId(value: unknown, label: string): asserts value is string | null {
  if (value !== null) assertStableId(value, label);
}

function assertFingerprint(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !FINGERPRINT.test(value)) {
    throw new TypeError(`${label} 必须是有效指纹`);
  }
}

function assertNullableFingerprint(value: unknown, label: string): asserts value is string | null {
  if (value !== null) assertFingerprint(value, label);
}

function assertEvidenceValue(value: unknown, label: string): asserts value is CourseEvidenceValue {
  if (
    value !== null &&
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new TypeError(`${label} 必须是可持久化标量`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`${label} 必须是有限数字`);
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
