import { describe, expect, it } from "vitest";
import {
  LIBRARY_BRANCHES,
  LIBRARY_ENTRIES,
  LIBRARY_ENTRY_BY_ID,
  getLibraryEntry,
  libraryEntriesForBranch,
  relatedLibraryEntries,
  resolveLibraryBranchId,
} from "../../src/library/index.js";

describe("Library catalog", () => {
  it("contains exactly 11 populated branches and at least 70 substantive entries", () => {
    expect(LIBRARY_BRANCHES).toHaveLength(11);
    expect(LIBRARY_ENTRIES.length).toBeGreaterThanOrEqual(70);
    expect(new Set(LIBRARY_ENTRIES.map((entry) => entry.id)).size).toBe(LIBRARY_ENTRIES.length);
    for (const branch of LIBRARY_BRANCHES) {
      expect(libraryEntriesForBranch(branch.id).length, branch.id).toBeGreaterThan(0);
    }
    for (const entry of LIBRARY_ENTRIES) {
      expect(entry.summary.length, entry.id).toBeGreaterThanOrEqual(20);
      expect(entry.details.length, entry.id).toBeGreaterThanOrEqual(2);
      expect(
        entry.details.every((paragraph) => paragraph.length >= 15),
        entry.id,
      ).toBe(true);
      expect(Object.isFrozen(entry), entry.id).toBe(true);
    }
  });

  it("covers mainstream undergraduate C, data structures and algorithms", () => {
    const requiredIds = [
      "c.types",
      "c.operators",
      "c.loops",
      "c.functions",
      "c.arrays",
      "c.pointers",
      "c.dynamic-memory",
      "std.stdio",
      "std.string",
      "data.linked-list",
      "data.stack",
      "data.queue",
      "data.hash-table",
      "data.bst",
      "data.heap",
      "data.graph",
      "algorithms.big-o",
      "algorithms.binary-search",
      "algorithms.sorting",
      "algorithms.dynamic-programming",
      "algorithms.graph-traversal",
      "algorithms.shortest-path",
    ];
    for (const entryId of requiredIds) expect(getLibraryEntry(entryId), entryId).not.toBeNull();
    expect(LIBRARY_ENTRIES.filter((entry) => entry.example !== null).length).toBeGreaterThan(15);
  });

  it("resolves every cross-link and returns immutable related navigation", () => {
    for (const entry of LIBRARY_ENTRIES) {
      for (const relatedId of entry.relatedEntryIds) {
        expect(LIBRARY_ENTRY_BY_ID.has(relatedId), `${entry.id} -> ${relatedId}`).toBe(true);
      }
      expect(Object.isFrozen(relatedLibraryEntries(entry)), entry.id).toBe(true);
    }
  });

  it("accepts the Dock branch ids used by both workbench menu definitions", () => {
    expect(resolveLibraryBranchId("manual")).toBe("manual");
    expect(resolveLibraryBranchId("library.canvas")).toBe("canvas-wires");
    expect(resolveLibraryBranchId("library.execution")).toBe("execution-diagnostics");
    expect(resolveLibraryBranchId("data-structures")).toBe("data-structure-dictionary");
    expect(resolveLibraryBranchId("library.algorithms")).toBe("algorithms-complexity");
    expect(resolveLibraryBranchId("library.extensions")).toBe("extension-api");
    expect(resolveLibraryBranchId("missing")).toBeNull();
  });

  it("documents the registry contribution interfaces by their exact exported names", () => {
    const extensionText = libraryEntriesForBranch("extension-api")
      .map((entry) => `${entry.title} ${entry.summary} ${entry.details.join(" ")}`)
      .join(" ");
    for (const interfaceName of [
      "WorkbenchModuleManifest",
      "WorkbenchModuleDefinition",
      "InspectorViewContribution",
      "DockGroupContribution",
      "DockMenuContribution",
      "DockMenuBranchContribution",
      "PanelContribution",
      "LayoutPresetContribution",
      "WorkbenchPageContribution",
      "CommandContribution",
      "AlgorithmElementDefinition",
      "WorkbenchModuleRegistry",
    ]) {
      expect(extensionText, interfaceName).toContain(interfaceName);
    }
  });
});
