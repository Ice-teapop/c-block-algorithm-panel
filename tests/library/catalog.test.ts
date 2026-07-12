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
      expect(["learner", "help", "developer"]).toContain(entry.audience);
      expect(Object.isFrozen(entry.pitfalls), entry.id).toBe(true);
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
    expect(getLibraryEntry("c.statement")?.syntax).not.toBeNull();
    expect(getLibraryEntry("algorithms.binary-search")?.complexity).toContain("O(");
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

  it("publishes one immutable eight-part beginner tutorial path inside Examples", () => {
    const tutorials = LIBRARY_ENTRIES.filter(
      (entry) => entry.tutorial?.pathId === "beginner-core",
    ).sort((left, right) => left.tutorial!.order - right.tutorial!.order);
    expect(tutorials.map((entry) => entry.id)).toEqual([
      "tutorial.maximum-stream",
      "tutorial.blocks-to-c",
      "tutorial.input-cases",
      "tutorial.debug-comparison",
      "tutorial.real-trace",
      "tutorial.complexity-growth",
      "tutorial.pointer-memory",
      "tutorial.failure-recovery",
    ]);
    expect(tutorials.map((entry) => entry.tutorial?.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const entry of tutorials) {
      const tutorial = entry.tutorial;
      if (tutorial === null || tutorial === undefined) throw new Error(entry.id);
      expect(entry.branchId, entry.id).toBe("examples");
      expect(entry.audience, entry.id).toBe("learner");
      expect(tutorial.estimatedMinutes, entry.id).toBeGreaterThan(0);
      expect(tutorial.steps.length, entry.id).toBeGreaterThanOrEqual(2);
      expect(tutorial.learningGoals.length, entry.id).toBeGreaterThan(0);
      expect(tutorial.completionChecks.length, entry.id).toBeGreaterThan(0);
      expect(new Set(tutorial.steps.map(({ id }) => id)).size, entry.id).toBe(
        tutorial.steps.length,
      );
      expect(Object.isFrozen(tutorial), entry.id).toBe(true);
      expect(Object.isFrozen(tutorial.prerequisiteEntryIds), entry.id).toBe(true);
      expect(Object.isFrozen(tutorial.learningGoals), entry.id).toBe(true);
      expect(Object.isFrozen(tutorial.steps), entry.id).toBe(true);
      expect(Object.isFrozen(tutorial.completionChecks), entry.id).toBe(true);
      for (const prerequisiteId of tutorial.prerequisiteEntryIds) {
        expect(getLibraryEntry(prerequisiteId), `${entry.id} -> ${prerequisiteId}`).not.toBeNull();
      }
      for (const step of tutorial.steps) {
        expect(Object.isFrozen(step), `${entry.id}:${step.id}`).toBe(true);
        expect(Object.isFrozen(step.artifacts), `${entry.id}:${step.id}`).toBe(true);
        for (const artifact of step.artifacts) {
          expect(Object.isFrozen(artifact), `${entry.id}:${step.id}`).toBe(true);
          expect(Object.isFrozen(artifact.example), `${entry.id}:${step.id}`).toBe(true);
        }
        if (step.featureLink !== null) {
          expect(Object.isFrozen(step.featureLink), `${entry.id}:${step.id}`).toBe(true);
        }
      }
    }
  });

  it("keeps tutorial copy learner-facing and links only to real product targets", () => {
    const allowedRoutes = new Set([
      "build:preset-blocks",
      "build:assembly-canvas",
      "build:code-pane",
      "run:runtime-flow",
      "analysis:analysis",
      "explanation:explanation",
      "edit:edit",
    ]);
    const tutorials = LIBRARY_ENTRIES.filter(
      (entry) => entry.tutorial !== null && entry.tutorial !== undefined,
    );
    for (const entry of tutorials) {
      const tutorial = entry.tutorial!;
      const learnerText = [
        entry.title,
        entry.summary,
        ...entry.details,
        ...tutorial.learningGoals,
        ...tutorial.completionChecks,
        ...tutorial.steps.flatMap((step) => [
          step.title,
          step.instruction,
          step.check,
          ...step.artifacts.flatMap((artifact) => [
            artifact.example.caption,
            artifact.example.code,
          ]),
        ]),
      ].join(" ");
      expect(learnerText, entry.id).not.toMatch(
        /renderer|opaque|revision|fingerprint|sidecar|\bCFG\b|Tree-sitter|\braw\b|\bpartial\b/u,
      );
      for (const link of [entry.featureLink, ...tutorial.steps.map((step) => step.featureLink)]) {
        if (link === null) continue;
        expect(allowedRoutes.has(`${link.pageId}:${link.targetId}`), entry.id).toBe(true);
      }
    }
  });

  it("teaches a complete streaming maximum program and its three required observations", () => {
    const entry = getLibraryEntry("tutorial.maximum-stream");
    if (entry?.tutorial === null || entry?.tutorial === undefined) {
      throw new Error("找最大值教程缺失");
    }
    const source = entry.example?.code ?? "";
    expect(source).toContain('scanf("%zu", &count)');
    expect(source).toContain('scanf("%d", &maximum)');
    expect(source).toContain("for (size_t i = 1; i < count; i++)");
    expect(source).toContain("if (value > maximum)");
    expect(source).not.toContain("maximum = 0");
    expect(entry.tutorial.guidedLessonId).toBe("lesson.first.maximum-scan");
    expect(
      LIBRARY_ENTRIES.filter((candidate) => candidate.tutorial?.guidedLessonId !== undefined).map(
        (candidate) => candidate.id,
      ),
    ).toEqual(["tutorial.maximum-stream"]);
    const artifactText = entry.tutorial.steps
      .flatMap((step) => step.artifacts.map((artifact) => artifact.example.code))
      .join("\n");
    expect(artifactText).toContain("4\n3 7 2 5\n");
    expect(artifactText).toContain("3\n-9 -4 -12\n");
    expect(artifactText).toContain("1\n42\n");
    expect(artifactText).toContain("7\n");
    expect(artifactText).toContain("-4\n");
    expect(artifactText).toContain("42\n");
  });
});
