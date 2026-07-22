import type { InterfaceLocale } from "../shared/interface-locale.js";
import {
  createCourseController,
  createCourseProgress,
  deserializeCourseProgress,
  serializeCourseProgress,
  type CourseController,
  type CourseEvidenceEvent,
  type CourseProgress,
  type CourseUnitStatus,
} from "../tutorials/course-progress.js";
import {
  FOA_COURSE_ID,
  createFoaCourse,
  type FoaLocalEvidenceType,
} from "../tutorials/foa-course-adapter.js";
import { FOA_CURRICULUM_VERSION, getFoaLesson } from "../tutorials/foa-curriculum.js";
import type { FoaLocale } from "../tutorials/foa-contracts.js";
import { foaWorkspaceSourceContractId } from "../tutorials/foa-workspace-exercises.js";
import type { RuntimeLearningObservation } from "./runtime-workspace-controller.js";

export const FOA_COURSE_PROGRESS_STORAGE_KEY = "algolatch.foa-course-progress.v1";

export interface FoaCourseProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FoaLocalCourseEvidence {
  readonly type: FoaLocalEvidenceType;
  readonly lessonId: string;
  readonly complete: true;
}

export type FoaLessonStartResult =
  | { readonly status: "started" | "mastered" }
  | { readonly status: "blocked"; readonly message: string };

export type FoaEvidenceRecordResult =
  | {
      readonly status: "accepted";
      readonly lessonId: string;
      readonly mastered: boolean;
      readonly nextCaseId: string | null;
    }
  | { readonly status: "ignored"; readonly reason: string };

export interface FoaCourseSessionOptions {
  readonly locale: InterfaceLocale;
  readonly storage?: FoaCourseProgressStorage | undefined;
  readonly onChange?: ((progress: CourseProgress) => void) | undefined;
}

export interface FoaCourseSession {
  readonly activeLessonId: string | null;
  getProgress(): CourseProgress;
  getStatuses(): ReadonlyMap<string, CourseUnitStatus>;
  startLesson(lessonId: string): FoaLessonStartResult;
  skipLesson(lessonId: string): void;
  recordLocalEvidence(evidence: FoaLocalCourseEvidence): FoaEvidenceRecordResult;
  recordRuntimeObservation(observation: RuntimeLearningObservation): FoaEvidenceRecordResult;
  setLocale(locale: InterfaceLocale): void;
}

/**
 * Owns the evidence-gated FOA progress independently from the visual Tutorials page. The UI may
 * be recreated for a locale or layout change without losing course identity or mastery evidence.
 */
export function createFoaCourseSession(options: FoaCourseSessionOptions): FoaCourseSession {
  let locale = toFoaLocale(options.locale);
  let definition = createFoaCourse(locale);
  let evidenceSequence = 0;
  const restored = restoreProgress(options.storage, definition);
  let controller: CourseController = makeController(restored);

  function makeController(progress: CourseProgress): CourseController {
    return createCourseController({
      definition,
      progress,
      onChange(next) {
        persistProgress(options.storage, definition, next);
        options.onChange?.(next);
      },
    });
  }

  function startLesson(lessonId: string): FoaLessonStartResult {
    const current = controller.getProgress().units.find((unit) => unit.unitId === lessonId);
    if (current === undefined || getFoaLesson(lessonId) === null) {
      return Object.freeze({ status: "blocked", message: `未知课程：${lessonId}` });
    }
    if (current.status === "mastered") return Object.freeze({ status: "mastered" });
    try {
      controller.startUnit(lessonId);
      return Object.freeze({ status: "started" });
    } catch (error: unknown) {
      return Object.freeze({
        status: "blocked",
        message: error instanceof Error ? error.message : "课程尚未满足先修条件",
      });
    }
  }

  function recordLocalEvidence(evidence: FoaLocalCourseEvidence): FoaEvidenceRecordResult {
    if (getFoaLesson(evidence.lessonId)?.mode === "workspace-evidence") {
      return ignored("工作区课程不能使用本地完成证据");
    }
    const started = ensureActive(evidence.lessonId);
    if (started.status === "blocked") return ignored(started.message);
    if (started.status === "mastered") return accepted(evidence.lessonId, true, null);
    return record(
      evidence.lessonId,
      evidence.type,
      true,
      null,
      null,
      null,
      null,
      Object.freeze({ lessonId: evidence.lessonId, complete: evidence.complete }),
    );
  }

  function recordRuntimeObservation(
    observation: RuntimeLearningObservation,
  ): FoaEvidenceRecordResult {
    if (observation.type !== "run-completed") return ignored("该观察不是完整真实运行");
    const lessonId = controller.getProgress().activeUnitId;
    if (lessonId === null) return ignored("没有等待运行证据的活动课程");
    const lesson = getFoaLesson(lessonId);
    if (lesson?.mode !== "workspace-evidence") return ignored("当前课程不接收工作区运行证据");
    const exercise = lesson.workspaceExercise;
    if (exercise === null) return ignored("当前课程缺少独立练习契约");
    if (
      observation.scenarioId !== lessonId ||
      observation.scenarioVersion !== FOA_CURRICULUM_VERSION
    ) {
      return ignored("运行案例与当前课程不匹配");
    }
    if (observation.caseId === null) return ignored("运行证据缺少固定案例标识");
    const runCase = exercise.cases.find((candidate) => candidate.id === observation.caseId);
    if (runCase === undefined) return ignored("运行证据不属于当前课程的固定案例");
    const requiredIds = exercise.sourceRequirements.map((requirement) => requirement.id);
    if (
      observation.sourceContractId !== foaWorkspaceSourceContractId(exercise) ||
      observation.verifiedSourceRequirementIds.length !== requiredIds.length ||
      requiredIds.some((id) => !observation.verifiedSourceRequirementIds.includes(id))
    ) {
      return ignored("当前源码尚未满足课程要求的算法结构");
    }
    if (!/^\d+:[0-9a-f]+:[0-9a-f]+$/u.test(observation.sourceStructureFingerprint)) {
      return ignored("运行证据缺少有效源码结构指纹");
    }
    if (
      !observation.ok ||
      !observation.expectedMatch ||
      observation.expectedStdout !== runCase.stdout ||
      observation.stdout !== runCase.stdout
    ) {
      return ignored("固定案例的真实输出不匹配");
    }
    prepareWorkspaceBinding(lessonId, observation.workspaceId, observation.sourceFingerprint);
    return record(
      lessonId,
      "workspace-run-completed",
      true,
      observation.workspaceId,
      observation.sourceFingerprint,
      observation.scenarioId,
      observation.scenarioVersion,
      Object.freeze({
        lessonId,
        caseId: runCase.id,
        ok: true,
        stdout: observation.stdout,
        sourceContractId: observation.sourceContractId,
      }),
    );
  }

  function prepareWorkspaceBinding(
    lessonId: string,
    workspaceId: string,
    sourceFingerprint: string,
  ): void {
    const progress = controller.getProgress();
    const unit = progress.units.find((candidate) => candidate.unitId === lessonId);
    const binding = unit?.stageEvidenceBinding;
    if (binding === null || binding === undefined) return;
    if (binding.workspaceId === workspaceId && binding.sourceFingerprint === sourceFingerprint)
      return;
    if (
      binding.workspaceId === workspaceId &&
      binding.sourceFingerprint !== null &&
      binding.sourceFingerprint !== sourceFingerprint
    ) {
      controller.invalidateSourceEvidence({
        workspaceId,
        previousSourceFingerprint: binding.sourceFingerprint,
        nextSourceFingerprint: sourceFingerprint,
      });
      return;
    }
    controller.resetUnit(lessonId);
    controller.startUnit(lessonId);
  }

  function record(
    lessonId: string,
    type: string,
    trusted: boolean,
    workspaceId: string | null,
    sourceFingerprint: string | null,
    scenarioId: string | null,
    scenarioVersion: string | null,
    values: CourseEvidenceEvent["values"],
  ): FoaEvidenceRecordResult {
    const progress = controller.getProgress();
    const unit = progress.units.find((candidate) => candidate.unitId === lessonId);
    if (progress.activeUnitId !== lessonId || unit === undefined || unit.currentStageId === null) {
      return ignored("课程证据与活动单元不匹配");
    }
    evidenceSequence += 1;
    const result = controller.recordEvidence(
      Object.freeze({
        id: `foa.evidence.${String(evidenceSequence)}`,
        type,
        trusted,
        binding: Object.freeze({
          courseId: FOA_COURSE_ID,
          courseVersion: definition.version,
          unitId: lessonId,
          unitVersion: unit.unitVersion,
          stageId: unit.currentStageId,
          workspaceId,
          sourceFingerprint,
          scenarioId,
          scenarioVersion,
        }),
        values,
      }),
    );
    if (result.status !== "accepted") return ignored(result.reason);
    if (controller.canAdvanceStage()) controller.advanceStage();
    return accepted(
      lessonId,
      controller.getProgress().units.find((unit) => unit.unitId === lessonId)?.status ===
        "mastered",
      nextWorkspaceCaseId(lessonId),
    );
  }

  function nextWorkspaceCaseId(lessonId: string): string | null {
    const lesson = getFoaLesson(lessonId);
    const exercise = lesson?.workspaceExercise;
    if (exercise === null || exercise === undefined) return null;
    const unit = controller.getProgress().units.find((candidate) => candidate.unitId === lessonId);
    if (unit === undefined || unit.status === "mastered" || unit.currentStageId === null)
      return null;
    const satisfied = new Set(unit.satisfactions.map((item) => item.requirementId));
    return (
      exercise.cases.find(
        (_runCase, index) =>
          !satisfied.has(`${unit.currentStageId}.requirement.case-${String(index + 1)}`),
      )?.id ?? null
    );
  }

  function ensureActive(lessonId: string): FoaLessonStartResult {
    if (controller.getProgress().activeUnitId === lessonId) {
      return Object.freeze({ status: "started" });
    }
    return startLesson(lessonId);
  }

  return Object.freeze({
    get activeLessonId(): string | null {
      return controller.getProgress().activeUnitId;
    },
    getProgress: () => controller.getProgress(),
    getStatuses(): ReadonlyMap<string, CourseUnitStatus> {
      return new Map(
        controller.getProgress().units.map((unit) => [unit.unitId, unit.status] as const),
      );
    },
    startLesson,
    skipLesson(lessonId: string): void {
      if (getFoaLesson(lessonId) === null) return;
      controller.skipUnit(lessonId);
    },
    recordLocalEvidence,
    recordRuntimeObservation,
    setLocale(nextLocale: InterfaceLocale): void {
      const next = toFoaLocale(nextLocale);
      if (next === locale) return;
      const progress = controller.getProgress();
      locale = next;
      definition = createFoaCourse(locale);
      controller = makeController(progress);
    },
  });
}

function restoreProgress(
  storage: FoaCourseProgressStorage | undefined,
  definition: ReturnType<typeof createFoaCourse>,
): CourseProgress {
  if (storage === undefined) return createCourseProgress(definition);
  try {
    return deserializeCourseProgress(storage.getItem(FOA_COURSE_PROGRESS_STORAGE_KEY), definition)
      .progress;
  } catch {
    return createCourseProgress(definition);
  }
}

function persistProgress(
  storage: FoaCourseProgressStorage | undefined,
  definition: ReturnType<typeof createFoaCourse>,
  progress: CourseProgress,
): void {
  if (storage === undefined) return;
  try {
    storage.setItem(FOA_COURSE_PROGRESS_STORAGE_KEY, serializeCourseProgress(definition, progress));
  } catch {
    // A blocked browser store must not prevent an otherwise local lesson from continuing.
  }
}

function toFoaLocale(locale: InterfaceLocale): FoaLocale {
  return locale === "en" ? "en" : "zh";
}

function accepted(
  lessonId: string,
  mastered: boolean,
  nextCaseId: string | null,
): FoaEvidenceRecordResult {
  return Object.freeze({ status: "accepted", lessonId, mastered, nextCaseId });
}

function ignored(reason: string): FoaEvidenceRecordResult {
  return Object.freeze({ status: "ignored", reason });
}
