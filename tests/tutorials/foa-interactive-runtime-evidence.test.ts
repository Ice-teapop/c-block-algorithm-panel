import { describe, expect, it } from "vitest";
import {
  defaultFoaInteractiveRun,
  evaluateFoaInteractiveInput,
  getFoaInteractiveInputDefinition,
  type FoaInteractiveInputDefinition,
  type FoaInteractiveRun,
} from "../../src/tutorials/foa-interactive-inputs.js";
import {
  createFoaInteractiveRuntimeEvidence,
  FOA_INTERACTIVE_RUNTIME_EVIDENCE_ORDERS,
} from "../../src/tutorials/foa-interactive-runtime-evidence.js";
import { getFoaSceneProfile } from "../../src/tutorials/foa-scene-profiles.js";

const EXPECTED_ORDERS = Object.freeze([
  9, 12, 13, 14, 15, 17, 18, 19, 20, 21, 23, 25, 26, 27, 28, 29, 30, 31, 32, 34, 50, 52, 59,
]);

describe("FOA interactive runtime evidence", () => {
  it("authors exactly four complete, immutable snapshots for every migrated lesson", () => {
    expect(FOA_INTERACTIVE_RUNTIME_EVIDENCE_ORDERS).toEqual(EXPECTED_ORDERS);

    for (const order of FOA_INTERACTIVE_RUNTIME_EVIDENCE_ORDERS) {
      const run = defaultRun(order);
      const evidence = createFoaInteractiveRuntimeEvidence(run);
      const expectedFields = getFoaSceneProfile(order)
        .stateShape.map(({ id }) => id)
        .sort();

      expect(evidence.order).toBe(order);
      expect(evidence.frames, `lesson ${String(order)} frames`).toHaveLength(4);
      expect(Object.isFrozen(evidence)).toBe(true);
      expect(Object.isFrozen(evidence.frames)).toBe(true);
      expect(evidence.frames[1]?.stateValues).not.toEqual(evidence.frames[0]?.stateValues);

      for (const snapshot of evidence.frames) {
        expect(Object.keys(snapshot.stateValues).sort()).toEqual(expectedFields);
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.stateValues)).toBe(true);
        expect(Object.isFrozen(snapshot.tokens)).toBe(true);
        expect(Object.isFrozen(snapshot.activeTokenIds)).toBe(true);
        expect(Object.isFrozen(snapshot.stackFrames)).toBe(true);
        expect(Object.isFrozen(snapshot.memoryLinks)).toBe(true);
        expect(snapshot.iteration === null || Number.isInteger(snapshot.iteration)).toBe(true);
        if (snapshot.iteration !== null) expect(snapshot.iteration).toBeGreaterThanOrEqual(0);

        for (const value of Object.values(snapshot.stateValues)) {
          expect(value.zh.trim().length).toBeGreaterThan(0);
          expect(value.en.trim().length).toBeGreaterThan(0);
          expect(Object.isFrozen(value)).toBe(true);
        }
        const tokenIds = new Set(snapshot.tokens.map(({ id }) => id));
        expect(snapshot.activeTokenIds.every((id) => tokenIds.has(id))).toBe(true);
        if (snapshot.activeStackFrameId !== null) {
          expect(snapshot.stackFrames.some(({ id }) => id === snapshot.activeStackFrameId)).toBe(
            true,
          );
        }
        if (snapshot.activeMemoryLinkId !== null) {
          expect(snapshot.memoryLinks.some(({ id }) => id === snapshot.activeMemoryLinkId)).toBe(
            true,
          );
        }
      }
    }
  });

  it("derives state from runtime I/O and tokens, never from authored event-detail prose", () => {
    for (const order of FOA_INTERACTIVE_RUNTIME_EVIDENCE_ORDERS) {
      const run = defaultRun(order);
      const poison = Object.freeze(
        Array.from({ length: 4 }, (_, index) =>
          Object.freeze({
            zh: `禁止读取的句子 ${String(index)}`,
            en: `Forbidden event sentence ${String(index)}`,
          }),
        ),
      );
      const poisonedRun = Object.freeze({ ...run, eventDetails: poison });

      expect(createFoaInteractiveRuntimeEvidence(poisonedRun)).toEqual(
        createFoaInteractiveRuntimeEvidence(run),
      );
    }
  });

  it("keeps drag, stack, and pointer evidence actionable instead of code-highlight only", () => {
    const dragOrders = EXPECTED_ORDERS.filter(
      (order) => getFoaSceneProfile(order).learnerControl === "drag",
    );
    expect(dragOrders).toEqual([12, 13, 23, 25, 27, 29, 31, 52]);

    for (const order of dragOrders) {
      const evidence = createFoaInteractiveRuntimeEvidence(defaultRun(order));
      expect(
        evidence.frames.some(
          ({ tokens, activeTokenIds }) => tokens.length > 0 && activeTokenIds.length > 0,
        ),
        `lesson ${String(order)} needs a draggable active token`,
      ).toBe(true);
    }

    const callEvidence = createFoaInteractiveRuntimeEvidence(defaultRun(32));
    expect(callEvidence.frames.some(({ stackFrames }) => stackFrames.length > 0)).toBe(true);
    expect(
      callEvidence.frames.some(({ activeStackFrameId }) => activeStackFrameId === "square"),
    ).toBe(true);

    const pointerEvidence = createFoaInteractiveRuntimeEvidence(defaultRun(50));
    expect(pointerEvidence.frames.some(({ memoryLinks }) => memoryLinks.length > 0)).toBe(true);
    expect(pointerEvidence.frames.at(-1)?.stateValues.outValidity).toEqual({
      zh: "成立",
      en: "True",
    });
  });

  it("records real decision and iteration evidence for branch and loop mechanisms", () => {
    const branchOrders = [9, 14, 15, 17, 18, 19, 20, 21, 25, 30, 34, 50, 59];
    const iterativeOrders = [23, 25, 26, 27, 28, 29, 30, 31, 52];

    for (const order of branchOrders) {
      const frames = createFoaInteractiveRuntimeEvidence(defaultRun(order)).frames;
      expect(
        frames.some(({ branchOutcome }) => branchOutcome !== null),
        `lesson ${String(order)} branch outcome`,
      ).toBe(true);
    }
    for (const order of iterativeOrders) {
      const frames = createFoaInteractiveRuntimeEvidence(defaultRun(order)).frames;
      expect(
        frames.some(({ iteration }) => iteration !== null),
        `lesson ${String(order)} iteration`,
      ).toBe(true);
    }
  });

  it("keeps rejected scanner, arithmetic, range, capacity, and lookup paths observable", () => {
    const cases = [
      [9, { value: "not-a-number" }, "scan-failed"],
      [12, { value: "-2" }, "range-rejected"],
      [13, { left: "7", right: "0" }, "range-rejected"],
      [19, { value: "-1" }, "range-rejected"],
      [29, { value: "-1" }, "range-rejected"],
      [31, { left: "0", right: "18" }, "range-rejected"],
      [50, { value: "bad" }, "scan-failed"],
      [52, { count: "6", values: "" }, "range-rejected"],
      [59, { value: "9" }, "range-rejected"],
    ] as const;

    for (const [order, values, outcome] of cases) {
      const run = acceptedRun(order, values);
      expect(run.outcome).toBe(outcome);
      const final = createFoaInteractiveRuntimeEvidence(run).frames.at(-1)!;
      expect(final.branchOutcome).toBe(false);
      expect(
        Object.values(final.stateValues).every(({ zh, en }) => zh.length > 0 && en.length > 0),
      ).toBe(true);
    }

    const failedPointer = createFoaInteractiveRuntimeEvidence(acceptedRun(50, { value: "bad" }));
    expect(failedPointer.frames.every(({ memoryLinks }) => memoryLinks.length === 0)).toBe(true);
    expect(failedPointer.frames.at(-1)?.stateValues.outValidity).toEqual({
      zh: "不成立",
      en: "False",
    });
  });

  it("fails closed on output, outcome, token, and unsupported-course mismatches", () => {
    const run = defaultRun(28);
    expect(() =>
      createFoaInteractiveRuntimeEvidence(Object.freeze({ ...run, stdout: "999\n" })),
    ).toThrow(/output/u);
    expect(() =>
      createFoaInteractiveRuntimeEvidence(Object.freeze({ ...run, outcome: "range-rejected" })),
    ).toThrow(/outcome/u);
    expect(() =>
      createFoaInteractiveRuntimeEvidence(
        Object.freeze({ ...run, tokens: Object.freeze(["999"]) }),
      ),
    ).toThrow(/tokens/u);
    expect(() =>
      createFoaInteractiveRuntimeEvidence(Object.freeze({ ...defaultRun(9), order: 2 })),
    ).toThrow(/not an interactive shared lesson/u);
  });
});

function requiredDefinition(order: number): FoaInteractiveInputDefinition {
  const definition = getFoaInteractiveInputDefinition(order);
  if (definition === null) throw new Error(`Missing input definition for lesson ${String(order)}`);
  return definition;
}

function defaultRun(order: number): FoaInteractiveRun {
  return defaultFoaInteractiveRun(requiredDefinition(order));
}

function acceptedRun(order: number, values: Readonly<Record<string, string>>): FoaInteractiveRun {
  const result = evaluateFoaInteractiveInput(requiredDefinition(order), values);
  if (!result.ok) throw new Error(result.message.en);
  return result.run;
}
