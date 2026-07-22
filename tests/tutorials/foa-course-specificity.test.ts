import { describe, expect, it } from "vitest";
import { getLibraryEntry } from "../../src/library/index.js";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import {
  defaultFoaInteractiveRun,
  getFoaInteractiveInputDefinition,
} from "../../src/tutorials/foa-interactive-inputs.js";
import { createFoaRuntimeModel } from "../../src/tutorials/foa-runtime-frames.js";
import { getFoaSceneMechanism } from "../../src/tutorials/foa-scene-mechanisms.js";
import { getFoaSceneProfile } from "../../src/tutorials/foa-scene-profiles.js";

const SPECIALIZED_ORDERS = new Set([2, 5, 16, 22, 47, 54, 60]);
const SHARED_LESSONS = FOA_LESSONS.slice(0, 60).filter(
  ({ order }) => !SPECIALIZED_ORDERS.has(order),
);

describe("FOA course-specific runtime contracts", () => {
  it("gives every shared lesson one unique mechanism, case goal, model and four-state sequence", () => {
    expect(SHARED_LESSONS).toHaveLength(53);

    const mechanismIds = new Set<string>();
    const goalsZh = new Set<string>();
    const visualModelsZh = new Set<string>();
    const sequencesZh = new Set<string>();

    for (const lesson of SHARED_LESSONS) {
      const profile = getFoaSceneProfile(lesson);
      const mechanism = getFoaSceneMechanism(lesson.order);
      const inputDefinition = getFoaInteractiveInputDefinition(lesson.order);
      const runtime = createFoaRuntimeModel(
        lesson,
        profile,
        inputDefinition === null ? null : defaultFoaInteractiveRun(inputDefinition),
      );

      expect(profile.mechanismId).toBe(mechanism.mechanismId);
      expect(runtime.mechanismId).toBe(mechanism.mechanismId);
      expect(runtime.frames).toHaveLength(4);
      expect(lesson.experience.semanticSequence).toHaveLength(4);
      expect(new Set(lesson.experience.semanticSequence.map(({ zh }) => zh)).size).toBe(4);
      expect(new Set(lesson.experience.semanticSequence.map(({ en }) => en)).size).toBe(4);
      expect(profile.caseGoal.zh.trim()).not.toBe("");
      expect(profile.caseGoal.en.trim()).not.toBe("");
      expect(profile.special, lesson.id).toBe(true);
      expect(profile.stateShape.length).toBeGreaterThanOrEqual(3);
      expect(profile.observableLabels).toHaveLength(profile.stateShape.length);

      mechanismIds.add(profile.mechanismId);
      goalsZh.add(profile.caseGoal.zh);
      visualModelsZh.add(lesson.experience.visualModel.zh);
      sequencesZh.add(lesson.experience.semanticSequence.map(({ zh }) => zh).join(" -> "));
    }

    expect(mechanismIds.size).toBe(53);
    expect(goalsZh.size).toBe(53);
    expect(visualModelsZh.size).toBe(53);
    expect(sequencesZh.size).toBe(53);
  });

  it("exposes typed state instead of generic animation-only metadata", () => {
    for (const lesson of SHARED_LESSONS) {
      const profile = getFoaSceneProfile(lesson);
      const fieldIds = new Set(profile.stateShape.map(({ id }) => id));

      expect(fieldIds.size, lesson.id).toBe(profile.stateShape.length);
      expect(profile.mechanismId, lesson.id).toMatch(
        new RegExp(`^foa\\.mechanism\\.${String(lesson.order).padStart(3, "0")}\\.`),
      );
      expect(Object.isFrozen(profile.stateShape), lesson.id).toBe(true);
      expect(Object.isFrozen(profile.observableLabels), lesson.id).toBe(true);

      for (const field of profile.stateShape) {
        expect(field.label.zh.trim(), `${lesson.id}.${field.id}.zh`).not.toBe("");
        expect(field.label.en.trim(), `${lesson.id}.${field.id}.en`).not.toBe("");
        expect(Object.isFrozen(field), `${lesson.id}.${field.id}`).toBe(true);
        expect(Object.isFrozen(field.label), `${lesson.id}.${field.id}.label`).toBe(true);
      }
    }
  });

  it("matches interaction and observable contracts to each mechanism family", () => {
    for (const lesson of SHARED_LESSONS) {
      const profile = getFoaSceneProfile(lesson);
      const valueKinds = new Set(profile.stateShape.map(({ valueKind }) => valueKind));
      const interactiveInput = getFoaInteractiveInputDefinition(lesson.order);

      expect(profile.caseMode === "interactive", lesson.id).toBe(interactiveInput !== null);
      if (interactiveInput !== null && lesson.order !== 9 && lesson.order !== 50) {
        expect(profile.learnerControl, lesson.id).not.toBe("input");
      }

      switch (profile.kind) {
        case "branch":
          expect(profile.observableKind, lesson.id).toBe("branch");
          expect(valueKinds.has("boolean"), lesson.id).toBe(true);
          break;
        case "loop":
          expect(profile.observableKind, lesson.id).toBe("loop");
          expect(valueKinds.has("cursor"), lesson.id).toBe(true);
          break;
        case "call-stack":
          expect(profile.observableKind, lesson.id).toBe("call-stack");
          expect(valueKinds.has("stack-frame"), lesson.id).toBe(true);
          break;
        case "scope":
          expect(profile.observableKind, lesson.id).toBe("scope");
          expect(valueKinds.has("scope-binding"), lesson.id).toBe(true);
          break;
        case "pointer":
          expect(profile.observableKind, lesson.id).toBe("pointer");
          expect(valueKinds.has("pointer"), lesson.id).toBe(true);
          break;
        case "matrix":
          expect(profile.observableKind, lesson.id).toBe("matrix");
          expect(valueKinds.has("matrix"), lesson.id).toBe(true);
          break;
        case "search":
          expect(profile.observableKind, lesson.id).toBe("search");
          expect(valueKinds.has("cursor"), lesson.id).toBe(true);
          break;
        default:
          expect(profile.observableLabels.length, lesson.id).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps the knowledge component and every Library relationship attached to each lesson", () => {
    const missingKnowledgeEntries: string[] = [];
    for (const lesson of SHARED_LESSONS) {
      expect(lesson.knowledgePoints).toHaveLength(1);
      const knowledgePoint = lesson.knowledgePoints[0]!;
      const lessonEntry = getLibraryEntry(lesson.id);
      const knowledgeEntry = getLibraryEntry(knowledgePoint.id);
      const profile = getFoaSceneProfile(lesson);

      expect(lessonEntry, lesson.id).not.toBeNull();
      expect(knowledgeEntry, knowledgePoint.id).not.toBeNull();
      expect(lessonEntry!.relatedEntryIds, lesson.id).toContain(knowledgePoint.id);
      expect(knowledgeEntry!.relatedEntryIds, knowledgePoint.id).toContain(lesson.id);
      expect(lessonEntry!.details.join("\n"), lesson.id).toContain(profile.caseGoal.zh);
      expect(knowledgeEntry!.details.join("\n"), knowledgePoint.id).toContain(profile.caseGoal.zh);
      expect(lessonEntry!.localizations?.en?.details?.join("\n"), lesson.id).toContain(
        profile.caseGoal.en,
      );
      for (const field of profile.stateShape) {
        expect(lessonEntry!.keywords, `${lesson.id}.${field.id}`).toContain(field.id);
        expect(lessonEntry!.keywords, `${lesson.id}.${field.id}.zh`).toContain(field.label.zh);
        expect(lessonEntry!.localizations?.en?.keywords, `${lesson.id}.${field.id}.en`).toContain(
          field.label.en,
        );
      }
      expect(lesson.libraryKnowledgeIds.length, lesson.id).toBeGreaterThan(0);
      for (const entryId of lesson.libraryKnowledgeIds) {
        if (getLibraryEntry(entryId) === null) missingKnowledgeEntries.push(entryId);
      }
    }
    expect([...new Set(missingKnowledgeEntries)].sort()).toEqual([]);
  });
});
