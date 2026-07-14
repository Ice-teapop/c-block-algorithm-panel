import { describe, expect, it } from "vitest";
import { quickOpenItemId, type QuickOpenItem } from "../../src/commands/index.js";
import {
  isQuickOpenShortcut,
  parseQuickOpenQuery,
  rankQuickOpenItems,
} from "../../src/ui/quick-open.js";

describe("Quick Open query and ranking", () => {
  const items: readonly QuickOpenItem[] = Object.freeze([
    item("command", "navigation.workspace", "工作区", "自由画布与 C 代码", ["workspace"]),
    item("command", "settings.general", "设置：通用", "语言与背景", ["language"]),
    item("node", "node.if", "判断 value > max", "main · branch", ["if", "value"]),
    item("preset", "builtin.maximum", "更新最大值", "积木 · C 基础", ["maximum"]),
    item("library", "complexity.linear", "线性复杂度", "O(n) 说明", ["big-o"]),
  ]);

  it("parses command, node, block, Library and settings prefixes", () => {
    expect(parseQuickOpenQuery("> work")).toEqual(
      expect.objectContaining({ scope: "command", query: "work", settingsOnly: false }),
    );
    expect(parseQuickOpenQuery("@ value").scope).toBe("node");
    expect(parseQuickOpenQuery("+ maximum").scope).toBe("preset");
    expect(parseQuickOpenQuery("# O(n)").scope).toBe("library");
    expect(parseQuickOpenQuery("/ language")).toEqual(
      expect.objectContaining({ scope: "command", query: "language", settingsOnly: true }),
    );
  });

  it("shows only commands before a query and searches all sources afterwards", () => {
    expect(rankQuickOpenItems(items, "").map(({ item }) => item.kind)).toEqual([
      "command",
      "command",
    ]);
    expect(rankQuickOpenItems(items, "value").map(({ item }) => item.targetId)).toEqual([
      "node.if",
    ]);
    expect(rankQuickOpenItems(items, "maximum").map(({ item }) => item.targetId)).toEqual([
      "builtin.maximum",
    ]);
  });

  it("uses prefixes as strict scopes and settings never leaks other commands", () => {
    expect(rankQuickOpenItems(items, "@ value").map(({ item }) => item.kind)).toEqual(["node"]);
    expect(rankQuickOpenItems(items, "# big-o").map(({ item }) => item.kind)).toEqual(["library"]);
    expect(rankQuickOpenItems(items, "/ language").map(({ item }) => item.targetId)).toEqual([
      "settings.general",
    ]);
    expect(rankQuickOpenItems(items, "/ workspace")).toEqual([]);
  });

  it("deduplicates stable ids and rejects unsafe result limits", () => {
    expect(rankQuickOpenItems([...items, items[0]!], "> work")).toHaveLength(1);
    expect(() => rankQuickOpenItems(items, "", 0)).toThrow(/1–500/u);
    expect(quickOpenItemId("node", "main/if 1")).not.toContain(" ");
  });

  it("opens with Cmd/Ctrl+K or the expert Cmd/Ctrl+Shift+P alias only", () => {
    const keys = (overrides: Partial<Parameters<typeof isQuickOpenShortcut>[0]> = {}) => ({
      key: "k",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      ...overrides,
    });
    expect(isQuickOpenShortcut(keys({ metaKey: true }), true)).toBe(true);
    expect(isQuickOpenShortcut(keys({ key: "P", metaKey: true, shiftKey: true }), true)).toBe(true);
    expect(isQuickOpenShortcut(keys({ ctrlKey: true }), true)).toBe(false);
    expect(isQuickOpenShortcut(keys({ metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(isQuickOpenShortcut(keys({ key: "p", metaKey: true }), true)).toBe(false);
    expect(isQuickOpenShortcut(keys({ key: "p", ctrlKey: true, shiftKey: true }), true)).toBe(
      false,
    );
    expect(isQuickOpenShortcut(keys({ ctrlKey: true }), false)).toBe(true);
    expect(isQuickOpenShortcut(keys({ key: "p", ctrlKey: true, shiftKey: true }), false)).toBe(
      true,
    );
    expect(isQuickOpenShortcut(keys({ key: "p", ctrlKey: true }), false)).toBe(false);
    expect(isQuickOpenShortcut(keys({ key: "p", metaKey: true, shiftKey: true }), false)).toBe(
      false,
    );
    expect(isQuickOpenShortcut(keys({ ctrlKey: true, altKey: true }), false)).toBe(false);
    expect(
      isQuickOpenShortcut(keys({ key: "p", ctrlKey: true, altKey: true, shiftKey: true }), false),
    ).toBe(false);
  });
});

function item(
  kind: QuickOpenItem["kind"],
  targetId: string,
  label: string,
  detail: string,
  keywords: readonly string[],
): QuickOpenItem {
  return Object.freeze({
    id: quickOpenItemId(kind, targetId),
    kind,
    targetId,
    label,
    detail,
    keywords: Object.freeze([...keywords]),
    order: 0,
  });
}
