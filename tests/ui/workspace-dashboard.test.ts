import { describe, expect, it } from "vitest";
import type { WorkspaceEntrySummary } from "../../src/shared/workspace.js";
import { filterWorkspaceEntries } from "../../src/ui/workspace-dashboard.js";

describe("workspace Dashboard model", () => {
  const entries = [
    entry("project-a", "project", "Binary Search"),
    entry("sandbox-a", "sandbox", "指针实验"),
    entry("test-a", "test", "Binary 边界测试"),
  ];

  it("filters module rows without changing the stable snapshot order", () => {
    expect(filterWorkspaceEntries(entries, "project", "").map(({ id }) => id)).toEqual([
      "project-a",
    ]);
    expect(filterWorkspaceEntries(entries, "recent", "binary").map(({ id }) => id)).toEqual([
      "project-a",
      "test-a",
    ]);
    expect(entries.map(({ id }) => id)).toEqual(["project-a", "sandbox-a", "test-a"]);
  });

  it("matches Unicode titles case-insensitively and returns an empty state honestly", () => {
    expect(filterWorkspaceEntries(entries, "sandbox", "指针")).toEqual([entries[1]]);
    expect(filterWorkspaceEntries(entries, "test", "missing")).toEqual([]);
  });
});

function entry(id: string, kind: WorkspaceEntrySummary["kind"], title: string) {
  return Object.freeze({
    id,
    kind,
    title,
    sourceName: "main.c" as const,
    revision: 0,
    byteLength: 0,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  });
}
