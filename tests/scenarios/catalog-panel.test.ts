import { describe, expect, it, vi } from "vitest";
import { createBuiltinScenarioProvider } from "../../src/mentor/index.js";
import {
  createEmptyScenarioCatalog,
  createScenarioCatalogPanel,
  createScenarioCatalogStore,
} from "../../src/scenarios/index.js";

describe("scenario catalog panel", () => {
  it("renders builtins read-only, copies one, and saves validated project input fields", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const changes = vi.fn();
    const store = createScenarioCatalogStore({
      builtins: createBuiltinScenarioProvider(),
      document: createEmptyScenarioCatalog("100:source:one"),
      idFactory: {
        scenarioId: () => "copied-sorting",
        caseId: () => "new-input",
      },
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      onChange: changes,
    });
    const panel = createScenarioCatalogPanel(host as unknown as HTMLElement, {
      store,
      confirmDelete: () => true,
    });

    expect(findAction(host, "delete").disabled).toBe(true);
    expect(findAction(host, "save").disabled).toBe(true);
    findAction(host, "copy").click();

    expect(store.document.customScenarios).toHaveLength(1);
    expect(findAction(host, "delete").disabled).toBe(false);
    expect(findAction(host, "save").disabled).toBe(false);
    field(host, "stdin").value = "3\n3 2 1\n";
    field(host, "args（每行一项）").value = "--ascending\n--stable";
    field(host, "期望 stdout").value = "1 2 3\n";
    field(host, "期望结果说明").value = "ascending order";
    field(host, "目标分支 edge id（可空）").value = "edge.true";
    findTag(host, "form").dispatch("submit");

    const copied = store.document.customScenarios[0]!;
    expect(copied.cases[0]).toMatchObject({
      stdin: "3\n3 2 1\n",
      arguments: ["--ascending", "--stable"],
      expectedStdout: "1 2 3\n",
      explanation: "ascending order",
      targetBranchId: "edge.true",
    });
    expect(changes).toHaveBeenCalledTimes(2);
    panel.destroy();
    expect(host.children).toHaveLength(0);
  });

  it("keeps an invalid edit local and does not emit a persistence document", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const changes = vi.fn();
    const store = createScenarioCatalogStore({
      builtins: createBuiltinScenarioProvider(),
      document: createEmptyScenarioCatalog("100:source:one"),
      idFactory: {
        scenarioId: () => "copied-sorting",
        caseId: () => "new-input",
      },
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      onChange: changes,
    });
    createScenarioCatalogPanel(host as unknown as HTMLElement, { store });
    findAction(host, "copy").click();
    changes.mockClear();
    field(host, "目标分支 edge id（可空）").value = "not a valid edge id";
    findTag(host, "form").dispatch("submit");

    expect(changes).not.toHaveBeenCalled();
    expect(store.document.customScenarios[0]?.cases[0]?.targetBranchId).toBeNull();
    expect(flatText(host)).toContain("未保存");
  });

  it("switches all product UI, confirmations, and validation status to English", async () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const confirmations: string[] = [];
    const store = createScenarioCatalogStore({
      builtins: createBuiltinScenarioProvider(),
      document: createEmptyScenarioCatalog("100:source:one"),
      idFactory: {
        scenarioId: () => "copied-sorting",
        caseId: () => "new-input",
      },
      clock: { now: () => new Date("2026-07-12T00:00:00.000Z") },
      onChange: vi.fn(),
    });
    createScenarioCatalogPanel(host as unknown as HTMLElement, {
      store,
      confirmDelete(message) {
        confirmations.push(message);
        return true;
      },
    });

    host.dataset.locale = "en";
    host.dispatch("workbench-locale-change");
    expect(visibleText(host)).not.toMatch(/[\p{Script=Han}]/u);

    findAction(host, "copy").click();
    expect(visibleText(host)).not.toMatch(/[\p{Script=Han}]/u);
    field(host, "Target branch edge id (optional)").value = "not a valid edge id";
    findTag(host, "form").dispatch("submit");
    expect(flatText(host)).toContain("Not saved");
    expect(visibleText(host)).not.toMatch(/[\p{Script=Han}]/u);

    findAction(host, "delete").click();
    await Promise.resolve();
    expect(confirmations[0]).toMatch(/^Delete scenario/u);
    expect(confirmations[0]).not.toMatch(/[\p{Script=Han}]/u);
  });
});

function findAction(root: FakeElement, action: string): FakeElement {
  return find(root, (element) => element.dataset.scenarioAction === action);
}

function field(root: FakeElement, name: string): FakeElement {
  return find(root, (element) => element.dataset.scenarioField === name);
}

function findTag(root: FakeElement, tagName: string): FakeElement {
  return find(root, (element) => element.tagName === tagName);
}

function find(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement {
  if (predicate(root)) return root;
  for (const child of root.children) {
    try {
      return find(child, predicate);
    } catch {
      // Continue through siblings.
    }
  }
  throw new Error("element not found");
}

function flatText(root: FakeElement): string {
  return [root.textContent, ...root.children.map(flatText)].join(" ");
}

function visibleText(root: FakeElement): string {
  return [
    root.textContent,
    root.value,
    ...root.attributes.values(),
    ...root.children.map(visibleText),
  ].join(" ");
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

interface FakeEvent {
  preventDefault(): void;
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  parent: FakeElement | null = null;
  className = "";
  textContent = "";
  type = "";
  value = "";
  min = "";
  step = "";
  disabled = false;
  hidden = false;

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tagName: string,
  ) {}

  append(...children: FakeElement[]): void {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }

  prepend(...children: FakeElement[]): void {
    for (const child of children) child.parent = this;
    this.children.unshift(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.splice(0, this.children.length);
    this.append(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    if (this.disabled) return;
    const event = { preventDefault(): void {} };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  click(): void {
    this.dispatch("click");
  }

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}
