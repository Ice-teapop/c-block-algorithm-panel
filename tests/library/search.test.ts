import { describe, expect, it } from "vitest";
import { searchLibrary } from "../../src/library/index.js";

describe("Library full-text search", () => {
  it("finds Chinese titles, English aliases, detail text and source examples", () => {
    expect(searchLibrary("二分查找").map((result) => result.entry.id)).toContain(
      "algorithms.binary-search",
    );
    expect(searchLibrary("use after free").map((result) => result.entry.id)).toContain(
      "c.dynamic-memory",
    );
    expect(searchLibrary("memmove")[0]?.entry.id).toBe("std.memory");
    expect(searchLibrary("sourceFingerprint viewport")[0]?.entry.id).toBe("canvas.view-state");
    expect(searchLibrary("AI 助手 运行证据")[0]?.entry.id).toBe("manual.ai-assistant");
    expect(searchLibrary("repeatable regression cases")[0]?.entry.id).toBe("tutorial.input-cases");
    expect(searchLibrary("nonterminating loop")[0]?.entry.id).toBe("tutorial.failure-recovery");
  });

  it("uses AND semantics for multiple tokens and supports branch filtering", () => {
    const results = searchLibrary("queue graph", { branchId: "algorithms-complexity" });
    expect(results.map((result) => result.entry.id)).toContain("algorithms.graph-traversal");
    expect(results.every((result) => result.entry.branchId === "algorithms-complexity")).toBe(true);
    expect(
      searchLibrary("malloc", { branchId: "standard-library" }).map((result) => result.entry.id),
    ).toContain("std.stdlib");
    expect(searchLibrary("malloc", { branchId: "onboarding" })).toEqual([]);
  });

  it("can scope ordinary dictionary search away from help and developer internals", () => {
    expect(searchLibrary("renderer opaque revision", { audiences: ["learner"] })).toEqual([]);
    expect(
      searchLibrary("sourceFingerprint viewport", { audiences: ["developer"] })[0]?.entry.id,
    ).toBe("canvas.view-state");
    expect(
      searchLibrary("binary search", {
        branchIds: ["data-structure-dictionary", "algorithms-complexity"],
        audiences: ["learner"],
      }).map(({ entry }) => entry.id),
    ).toContain("algorithms.binary-search");
  });

  it("searches tutorial goals, steps, checks and artifacts", () => {
    const queries: ReadonlyArray<readonly [string, string]> = [
      ["第一个算法 最大值", "tutorial.maximum-stream"],
      ["积木 C 源码", "tutorial.blocks-to-c"],
      ["全负数 单元素", "tutorial.input-cases"],
      ["比较方向 调试", "tutorial.debug-comparison"],
      ["真实 Trace 分支", "tutorial.real-trace"],
      ["输入规模 中位数", "tutorial.complexity-growth"],
      ["指针 malloc free", "tutorial.pointer-memory"],
      ["编译 超时 恢复", "tutorial.failure-recovery"],
    ];
    for (const [query, expectedId] of queries) {
      expect(
        searchLibrary(query, { branchId: "examples" }).map((result) => result.entry.id),
        query,
      ).toContain(expectedId);
    }
    const stepOnly = searchLibrary("遮住输出", { branchId: "examples" });
    expect(stepOnly[0]?.entry.id).toBe("tutorial.input-cases");
    expect(stepOnly[0]?.matchedFields).toContain("tutorial");
  });

  it("is deterministic, immutable and rejects unsafe limits", () => {
    const first = searchLibrary("control flow", { limit: 12 });
    const second = searchLibrary("control flow", { limit: 12 });
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every((result) => Object.isFrozen(result.matchedFields))).toBe(true);
    expect(() => searchLibrary("C", { limit: 0 })).toThrow(/limit/u);
    expect(() => searchLibrary("C", { limit: 501 })).toThrow(/limit/u);
  });
});
