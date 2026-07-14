import { describe, expect, it } from "vitest";
import {
  createResizableLayoutSnapshot,
  resolveSplitterKeyboardSize,
  splitterAriaLabel,
} from "../../src/ui/resizable-layout.js";

describe("M6 resizable layout contracts", () => {
  it("maps splitter keys to the correct axis and clamps pane constraints", () => {
    const horizontal = {
      axis: "horizontal" as const,
      currentSize: 240,
      initialSize: 220,
      minSize: 160,
      maxSize: 320,
      step: 16,
    };
    expect(resolveSplitterKeyboardSize({ ...horizontal, key: "ArrowRight" })).toEqual({
      handled: true,
      size: 256,
    });
    expect(
      resolveSplitterKeyboardSize({ ...horizontal, currentSize: 316, key: "ArrowRight" }),
    ).toEqual({
      handled: true,
      size: 320,
    });
    expect(resolveSplitterKeyboardSize({ ...horizontal, key: "ArrowDown" })).toEqual({
      handled: false,
      size: 240,
    });
    expect(resolveSplitterKeyboardSize({ ...horizontal, key: "Home" }).size).toBe(160);
    expect(resolveSplitterKeyboardSize({ ...horizontal, key: "End" }).size).toBe(320);
    expect(resolveSplitterKeyboardSize({ ...horizontal, key: "Enter" }).size).toBe(220);
  });

  it("supports vertical panels and produces an immutable persistence payload", () => {
    expect(
      resolveSplitterKeyboardSize({
        axis: "vertical",
        key: "ArrowUp",
        currentSize: 300,
        initialSize: 280,
        minSize: 120,
        maxSize: 480,
      }),
    ).toEqual({ handled: true, size: 292 });

    const snapshot = createResizableLayoutSnapshot("vertical", { flow: 220, metrics: 180 });
    expect(snapshot).toEqual({
      schemaVersion: 1,
      axis: "vertical",
      sizes: { flow: 220, metrics: 180 },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.sizes)).toBe(true);
    expect(() => createResizableLayoutSnapshot("horizontal", { bad: 0 })).toThrow(/正数/u);
  });

  it("uses locale-safe splitter accessibility labels", () => {
    expect(splitterAriaLabel("code", "en")).toBe("code size");
    expect(splitterAriaLabel("代码", "en")).toBe("Panel size");
    expect(splitterAriaLabel("代码", "en")).not.toMatch(/[\p{Script=Han}]/u);
    expect(splitterAriaLabel("代码", "zh-CN")).toBe("代码 尺寸");
  });
});
