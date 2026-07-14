import { describe, expect, it, vi } from "vitest";
import { LIBRARY_ENTRIES } from "../../src/library/index.js";
import { createSoftwareLibrary, SOFTWARE_FEATURES } from "../../src/ui/software-library.js";

describe("software Library catalog", () => {
  it("covers the mainstream product surfaces without duplicate ids", () => {
    expect(new Set(SOFTWARE_FEATURES.map(({ id }) => id)).size).toBe(SOFTWARE_FEATURES.length);
    expect(SOFTWARE_FEATURES.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "dashboard",
        "projects",
        "sandboxes",
        "tests",
        "presets",
        "assembly",
        "source",
        "explanation",
        "editing",
        "run",
        "block-library",
        "storage",
        "extensions",
      ]),
    );
  });

  it("documents current capability, limits and concrete extension points for every feature", () => {
    for (const feature of SOFTWARE_FEATURES) {
      expect(feature.pageId.length, feature.id).toBeGreaterThan(0);
      expect(feature.targetId.length, feature.id).toBeGreaterThan(0);
      expect(feature.purpose.length, feature.id).toBeGreaterThan(10);
      expect(feature.currentCapability.length, feature.id).toBeGreaterThan(10);
      expect(feature.limitation.length, feature.id).toBeGreaterThan(6);
      expect(feature.extensionPoints.length, feature.id).toBeGreaterThan(0);
    }
  });

  it("routes every feature to an existing product surface target", () => {
    const existingRoutes = new Set([
      "dashboard:dashboard",
      "dashboard:project",
      "dashboard:sandbox",
      "dashboard:test",
      "build:preset-blocks",
      "build:assembly-canvas",
      "build:code-pane",
      "explanation:explanation",
      "edit:edit",
      "run:run",
      "block-library:block-library-create",
      "build:local-save",
      "software-library:software-library",
    ]);

    for (const feature of SOFTWARE_FEATURES) {
      expect(existingRoutes.has(`${feature.pageId}:${feature.targetId}`), feature.id).toBe(true);
    }
  });

  it("navigates Dock branches, legacy features, cross-dictionary entries and search results", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const onOpenFeature = vi.fn();
    const onStartGuidedLesson = vi.fn();
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature,
      onStartGuidedLesson,
    });

    expect(library.selectedBranchId).toBe("c-syntax");
    expect(library.selectedEntryId.startsWith("c.")).toBe(true);
    expect(walk(host).some((element) => element.textContent === "开始第一课")).toBe(false);
    library.selectBranch("manual");
    expect(library.selectedEntryId).toBe("manual.library");
    const startLesson = walk(host).find((element) => element.textContent === "开始第一课");
    if (startLesson === undefined) throw new Error("帮助首页缺少第一课入口");
    startLesson.emit("click");
    expect(onStartGuidedLesson).toHaveBeenCalledOnce();
    const developerDocs = walk(host).find((element) => element.textContent === "开发者文档");
    if (developerDocs === undefined) throw new Error("帮助首页缺少开发者文档入口");
    developerDocs.emit("click");
    expect(library.selectedEntryId).toBe("extension.registry");
    const developerSearch = walk(host).find((element) => element.type === "search");
    if (developerSearch === undefined) throw new Error("fixture 缺少 Library 搜索框");
    developerSearch.value = "sourceFingerprint viewport";
    developerSearch.emit("input");
    expect(library.selectedEntryId).toBe("canvas.view-state");
    library.selectBranch("library.algorithms");
    expect(library.selectedBranchId).toBe("algorithms-complexity");
    expect(library.selectedEntryId.startsWith("algorithms.")).toBe(true);
    library.selectEntry("c.pointers");
    expect(library.selectedBranchId).toBe("c-syntax");
    expect(library.selectedEntryId).toBe("c.pointers");
    library.select("run");
    expect(library.selectedFeatureId).toBe("run");
    expect(library.selectedEntryId).toBe("execution.toolchain");
    library.select("tests");
    const openTests = walk(host).find((element) => element.textContent === "打开测试");
    if (openTests === undefined) throw new Error("fixture 缺少兼容功能入口");
    openTests.emit("click");
    expect(onOpenFeature).toHaveBeenCalledWith("dashboard", "test");

    const search = walk(host).find((element) => element.type === "search");
    if (search === undefined) throw new Error("fixture 缺少 Library 搜索框");
    search.value = "memmove";
    search.emit("input");
    expect(library.selectedEntryId).toBe("std.memory");
    search.value = "renderer opaque revision";
    search.emit("input");
    expect(walk(host).some((element) => element.dataset.libraryEntryId === "manual.autosave")).toBe(
      false,
    );
    expect(() => library.selectBranch("missing")).toThrow(/未知 Library 分支/u);
    expect(() => library.selectEntry("missing")).toThrow(/未知 Library 条目/u);

    library.destroy();
    expect(host.children).toEqual([]);
  });

  it("puts guided tutorials first in Examples and renders actions with observable checks", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const onOpenFeature = vi.fn();
    const onStartGuidedLesson = vi.fn();
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature,
      onStartGuidedLesson,
    });

    library.selectBranch("examples");
    expect(library.selectedEntryId).toBe("tutorial.maximum-stream");
    const tutorialButtons = walk(host).filter((element) =>
      element.dataset.libraryEntryId?.startsWith("tutorial."),
    );
    expect(tutorialButtons.map((button) => button.dataset.libraryEntryId)).toEqual([
      "tutorial.maximum-stream",
      "tutorial.blocks-to-c",
      "tutorial.input-cases",
      "tutorial.debug-comparison",
      "tutorial.real-trace",
      "tutorial.complexity-growth",
      "tutorial.pointer-memory",
      "tutorial.failure-recovery",
    ]);
    expect(walk(host).some((element) => element.textContent === "入门路径")).toBe(true);
    expect(walk(host).some((element) => element.textContent === "更多案例")).toBe(true);
    for (const heading of ["你会完成", "通过方式", "可选先修"]) {
      expect(
        walk(host).some((element) => element.textContent === heading),
        heading,
      ).toBe(true);
    }
    expect(walk(host).some((element) => element.textContent === "操作步骤")).toBe(false);
    expect(walk(host).some((element) => element.textContent.startsWith("步骤 1 ·"))).toBe(false);
    expect(walk(host).some((element) => element.textContent === "通俗定义")).toBe(false);

    const startLesson = walk(host).find((element) => element.textContent === "开始交互课程");
    if (startLesson === undefined) throw new Error("找最大值词条缺少交互课程入口");
    expect(startLesson.dataset.guidedLessonId).toBe("lesson.first.maximum-scan");
    startLesson.emit("click");
    expect(onStartGuidedLesson).toHaveBeenCalledOnce();

    library.selectEntry("tutorial.blocks-to-c");
    expect(walk(host).some((element) => element.textContent === "操作步骤")).toBe(true);
    const openSource = walk(host).find(
      (element) => element.dataset.tutorialAction === "compare-source",
    );
    if (openSource === undefined) throw new Error("静态小教程缺少代码面板动作");
    openSource.emit("click");
    expect(onOpenFeature).toHaveBeenCalledWith("build", "code-pane");

    library.selectEntry("examples.binary-search");
    expect(walk(host).some((element) => element.textContent === "通俗定义")).toBe(true);
    const search = walk(host).find((element) => element.type === "search");
    if (search === undefined) throw new Error("fixture 缺少 Library 搜索框");
    search.value = "遮住输出";
    search.emit("input");
    expect(library.selectedEntryId).toBe("tutorial.input-cases");

    library.destroy();
  });

  it("rerenders Library chrome and details in place without losing query, filter or selection", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    host.dataset.locale = "zh-CN";
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature: vi.fn(),
      onStartGuidedLesson: vi.fn(),
    });

    library.selectBranch("library.algorithms");
    const search = walk(host).find((element) => element.type === "search");
    if (search === undefined) throw new Error("fixture 缺少 Library 搜索框");
    search.value = "binary search";
    search.emit("input");
    expect(library.selectedEntryId).toBe("algorithms.binary-search");

    host.dataset.locale = "en";
    host.emit("workbench-locale-change", { detail: { locale: "en" } });

    expect(search.value).toBe("binary search");
    expect(library.selectedBranchId).toBe("algorithms-complexity");
    expect(library.selectedEntryId).toBe("algorithms.binary-search");
    for (const heading of [
      "Plain-language definition",
      "Complexity",
      "Common mistakes",
      "Related concepts",
    ]) {
      expect(
        walk(host).some((element) => element.textContent === heading),
        heading,
      ).toBe(true);
    }
    expect(walk(host).some((element) => element.textContent === "Binary Search")).toBe(true);
    expect(search.placeholder).toBe("Search keywords, aliases or code");

    search.value = "no-entry-can-match-this";
    search.emit("input");
    expect(
      walk(host).some((element) => element.textContent === "No matching dictionary entries."),
    ).toBe(true);
    expect(library.selectedEntryId).toBe("algorithms.binary-search");

    search.value = "";
    search.emit("input");
    library.selectBranch("examples");
    for (const heading of [
      "What you will complete",
      "How completion is verified",
      "Optional prerequisites",
    ]) {
      expect(
        walk(host).some((element) => element.textContent === heading),
        heading,
      ).toBe(true);
    }
    expect(walk(host).some((element) => element.textContent === "Start interactive course")).toBe(
      true,
    );
    library.selectEntry("tutorial.blocks-to-c");
    expect(walk(host).some((element) => element.textContent === "Steps")).toBe(true);
    expect(walk(host).some((element) => element.textContent === "Place the basic blocks")).toBe(
      false,
    );
    expect(
      walk(host).some((element) => element.textContent === "Step 1 · Place the basic blocks"),
    ).toBe(true);
    expect(walk(host).some((element) => element.textContent === "Completion checks")).toBe(true);

    host.dataset.locale = "zh-CN";
    host.emit("workbench-locale-change", { detail: { locale: "zh-CN" } });
    expect(library.selectedEntryId).toBe("tutorial.blocks-to-c");
    expect(walk(host).some((element) => element.textContent === "操作步骤")).toBe(true);
    expect(walk(host).some((element) => element.textContent === "步骤 1 · 拖入基础积木")).toBe(
      true,
    );

    library.destroy();
  });

  it("never exposes Chinese entry or tutorial copy through the English visible surface", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    host.dataset.locale = "en";
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature: vi.fn(),
      onStartGuidedLesson: vi.fn(),
    });

    for (const entry of LIBRARY_ENTRIES) {
      library.selectEntry(entry.id);
      expect(visibleLibraryCopy(host), entry.id).not.toMatch(/[\u3400-\u9fff]/u);
    }
    for (const feature of SOFTWARE_FEATURES) {
      library.select(feature.id);
      expect(visibleLibraryCopy(host), feature.id).not.toMatch(/[\u3400-\u9fff]/u);
    }

    library.destroy();
  });

  it("ships complete reviewed English copy for every tutorial step and artifact", () => {
    const tutorials = LIBRARY_ENTRIES.filter(
      (entry): entry is typeof entry & { readonly tutorial: NonNullable<typeof entry.tutorial> } =>
        entry.tutorial !== null && entry.tutorial !== undefined,
    );
    expect(tutorials).toHaveLength(8);

    for (const entry of tutorials) {
      const source = entry.tutorial;
      const english = entry.localizations?.en;
      const localizedTutorial = english?.tutorial;
      expect(english?.title, `${entry.id}.title`).toBeTruthy();
      expect(english?.summary, `${entry.id}.summary`).toBeTruthy();
      expect(english?.details?.length, `${entry.id}.details`).toBeGreaterThanOrEqual(2);
      expect(localizedTutorial?.learningGoals?.length, `${entry.id}.goals`).toBe(
        source.learningGoals.length,
      );
      expect(localizedTutorial?.completionChecks?.length, `${entry.id}.checks`).toBe(
        source.completionChecks.length,
      );
      for (const step of source.steps) {
        const localizedStep = localizedTutorial?.steps?.[step.id];
        expect(localizedStep?.title, `${entry.id}.${step.id}.title`).toBeTruthy();
        expect(localizedStep?.instruction, `${entry.id}.${step.id}.instruction`).toBeTruthy();
        expect(localizedStep?.check, `${entry.id}.${step.id}.check`).toBeTruthy();
        expect(localizedStep?.artifactExamples?.length, `${entry.id}.${step.id}.artifacts`).toBe(
          step.artifacts.length,
        );
        if (step.featureLink !== null) {
          expect(
            localizedStep?.featureLinkLabel,
            `${entry.id}.${step.id}.featureLink`,
          ).toBeTruthy();
        }
      }
    }
  });
});

class FakeClassList {
  readonly #values = new Set<string>();

  toggle(value: string, force?: boolean): boolean {
    const enabled = force ?? !this.#values.has(value);
    if (enabled) this.#values.add(value);
    else this.#values.delete(value);
    return enabled;
  }
}

class FakeElement {
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  readonly #listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly #attributes = new Map<string, string>();
  parent: FakeElement | null = null;
  className = "";
  textContent = "";
  type = "";
  value = "";
  placeholder = "";
  title = "";

  constructor(ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.splice(0, this.children.length);
    this.append(...children);
  }

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

class FakeDocument {
  createElement(_tagName: string): FakeElement {
    return new FakeElement(this);
  }
}

function walk(root: FakeElement): readonly FakeElement[] {
  return [root, ...root.children.flatMap((child) => walk(child))];
}

function visibleLibraryCopy(host: FakeElement): string {
  return walk(host)
    .flatMap((element) => [element.textContent, element.title, element.placeholder])
    .join("\n");
}
