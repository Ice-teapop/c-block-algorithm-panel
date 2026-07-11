import { describe, expect, it } from "vitest";
import {
  WORKBENCH_MENU_DEFINITIONS,
  moveRovingIndex,
  workbenchMenuDefinitionsFromRegistry,
} from "../../src/ui/workbench-menu.js";
import { createBuiltinWorkbenchRegistry } from "../../src/workbench/builtin-modules.js";

describe("M6 workbench menu contracts", () => {
  it("publishes exactly four serious workbench roots in the requested order", () => {
    expect(WORKBENCH_MENU_DEFINITIONS.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "settings", label: "设置" },
      { id: "presets", label: "预设块" },
      { id: "library", label: "Library" },
      { id: "panels", label: "面板预览" },
    ]);
    expect(WORKBENCH_MENU_DEFINITIONS.every((root) => Object.isFrozen(root.branches))).toBe(true);
  });

  it("keeps software documentation, syntax dictionary, panels and layouts discoverable", () => {
    const branches = (rootId: string) =>
      WORKBENCH_MENU_DEFINITIONS.find(({ id }) => id === rootId)?.branches ?? [];

    expect(branches("library").map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "manual",
        "canvas-wires",
        "c-syntax",
        "standard-library",
        "algorithms-complexity",
        "extension-api",
        "onboarding",
      ]),
    );
    expect(branches("panels").filter(({ kind }) => kind === "panel")).toHaveLength(10);
    expect(
      branches("panels")
        .filter(({ kind }) => kind === "layout")
        .map(({ id }) => id),
    ).toEqual(["learn", "build", "debug", "analyze", "minimal"]);
  });

  it("uses wrapping roving focus with Home and End anchors", () => {
    expect(moveRovingIndex(3, "next", 4)).toBe(0);
    expect(moveRovingIndex(0, "previous", 4)).toBe(3);
    expect(moveRovingIndex(2, "home", 4)).toBe(0);
    expect(moveRovingIndex(1, "end", 4)).toBe(3);
    expect(moveRovingIndex(0, "direct", 4, 99)).toBe(3);
    expect(() => moveRovingIndex(0, "next", 0)).toThrow(/正整数/u);
  });

  it("derives the visible Dock branches from the registry contribution snapshot", () => {
    const definitions = workbenchMenuDefinitionsFromRegistry(
      createBuiltinWorkbenchRegistry().snapshot(),
    );

    expect(definitions.map((menu) => menu.id)).toEqual(
      WORKBENCH_MENU_DEFINITIONS.map((menu) => menu.id),
    );
    expect(definitions.map((menu) => menu.branches.map((branch) => branch.id))).toEqual(
      WORKBENCH_MENU_DEFINITIONS.map((menu) => menu.branches.map((branch) => branch.id)),
    );
    expect(definitions[3]?.branches.at(-2)?.id).toBe("save-layout");
  });
});
