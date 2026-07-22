import { describe, expect, it } from "vitest";
import type { FoaVisualFamily } from "../../src/tutorials/foa-contracts.js";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import {
  defaultFoaInteractiveRun,
  evaluateFoaInteractiveInput,
  getFoaInteractiveInputDefinition,
} from "../../src/tutorials/foa-interactive-inputs.js";
import {
  createFoaRuntimeModel,
  type FoaRuntimeActionKind,
  type FoaRuntimeModel,
} from "../../src/tutorials/foa-runtime-frames.js";
import { getFoaSceneProfile } from "../../src/tutorials/foa-scene-profiles.js";

const SPECIALIZED_ORDERS = new Set([2, 5, 16, 22, 47, 54, 60]);
const SHARED_RUNTIME_ORDERS = Object.freeze(
  Array.from({ length: 60 }, (_, index) => index + 1).filter(
    (order) => !SPECIALIZED_ORDERS.has(order),
  ),
);

const EXPECTED_ACTION_KINDS = new Set<FoaRuntimeActionKind>([
  "advance",
  "move",
  "choose",
  "apply",
  "inspect",
  "connect",
  "push-pop",
  "classify",
]);

const EXPECTED_VISUAL_FAMILIES = new Set<FoaVisualFamily>([
  "execution",
  "pipeline",
  "state",
  "expression",
  "decision",
  "loop",
  "sequence",
  "call-stack",
  "memory",
  "pointer-graph",
  "stream",
  "search",
  "evidence",
  "dependency",
]);

describe("FOA runtime frame models", () => {
  it("builds a four-frame bilingual model for all 53 shared semantic lessons", () => {
    expect(SHARED_RUNTIME_ORDERS).toHaveLength(53);

    for (const order of SHARED_RUNTIME_ORDERS) {
      const lesson = FOA_LESSONS[order - 1]!;
      const model = runtimeModel(order);

      expect(model.lessonId, `lesson ${String(order)} lesson ID`).toBe(lesson.id);
      expect(model.lessonOrder, `lesson ${String(order)} order`).toBe(order);
      expect(model.frames, `lesson ${String(order)} frames`).toHaveLength(4);
      expect(
        model.frames.map((frame) => frame.eventId),
        `lesson ${String(order)} semantic order`,
      ).toEqual(lesson.semanticEvents.map((event) => event.id));
      expect(
        model.frames.map((frame) => frame.cursorIndex),
        `lesson ${String(order)} cursor order`,
      ).toEqual([0, 1, 2, 3]);
      expect(model.frames.map((frame) => frame.outputVisible)).toEqual([false, false, false, true]);

      expectBilingual(model.visualModel, `lesson ${String(order)} visual model`);
      expectBilingual(model.primaryAction, `lesson ${String(order)} primary action`);
      for (const frame of model.frames) {
        expectBilingual(frame.label, `${frame.id} label`);
        expectBilingual(frame.detail, `${frame.id} detail`);
        for (const value of frame.values) {
          expectBilingual(value.label, `${value.id} label`);
          expectBilingual(value.value, `${value.id} value`);
        }
        expect(frame.activeRelation, `${frame.id} active relation`).not.toBeNull();
        expectBilingual(frame.activeRelation!.label, `${frame.id} relation label`);
      }
    }
  });

  it("covers every runtime action and every visual family used by the 53-lesson surface", () => {
    const models = SHARED_RUNTIME_ORDERS.map(runtimeModel);
    const actionKinds = new Set(
      models.flatMap((model) => model.frames.map((frame) => frame.actionKind)),
    );
    const visualFamilies = new Set(models.map((model) => model.visualFamily));

    expect(actionKinds).toEqual(EXPECTED_ACTION_KINDS);
    expect(visualFamilies).toEqual(EXPECTED_VISUAL_FAMILIES);
  });

  it("keeps value identities stable and relations valid as evidence accumulates", () => {
    for (const order of SHARED_RUNTIME_ORDERS) {
      const model = runtimeModel(order);
      const firstReferenceById = new Map<string, (typeof model.frames)[number]["values"][number]>();
      let previousIds = new Set<string>();

      for (const frame of model.frames) {
        const ids = new Set(frame.values.map((value) => value.id));
        expect(ids.size, `${frame.id} unique values`).toBe(frame.values.length);
        expect(
          [...previousIds].every((id) => ids.has(id)),
          `${frame.id} cumulative values`,
        ).toBe(true);

        for (const value of frame.values) {
          const firstReference = firstReferenceById.get(value.id);
          if (firstReference === undefined) firstReferenceById.set(value.id, value);
          else expect(value, `${frame.id} stable value ${value.id}`).toBe(firstReference);
        }
        for (const id of frame.activeValueIds) {
          expect(ids.has(id), `${frame.id} active value ${id}`).toBe(true);
        }
        expect(ids.has(frame.activeRelation!.fromValueId), `${frame.id} relation source`).toBe(
          true,
        );
        expect(ids.has(frame.activeRelation!.toValueId), `${frame.id} relation target`).toBe(true);
        expect(frame.activeRelation!.actionKind).toBe(frame.actionKind);
        previousIds = ids;
      }
    }
  });

  it("deep-freezes the model and binds interactive evidence without mutating authored lessons", () => {
    for (const order of SHARED_RUNTIME_ORDERS) {
      const lesson = FOA_LESSONS[order - 1]!;
      const inputDefinition = getFoaInteractiveInputDefinition(order);
      const run = inputDefinition === null ? null : defaultFoaInteractiveRun(inputDefinition);
      const model = createFoaRuntimeModel(lesson, getFoaSceneProfile(lesson), run);

      expect(model.stdin).toBe(run?.stdin ?? lesson.case.stdin);
      expect(model.stdout).toBe(run?.stdout ?? lesson.case.stdout);
      expect(Object.isFrozen(model)).toBe(true);
      expect(Object.isFrozen(model.frames)).toBe(true);
      for (const frame of model.frames) {
        expect(Object.isFrozen(frame)).toBe(true);
        expect(Object.isFrozen(frame.label)).toBe(true);
        expect(Object.isFrozen(frame.detail)).toBe(true);
        expect(Object.isFrozen(frame.values)).toBe(true);
        expect(Object.isFrozen(frame.activeValueIds)).toBe(true);
        expect(Object.isFrozen(frame.activeRelation)).toBe(true);
        expect(Object.isFrozen(frame.activeRelation!.label)).toBe(true);
        for (const value of frame.values) {
          expect(Object.isFrozen(value)).toBe(true);
          expect(Object.isFrozen(value.label)).toBe(true);
          expect(Object.isFrozen(value.value)).toBe(true);
        }
      }

      if (run !== null) {
        expect(model.frames.map((frame) => frame.label)).toEqual(run.eventDetails);
      }
      expect(lesson).toBe(FOA_LESSONS[order - 1]);
    }
  });

  it("uses the current input in visible frame labels instead of stale default-case numbers", () => {
    const definition = getFoaInteractiveInputDefinition(12)!;
    const result = evaluateFoaInteractiveInput(definition, { value: "3" });
    if (!result.ok) throw new Error(result.message.en);
    const lesson = FOA_LESSONS[11]!;
    const model = createFoaRuntimeModel(lesson, getFoaSceneProfile(lesson), result.run);
    const visibleText = model.frames.flatMap(({ label, detail }) => [
      label.zh,
      label.en,
      detail.zh,
      detail.en,
    ]);

    expect(visibleText.join(" ")).not.toContain("33.51");
    expect(model.frames.at(-1)?.label).toEqual({ zh: "输出 113.10", en: "Output 113.10" });
  });
});

function runtimeModel(order: number): FoaRuntimeModel {
  const lesson = FOA_LESSONS[order - 1]!;
  const definition = getFoaInteractiveInputDefinition(order);
  const run = definition === null ? null : defaultFoaInteractiveRun(definition);
  return createFoaRuntimeModel(lesson, getFoaSceneProfile(lesson), run);
}

function expectBilingual(
  value: Readonly<{ readonly zh: string; readonly en: string }>,
  label: string,
): void {
  expect(value.zh.trim(), `${label} zh`).not.toBe("");
  expect(value.en.trim(), `${label} en`).not.toBe("");
}
