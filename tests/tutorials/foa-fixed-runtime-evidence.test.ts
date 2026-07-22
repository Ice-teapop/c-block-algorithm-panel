import { describe, expect, it } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import {
  FOA_FIXED_RUNTIME_ORDERS,
  getFoaFixedRuntimeCaseIo,
  getFoaFixedRuntimeEvidence,
  validateFoaFixedRuntimeEvidence,
} from "../../src/tutorials/foa-fixed-runtime-evidence.js";
import { getFoaSceneProfile } from "../../src/tutorials/foa-scene-profiles.js";

const EXPECTED_ORDERS = [
  1, 3, 4, 6, 7, 8, 10, 11, 24, 33, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 48, 49, 51, 53,
  55, 56, 57, 58,
] as const;

describe("FOA fixed-course runtime evidence", () => {
  it("authors all 30 fixed shared-runtime lessons explicitly with their exact case I/O", () => {
    expect(FOA_FIXED_RUNTIME_ORDERS).toEqual(EXPECTED_ORDERS);
    expect(FOA_FIXED_RUNTIME_ORDERS).toHaveLength(30);
    expect(() => validateFoaFixedRuntimeEvidence()).not.toThrow();

    for (const order of EXPECTED_ORDERS) {
      const lesson = FOA_LESSONS[order - 1]!;
      expect(getFoaFixedRuntimeCaseIo(order), `lesson ${String(order)} case`).toEqual({
        stdin: lesson.case.stdin,
        stdout: lesson.case.stdout,
      });
      expect(getFoaFixedRuntimeEvidence(order).order).toBe(order);
    }

    expect(() => getFoaFixedRuntimeEvidence(2)).toThrow(RangeError);
    expect(() => getFoaFixedRuntimeCaseIo(60)).toThrow(RangeError);
  });

  it("provides four full bilingual state snapshots instead of generic step prose", () => {
    for (const order of EXPECTED_ORDERS) {
      const lesson = FOA_LESSONS[order - 1]!;
      const evidence = getFoaFixedRuntimeEvidence(order);
      const expectedFieldIds = getFoaSceneProfile(order)
        .stateShape.map(({ id }) => id)
        .sort();
      const authoredStepText = new Set(
        [
          ...lesson.experience.semanticSequence.flatMap(({ zh, en }) => [zh, en]),
          lesson.case.description.zh,
          lesson.case.description.en,
        ]
          .map((value) => value.trim())
          .filter((value) => value.length > 18),
      );

      expect(evidence.frames, `lesson ${String(order)} frames`).toHaveLength(4);
      expect(
        evidence.frames[1]?.stateValues,
        `lesson ${String(order)} first learner action must change visible state`,
      ).not.toEqual(evidence.frames[0]?.stateValues);
      for (const [frameIndex, frame] of evidence.frames.entries()) {
        expect(Object.keys(frame.stateValues).sort()).toEqual(expectedFieldIds);
        for (const [fieldId, value] of Object.entries(frame.stateValues)) {
          expect(
            value.zh.trim(),
            `lesson ${String(order)} frame ${String(frameIndex)} ${fieldId} zh`,
          ).not.toBe("");
          expect(
            value.en.trim(),
            `lesson ${String(order)} frame ${String(frameIndex)} ${fieldId} en`,
          ).not.toBe("");
          expect(value.zh.length).toBeLessThanOrEqual(120);
          expect(value.en.length).toBeLessThanOrEqual(120);
          expect(value.zh).not.toMatch(/[\r\n]/u);
          expect(value.en).not.toMatch(/[\r\n]/u);
          expect(
            authoredStepText.has(value.zh.trim()),
            `lesson ${String(order)} frame ${String(frameIndex)} ${fieldId} repeats zh step: ${value.zh}`,
          ).toBe(false);
          expect(
            authoredStepText.has(value.en.trim()),
            `lesson ${String(order)} frame ${String(frameIndex)} ${fieldId} repeats en step: ${value.en}`,
          ).toBe(false);
        }
      }
      expect(
        expectedFieldIds.some(
          (fieldId) =>
            new Set(evidence.frames.map(({ stateValues }) => stateValues[fieldId]!.zh)).size > 1,
        ),
        `lesson ${String(order)} must expose changing state`,
      ).toBe(true);
    }
  });

  it("adds structured tokens, stacks, memory links, branches and iterations where semantics require them", () => {
    const frames = EXPECTED_ORDERS.flatMap((order) => getFoaFixedRuntimeEvidence(order).frames);
    expect(frames.filter(({ tokens }) => tokens.length > 0).length).toBeGreaterThanOrEqual(20);
    expect(
      frames.filter(({ stackFrames }) => stackFrames.length > 0).length,
    ).toBeGreaterThanOrEqual(20);
    expect(
      frames.filter(({ memoryLinks }) => memoryLinks.length > 0).length,
    ).toBeGreaterThanOrEqual(30);
    expect(
      frames.filter(({ branchOutcome }) => branchOutcome !== null).length,
    ).toBeGreaterThanOrEqual(8);
    expect(frames.filter(({ iteration }) => iteration !== null).length).toBeGreaterThanOrEqual(20);

    for (const frame of frames) {
      expect(new Set(frame.tokens.map(({ id }) => id)).size).toBe(frame.tokens.length);
      expect(new Set(frame.stackFrames.map(({ id }) => id)).size).toBe(frame.stackFrames.length);
      expect(new Set(frame.memoryLinks.map(({ id }) => id)).size).toBe(frame.memoryLinks.length);
      expect(
        frame.activeTokenIds.every((id) => frame.tokens.some((token) => token.id === id)),
      ).toBe(true);
      expect(
        frame.activeStackFrameId === null ||
          frame.stackFrames.some(({ id }) => id === frame.activeStackFrameId),
      ).toBe(true);
      expect(
        frame.activeMemoryLinkId === null ||
          frame.memoryLinks.some(({ id }) => id === frame.activeMemoryLinkId),
      ).toBe(true);
    }
  });

  it("gives every dedicated drag, connect and push-pop frame a concrete operable target", () => {
    for (const order of EXPECTED_ORDERS) {
      const control = getFoaSceneProfile(order).learnerControl;
      for (const [index, frame] of getFoaFixedRuntimeEvidence(order).frames.entries()) {
        if (control === "drag") {
          expect(
            frame.tokens.length,
            `lesson ${String(order)} frame ${String(index)} drag tokens`,
          ).toBeGreaterThan(0);
          expect(
            frame.activeTokenIds.length,
            `lesson ${String(order)} frame ${String(index)} active drag token`,
          ).toBeGreaterThan(0);
        }
        if (control === "connect") {
          expect(
            frame.memoryLinks.length,
            `lesson ${String(order)} frame ${String(index)} links`,
          ).toBeGreaterThan(0);
          expect(
            frame.activeMemoryLinkId,
            `lesson ${String(order)} frame ${String(index)} active link`,
          ).not.toBeNull();
        }
        if (control === "push-pop") {
          expect(
            frame.stackFrames.length,
            `lesson ${String(order)} frame ${String(index)} stack`,
          ).toBeGreaterThan(0);
          expect(
            frame.activeStackFrameId,
            `lesson ${String(order)} frame ${String(index)} active stack`,
          ).not.toBeNull();
        }
      }
    }
  });

  it("deep-freezes every authored lesson, snapshot and structured relation", () => {
    for (const order of EXPECTED_ORDERS) {
      const evidence = getFoaFixedRuntimeEvidence(order);
      expect(Object.isFrozen(evidence)).toBe(true);
      expect(Object.isFrozen(evidence.frames)).toBe(true);
      for (const frame of evidence.frames) {
        expect(Object.isFrozen(frame)).toBe(true);
        expect(Object.isFrozen(frame.stateValues)).toBe(true);
        expect(Object.isFrozen(frame.tokens)).toBe(true);
        expect(Object.isFrozen(frame.stackFrames)).toBe(true);
        expect(Object.isFrozen(frame.memoryLinks)).toBe(true);
        for (const value of Object.values(frame.stateValues)) {
          expect(Object.isFrozen(value)).toBe(true);
        }
        for (const token of frame.tokens) expect(Object.isFrozen(token)).toBe(true);
        for (const stackFrame of frame.stackFrames) expect(Object.isFrozen(stackFrame)).toBe(true);
        for (const link of frame.memoryLinks) expect(Object.isFrozen(link)).toBe(true);
      }
    }
  });
});
