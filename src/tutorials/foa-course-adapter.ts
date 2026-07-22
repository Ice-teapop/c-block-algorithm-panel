import {
  defineCourse,
  type CourseDefinition,
  type CourseEvidenceRequirement,
  type CourseStageMode,
} from "./course-model.js";
import { FOA_CURRICULUM_VERSION, FOA_LESSONS } from "./foa-curriculum.js";
import type { FoaLessonDefinition, FoaLessonMode, FoaLocale } from "./foa-contracts.js";
import { foaWorkspaceSourceContractId } from "./foa-workspace-exercises.js";

export const FOA_COURSE_ID = "course.foa";

export type FoaLocalEvidenceType =
  | "semantic-sequence-completed"
  | "block-observation-completed"
  | "block-gap-completed"
  | "block-composition-completed";

/** Data-only launch contract consumed by the workspace/runtime integration layer. */
export interface FoaWorkspaceLaunchContract {
  readonly initialSource: string;
  readonly runtimeCase: {
    readonly id: string;
    readonly version: string;
    readonly cases: readonly {
      readonly id: string;
      readonly size: number;
      readonly stdin: string;
      readonly expectedStdout: string;
    }[];
    readonly sourceContractId: string;
    readonly sourceRequirements: readonly { readonly id: string; readonly pattern: string }[];
  };
}

export function createFoaWorkspaceLaunchContract(
  lesson: FoaLessonDefinition,
): FoaWorkspaceLaunchContract | null {
  const exercise = lesson.workspaceExercise;
  if (lesson.mode !== "workspace-evidence" || exercise === null) return null;
  return Object.freeze({
    initialSource: exercise.initialSource,
    runtimeCase: Object.freeze({
      id: lesson.id,
      version: FOA_CURRICULUM_VERSION,
      cases: Object.freeze(
        exercise.cases.map((item) =>
          Object.freeze({
            id: item.id,
            size: item.size,
            stdin: item.stdin,
            expectedStdout: item.stdout,
          }),
        ),
      ),
      sourceContractId: foaWorkspaceSourceContractId(exercise),
      sourceRequirements: Object.freeze(
        exercise.sourceRequirements.map((item) =>
          Object.freeze({ id: item.id, pattern: item.pattern }),
        ),
      ),
    }),
  });
}

/** Builds the locale-specific presentation while retaining one stable course/progress identity. */
export function createFoaCourse(locale: FoaLocale): CourseDefinition {
  const knowledgePoints = new Map<string, CourseDefinition["knowledgePoints"][number]>();
  for (const lesson of FOA_LESSONS) {
    for (const point of lesson.knowledgePoints) {
      const existing = knowledgePoints.get(point.id);
      const next = Object.freeze({
        id: point.id,
        title: point.title[locale],
        summary: point.explanation[locale],
        libraryEntryIds: Object.freeze([point.id, lesson.id]),
      });
      if (existing !== undefined && existing.summary !== next.summary) {
        throw new TypeError(`FOA knowledge point ${point.id} has conflicting definitions`);
      }
      knowledgePoints.set(point.id, existing ?? next);
    }
  }

  return defineCourse({
    id: FOA_COURSE_ID,
    version: FOA_CURRICULUM_VERSION,
    title: locale === "en" ? "Foundations of Algorithms with C" : "C 与算法基础课程",
    summary:
      locale === "en"
        ? "A task-based path from observable C semantics to independent algorithm construction and runtime evidence."
        : "从可观察的 C 语义逐步过渡到独立算法搭建、编码与真实运行证据。",
    knowledgePoints: Object.freeze([...knowledgePoints.values()]),
    units: Object.freeze(FOA_LESSONS.map((lesson) => courseUnit(lesson, locale))),
  });
}

export function foaLocalEvidenceTypeForMode(
  mode: Exclude<FoaLessonMode, "workspace-evidence">,
): FoaLocalEvidenceType {
  if (mode === "semantic") return "semantic-sequence-completed";
  if (mode === "block-observe") return "block-observation-completed";
  if (mode === "block-complete") return "block-gap-completed";
  return "block-composition-completed";
}

function courseUnit(
  lesson: FoaLessonDefinition,
  locale: FoaLocale,
): CourseDefinition["units"][number] {
  const stageId = `${lesson.id}.stage`;
  const events = lesson.semanticEvents.map((event) =>
    Object.freeze({
      id: event.id,
      type: event.type,
      sourceAnchorId: `${event.id}.source`,
      relationIds: Object.freeze(
        lesson.relations
          .filter((relation) => relation.role === relationRoleForEvent(event.type))
          .map((relation) => relation.id),
      ),
    }),
  );
  return Object.freeze({
    id: lesson.id,
    version: FOA_CURRICULUM_VERSION,
    title: lesson.title[locale],
    summary: lesson.summary[locale],
    knowledgePointIds: Object.freeze(lesson.knowledgePoints.map((point) => point.id)),
    // The catalog exposes prerequisites as guidance, but lessons remain directly reachable.
    // Skipping therefore never manufactures mastery and never traps the learner behind a lock.
    prerequisiteUnitIds: Object.freeze([]),
    stages: Object.freeze([
      Object.freeze({
        id: stageId,
        title: lesson.title[locale],
        instruction:
          lesson.objectives[0]?.[locale] ??
          (locale === "en" ? "Complete the observable task." : "完成可观察任务。"),
        mode: lesson.mode as CourseStageMode,
        knowledgePointIds: Object.freeze(lesson.knowledgePoints.map((point) => point.id)),
        events: Object.freeze(events),
        requirements: courseRequirements(lesson, locale, stageId),
      }),
    ]),
  });
}

function courseRequirements(
  lesson: FoaLessonDefinition,
  locale: FoaLocale,
  stageId: string,
): readonly CourseEvidenceRequirement[] {
  if (lesson.mode === "workspace-evidence") {
    const exercise = lesson.workspaceExercise;
    if (exercise === null) throw new TypeError(`${lesson.id} 缺少独立工作区练习契约`);
    const sourceContractId = foaWorkspaceSourceContractId(exercise);
    return Object.freeze(
      exercise.cases.map((runCase, index) =>
        Object.freeze({
          id: `${stageId}.requirement.case-${String(index + 1)}`,
          label:
            locale === "en"
              ? `Pass fixed runtime case ${String(index + 1)} with the required source structure.`
              : `使用规定源码结构通过固定运行案例 ${String(index + 1)}。`,
          evidenceType: "workspace-run-completed",
          binding: "workspace-source",
          trust: "verified",
          expectations: Object.freeze([
            Object.freeze({ key: "lessonId", value: lesson.id }),
            Object.freeze({ key: "caseId", value: runCase.id }),
            Object.freeze({ key: "ok", value: true }),
            Object.freeze({ key: "stdout", value: runCase.stdout }),
            Object.freeze({ key: "sourceContractId", value: sourceContractId }),
          ]),
        }),
      ),
    );
  }
  return Object.freeze([
    Object.freeze({
      id: `${stageId}.requirement`,
      label:
        locale === "en"
          ? "Complete the lesson's observable semantic task."
          : "完成本课的可观察语义任务。",
      evidenceType: foaLocalEvidenceTypeForMode(lesson.mode),
      binding: "stage",
      trust: "local",
      expectations: Object.freeze([
        Object.freeze({ key: "lessonId", value: lesson.id }),
        Object.freeze({ key: "complete", value: true }),
      ]),
    }),
  ]);
}

function relationRoleForEvent(type: FoaLessonDefinition["semanticEvents"][number]["type"]): string {
  if (type === "compare" || type === "branch") return "predicate";
  if (type === "write" || type === "allocate" || type === "release") return "mutation";
  if (type === "return") return "output";
  if (type === "iterate" || type === "call") return "control";
  if (type === "measure") return "evidence";
  return "value";
}
