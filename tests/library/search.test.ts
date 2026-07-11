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
