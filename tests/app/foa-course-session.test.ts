import { describe, expect, it, vi } from "vitest";
import {
  createFoaCourseSession,
  FOA_COURSE_PROGRESS_STORAGE_KEY,
} from "../../src/app/foa-course-session.js";
import { FOA_CURRICULUM_VERSION, FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import { foaWorkspaceSourceContractId } from "../../src/tutorials/foa-workspace-exercises.js";
import type { RuntimeLearningObservation } from "../../src/app/runtime-workspace-controller.js";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
}

describe("FOA course session", () => {
  it("records local task evidence, persists mastery, and restores it", () => {
    const store = storage();
    const session = createFoaCourseSession({ locale: "zh-CN", storage: store });
    const lesson = FOA_LESSONS[0]!;
    expect(session.startLesson(lesson.id)).toEqual({ status: "started" });
    expect(
      session.recordLocalEvidence({
        type: "semantic-sequence-completed",
        lessonId: lesson.id,
        complete: true,
      }),
    ).toEqual({ status: "accepted", lessonId: lesson.id, mastered: true, nextCaseId: null });
    expect(session.getStatuses().get(lesson.id)).toBe("mastered");
    expect(store.values.has(FOA_COURSE_PROGRESS_STORAGE_KEY)).toBe(true);

    const restored = createFoaCourseSession({ locale: "en", storage: store });
    expect(restored.getStatuses().get(lesson.id)).toBe("mastered");
  });

  it("keeps skip distinct from mastery while leaving later lessons directly reachable", () => {
    const session = createFoaCourseSession({ locale: "en" });
    session.skipLesson(FOA_LESSONS[0]!.id);
    expect(session.getStatuses().get(FOA_LESSONS[0]!.id)).toBe("skipped");
    expect(session.startLesson(FOA_LESSONS[1]!.id)).toEqual({ status: "started" });
    expect(session.getStatuses().get(FOA_LESSONS[0]!.id)).not.toBe("mastered");
  });

  it("requires the declared source structure and every fixed real case", () => {
    const session = createFoaCourseSession({ locale: "en" });
    const lesson = FOA_LESSONS.find((candidate) => candidate.mode === "workspace-evidence")!;
    const exercise = lesson.workspaceExercise!;
    expect(session.startLesson(lesson.id)).toEqual({ status: "started" });
    expect(
      session.recordRuntimeObservation(runtimeObservation(lesson, 0, { sourceContractId: null })),
    ).toMatchObject({ status: "ignored" });
    expect(session.getStatuses().get(lesson.id)).toBe("active");

    for (const index of exercise.cases.keys()) {
      expect(session.recordRuntimeObservation(runtimeObservation(lesson, index))).toEqual(
        index + 1 === exercise.cases.length
          ? { status: "accepted", lessonId: lesson.id, mastered: true, nextCaseId: null }
          : {
              status: "accepted",
              lessonId: lesson.id,
              mastered: false,
              nextCaseId: exercise.cases[index + 1]!.id,
            },
      );
      if (index + 1 < exercise.cases.length) {
        expect(session.getStatuses().get(lesson.id)).toBe("active");
      }
    }
    expect(session.getStatuses().get(lesson.id)).toBe("mastered");
  });

  it("invalidates earlier cases after a source edit and rejects a constant-output shortcut", () => {
    const session = createFoaCourseSession({ locale: "en" });
    const lesson = FOA_LESSONS.find((candidate) => candidate.mode === "workspace-evidence")!;
    const exercise = lesson.workspaceExercise!;
    session.startLesson(lesson.id);

    expect(session.recordRuntimeObservation(runtimeObservation(lesson, 0))).toMatchObject({
      status: "accepted",
    });
    expect(
      session.recordRuntimeObservation(
        runtimeObservation(lesson, 1, {
          sourceFingerprint: "source:def",
          sourceStructureFingerprint: "7:def:456",
        }),
      ),
    ).toMatchObject({ status: "accepted" });
    expect(session.getStatuses().get(lesson.id)).toBe("active");

    expect(
      session.recordRuntimeObservation(
        runtimeObservation(lesson, 2, {
          sourceFingerprint: "source:def",
          sourceStructureFingerprint: "7:def:456",
          stdout: exercise.cases[0]!.stdout,
          expectedMatch: false,
          historyDisposition: "teaching-failure",
        }),
      ),
    ).toMatchObject({ status: "ignored" });
    expect(session.getStatuses().get(lesson.id)).toBe("active");

    for (const index of exercise.cases.keys()) {
      session.recordRuntimeObservation(
        runtimeObservation(lesson, index, {
          sourceFingerprint: "source:def",
          sourceStructureFingerprint: "7:def:456",
        }),
      );
    }
    expect(session.getStatuses().get(lesson.id)).toBe("mastered");
  });
});

function runtimeObservation(
  lesson: (typeof FOA_LESSONS)[number],
  caseIndex: number,
  override: Partial<Extract<RuntimeLearningObservation, { type: "run-completed" }>> = {},
): Extract<RuntimeLearningObservation, { type: "run-completed" }> {
  const exercise = lesson.workspaceExercise!;
  const runCase = exercise.cases[caseIndex]!;
  return {
    type: "run-completed",
    workspaceId: "workspace.lesson",
    sourceFingerprint: "source:abc",
    sourceStructureFingerprint: "7:abc:123",
    scenarioId: lesson.id,
    scenarioVersion: FOA_CURRICULUM_VERSION,
    size: runCase.size,
    caseId: runCase.id,
    ok: true,
    stdout: runCase.stdout,
    expectedStdout: runCase.stdout,
    expectedMatch: true,
    sourceContractId: foaWorkspaceSourceContractId(exercise),
    verifiedSourceRequirementIds: exercise.sourceRequirements.map((item) => item.id),
    exitCode: 0,
    termination: "process-exit",
    historyDisposition: "success",
    ...override,
  };
}
