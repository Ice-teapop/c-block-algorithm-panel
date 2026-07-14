import { describe, expect, it, vi } from "vitest";
import { forwardRuntimeLearningObservation } from "../../src/app/guided-lesson-observation-adapter.js";
import type { GuidedLessonWorkspaceController } from "../../src/app/guided-lesson-workspace-controller.js";
import type { LearningEvidenceBinding } from "../../src/tutorials/index.js";

describe("guided lesson observation adapter", () => {
  it("forwards one benchmark completion with its exact scenario binding", () => {
    const evidenceBinding: LearningEvidenceBinding = Object.freeze({
      lessonId: "lesson.first.maximum-scan",
      lessonVersion: "6.1.0",
      workspaceId: "tutorial.workspace",
      sourceFingerprint: "source-fingerprint",
      scenarioId: "scenario.searching.maximum",
      scenarioVersion: "1.0.0",
    });
    const binding = vi.fn(() => evidenceBinding);
    const recordEvidence = vi.fn(() => true);
    const lesson = { binding, recordEvidence } as unknown as GuidedLessonWorkspaceController;

    forwardRuntimeLearningObservation(lesson, {
      type: "benchmark-completed",
      workspaceId: "tutorial.workspace",
      sourceFingerprint: "source-fingerprint",
      scenarioId: "scenario.searching.maximum",
      scenarioVersion: "1.0.0",
      sizes: Object.freeze([8, 32, 128]),
      repetitions: 3,
    });

    expect(binding).toHaveBeenCalledWith(
      "source-fingerprint",
      "scenario.searching.maximum",
      "1.0.0",
    );
    expect(recordEvidence).toHaveBeenCalledOnce();
    expect(recordEvidence).toHaveBeenCalledWith({
      type: "benchmark-completed",
      binding: evidenceBinding,
      sizes: [8, 32, 128],
      repetitions: 3,
    });
  });

  it("drops benchmark evidence when the active lesson workspace differs", () => {
    const recordEvidence = vi.fn(() => true);
    const lesson = {
      binding: vi.fn(() => ({
        lessonId: "lesson.first.maximum-scan",
        lessonVersion: "6.1.0",
        workspaceId: "other.workspace",
        sourceFingerprint: "source-fingerprint",
        scenarioId: "scenario.searching.maximum",
        scenarioVersion: "1.0.0",
      })),
      recordEvidence,
    } as unknown as GuidedLessonWorkspaceController;

    forwardRuntimeLearningObservation(lesson, {
      type: "benchmark-completed",
      workspaceId: "tutorial.workspace",
      sourceFingerprint: "source-fingerprint",
      scenarioId: "scenario.searching.maximum",
      scenarioVersion: "1.0.0",
      sizes: Object.freeze([8, 32, 128]),
      repetitions: 3,
    });

    expect(recordEvidence).not.toHaveBeenCalled();
  });
});
