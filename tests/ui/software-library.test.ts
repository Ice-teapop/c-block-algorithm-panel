import { describe, expect, it, vi } from "vitest";
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
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature,
      onStartTour: vi.fn(),
    });

    expect(library.selectedBranchId).toBe("manual");
    expect(library.selectedEntryId).toBe("manual.dashboard");
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
    expect(() => library.selectBranch("missing")).toThrow(/未知 Library 分支/u);
    expect(() => library.selectEntry("missing")).toThrow(/未知 Library 条目/u);

    library.destroy();
    expect(host.children).toEqual([]);
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
  readonly #listeners = new Map<string, Set<() => void>>();
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

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of this.#listeners.get(type) ?? []) listener();
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
