import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createLearningCatalog, type LearningCatalog } from "../../src/learning/index.js";
import {
  createBlockLibraryManager,
  createCustomTemplateId,
  type BlockLibraryManagerCallbacks,
} from "../../src/ui/block-library-manager.js";

const managerSource = readFileSync(
  new URL("../../src/ui/block-library-manager.ts", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(new URL("../../src/style.css", import.meta.url), "utf8");

describe("block library manager", () => {
  it("renders builtin, active, deprecated and retired entries with distinct controls", () => {
    const catalog = createFixtureCatalog();
    createCustom(catalog, "custom.active", "启用积木");
    createCustom(catalog, "custom.deprecated", "弃用积木");
    catalog.deprecateCustom("custom.deprecated", { reason: "测试弃用" });
    createCustom(catalog, "custom.retired", "退休积木");
    catalog.deprecateCustom("custom.retired", { reason: "准备退休" });
    catalog.retireCustom("custom.retired", { reason: "测试退休" });

    const { host, manager } = createFixtureManager(catalog);
    const root = manager.element as unknown as FakeElement;

    expect(byEntryId(root, "builtin.print").dataset.origin).toBe("builtin");
    expect(treeText(byEntryId(root, "builtin.print"))).toContain("内置 · 只读");
    expect(actionsWithin(byEntryId(root, "builtin.print"))).toHaveLength(0);

    expect(byEntryId(root, "custom.active").dataset.lifecycle).toBe("active");
    expect(action(root, "custom.active", "deprecate").textContent).toBe("弃用");
    expect(byEntryId(root, "custom.deprecated").dataset.lifecycle).toBe("deprecated");
    expect(action(root, "custom.deprecated", "reactivate").textContent).toBe("恢复");
    expect(action(root, "custom.deprecated", "retire").textContent).toBe("退休");
    expect(byEntryId(root, "custom.retired").dataset.lifecycle).toBe("retired");
    expect(treeText(byEntryId(root, "custom.retired"))).toContain("已生成 C 源码保持不变");
    expect(actionsWithin(byEntryId(root, "custom.retired"))).toHaveLength(0);
    expect(host.children).toContain(root);
  });

  it("validates source before creating a custom.* template", () => {
    const catalog = createFixtureCatalog();
    let valid = false;
    const validateSource = vi.fn(() => {
      if (!valid) throw new Error("C 片段语法错误");
      return { fragmentKind: "statement" as const };
    });
    const idFactory = vi.fn(() => "Fixed ID");
    const onCatalogChange = vi.fn<BlockLibraryManagerCallbacks["onCatalogChange"]>();
    const { manager } = createFixtureManager(catalog, {
      validateSource,
      idFactory,
      onCatalogChange,
    });
    const root = manager.element as unknown as FakeElement;
    field(root, "积木名称").value = "递增";
    field(root, "学习阶段").value = "c.basics";
    field(root, "分类").value = "practice";
    field(root, "C 源码片段").value = "  count++;  ";

    form(root).dispatch("submit");

    expect(catalog.getEntry("custom.fixed-id")).toBeNull();
    expect(idFactory).not.toHaveBeenCalled();
    expect(onCatalogChange).not.toHaveBeenCalled();
    expect(status(root).dataset.state).toBe("error");
    expect(status(root).textContent).toContain("C 片段语法错误");

    valid = true;
    form(root).dispatch("submit");

    const created = catalog.getEntry("custom.fixed-id");
    expect(created).toMatchObject({
      kind: "template",
      origin: "custom",
      lifecycle: "active",
      source: "  count++;  ",
      fragmentKind: "statement",
    });
    expect(idFactory).toHaveBeenCalledOnce();
    expect(onCatalogChange).toHaveBeenCalledOnce();
    expect(onCatalogChange.mock.calls[0]?.[0]).toEqual(catalog.snapshot());
    expect(status(root).dataset.state).toBe("success");
    expect(byEntryId(root, "custom.fixed-id")).toBeDefined();
  });

  it("supports deprecate, reactivate and confirmed retirement without deleting generated C", async () => {
    const catalog = createFixtureCatalog();
    createCustom(catalog, "custom.lifecycle", "生命周期积木");
    let confirmation = false;
    const confirmRetire = vi.fn<BlockLibraryManagerCallbacks["confirmRetire"]>(() => confirmation);
    const onCatalogChange = vi.fn<BlockLibraryManagerCallbacks["onCatalogChange"]>();
    const { manager } = createFixtureManager(catalog, { confirmRetire, onCatalogChange });
    const root = manager.element as unknown as FakeElement;

    action(root, "custom.lifecycle", "deprecate").click();
    expect(catalog.getEntry("custom.lifecycle")).toMatchObject({ lifecycle: "deprecated" });
    action(root, "custom.lifecycle", "reactivate").click();
    expect(catalog.getEntry("custom.lifecycle")).toMatchObject({ lifecycle: "active" });
    action(root, "custom.lifecycle", "deprecate").click();
    const changesBeforeCancel = onCatalogChange.mock.calls.length;

    action(root, "custom.lifecycle", "retire").click();
    await flushMicrotasks();
    expect(catalog.getEntry("custom.lifecycle")).toMatchObject({ lifecycle: "deprecated" });
    expect(onCatalogChange).toHaveBeenCalledTimes(changesBeforeCancel);
    expect(status(root).textContent).toContain("已取消");

    confirmation = true;
    action(root, "custom.lifecycle", "retire").click();
    await flushMicrotasks();

    expect(confirmRetire).toHaveBeenCalledTimes(2);
    expect(confirmRetire.mock.calls[1]?.[0]).toContain("不会删除已生成 C 源码");
    expect(catalog.getEntry("custom.lifecycle")).toMatchObject({
      kind: "tombstone",
      lifecycle: "retired",
    });
    expect(onCatalogChange).toHaveBeenCalledTimes(changesBeforeCancel + 1);
    expect(treeText(byEntryId(root, "custom.lifecycle"))).toContain("已生成 C 源码保持不变");
  });

  it("refreshes external changes, exposes status and destroys idempotently", () => {
    const catalog = createFixtureCatalog();
    const { host, manager } = createFixtureManager(catalog);
    const root = manager.element as unknown as FakeElement;
    manager.setStatus("等待验证", "ready");
    expect(status(root).textContent).toBe("等待验证");
    expect(status(root).dataset.state).toBe("ready");

    createCustom(catalog, "custom.external", "外部新增");
    expect(optionalEntry(root, "custom.external")).toBeUndefined();
    manager.refresh();
    expect(byEntryId(root, "custom.external")).toBeDefined();

    manager.destroy();
    manager.destroy();
    expect(host.children).not.toContain(root);
    expect(() => manager.refresh()).toThrow("BlockLibraryManager 已销毁");
    expect(() => manager.setStatus("无效")).toThrow("BlockLibraryManager 已销毁");
  });

  it("uses stable ids and never injects catalog strings as markup", () => {
    expect(createCustomTemplateId("CUSTOM. Alpha / Beta ")).toBe("custom.alpha-beta");
    expect(createCustomTemplateId("123e4567-e89b-12d3-a456-426614174000")).toBe(
      "custom.123e4567-e89b-12d3-a456-426614174000",
    );
    expect(managerSource).toContain("crypto.randomUUID()");
    expect(managerSource).toContain("textContent = entry.label");
    expect(managerSource).not.toContain("innerHTML");
  });

  it("renders English chrome, empty states, and lifecycle operations without translating user data", async () => {
    const catalog = createLearningCatalog({
      stages: [
        {
          id: "c.basics",
          version: "1.0.0",
          label: "C 基础",
          order: 1,
          prerequisites: [],
          description: "基础阶段",
        },
      ],
      builtinTemplates: [],
    });
    const userLabel = "用户积木";
    const userSource = "/* 中文源码 */ value++;";
    catalog.createCustom({
      id: "custom.user-content",
      version: "1.0.0",
      label: userLabel,
      category: "practice",
      stage: "c.basics",
      source: userSource,
      description: "用户说明",
      fragmentKind: "statement",
    });
    const confirmRetire = vi.fn<BlockLibraryManagerCallbacks["confirmRetire"]>(() => true);
    const { manager } = createFixtureManager(catalog, { locale: "en", confirmRetire });
    const root = manager.element as unknown as FakeElement;

    expect(root.getAttribute("aria-label")).toBe("Custom block management");
    expect(field(root, "Block name").placeholder).toBe("For example: Swap two variables");
    expect(field(root, "Learning stage").children[0]?.textContent).toBe("C Basics");
    expect(field(root, "C source fragment").placeholder).toBe("For example: swap(&a, &b);");
    expect(status(root).textContent).toBe("Catalog ready.");
    expect(action(root, "custom.user-content", "deprecate").textContent).toBe("Deprecate");
    expect(treeText(byEntryId(root, "custom.user-content"))).toContain(userLabel);
    expect(treeText(byEntryId(root, "custom.user-content"))).toContain(userSource);

    expectWithoutUserContent(visibleInterfaceStrings(root), [userLabel, userSource]);

    action(root, "custom.user-content", "deprecate").click();
    expect(status(root).textContent).toBe(`Deprecated “${userLabel}”.`);
    expect(action(root, "custom.user-content", "reactivate").textContent).toBe("Reactivate");
    expect(action(root, "custom.user-content", "retire").textContent).toBe("Retire");
    expectWithoutUserContent(visibleInterfaceStrings(root), [userLabel, userSource]);

    action(root, "custom.user-content", "retire").click();
    await flushMicrotasks();

    expect(confirmRetire).toHaveBeenCalledWith(
      `Retire “${userLabel}”? This removes the custom block definition but keeps generated C source.`,
      expect.objectContaining({ id: "custom.user-content" }),
    );
    expect(status(root).textContent).toBe(
      `Retired “${userLabel}”; generated C source remains unchanged.`,
    );
    expect(treeText(byEntryId(root, "custom.user-content"))).toContain(
      "Definition removed; generated C source remains unchanged.",
    );
    expectWithoutUserContent(visibleInterfaceStrings(root), [userLabel]);
  });

  it("localizes form validation and creation while keeping submitted names and source verbatim", () => {
    const catalog = createFixtureCatalog();
    const userLabel = "中文名称";
    const userSource = "/* 中文注释 */ count++;";
    const { manager } = createFixtureManager(catalog, {
      locale: "en",
      idFactory: () => "English Form",
    });
    const root = manager.element as unknown as FakeElement;

    form(root).dispatch("submit");
    expect(status(root).textContent).toBe(
      "Complete the name, stage, category, and C source fields.",
    );

    field(root, "Block name").value = userLabel;
    field(root, "Learning stage").value = "c.basics";
    field(root, "Category").value = "practice";
    field(root, "C source fragment").value = userSource;
    form(root).dispatch("submit");

    expect(status(root).textContent).toBe(`Created “${userLabel}”.`);
    expect(catalog.getEntry("custom.english-form")).toMatchObject({
      label: userLabel,
      source: userSource,
      description: `Custom block: ${userLabel}`,
    });
    expect(treeText(byEntryId(root, "custom.english-form"))).toContain(userLabel);
    expect(treeText(byEntryId(root, "custom.english-form"))).toContain(userSource);
  });

  it("relocalizes generated status and controls while preserving literal external status", () => {
    const catalog = createFixtureCatalog();
    createCustom(catalog, "custom.locale", "保留名称");
    const { host, manager } = createFixtureManager(catalog);
    const root = manager.element as unknown as FakeElement;

    action(root, "custom.locale", "deprecate").click();
    expect(status(root).textContent).toBe("已弃用“保留名称”。");

    host.dataset.locale = "en";
    host.dispatch("workbench-locale-change");
    expect(status(root).textContent).toBe("Deprecated “保留名称”.");
    expect(root.getAttribute("aria-label")).toBe("Custom block management");
    expect(action(root, "custom.locale", "reactivate").textContent).toBe("Reactivate");

    manager.setStatus("外部状态原文", "ready");
    host.dataset.locale = "zh-CN";
    host.dispatch("workbench-locale-change");
    host.dataset.locale = "en";
    host.dispatch("workbench-locale-change");
    expect(status(root).textContent).toBe("外部状态原文");
  });

  it("uses semantic theme tokens for every block manager surface", () => {
    const start = styleSource.indexOf(".block-library-manager {");
    const end = styleSource.indexOf("@media (max-width: 1000px)", start);
    const managerStyles = styleSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(managerStyles).toContain("background: var(--surface);");
    expect(managerStyles).toContain("background: var(--input-surface);");
    expect(managerStyles).toContain("background: var(--surface-raised);");
    expect(managerStyles).not.toMatch(/(?:background|color|border-color):\s*(?:#|rgb|hsl)/u);
  });
});

function createFixtureCatalog(): LearningCatalog {
  return createLearningCatalog({
    stages: [
      {
        id: "c.basics",
        version: "1.0.0",
        label: "C 基础",
        order: 1,
        prerequisites: [],
        description: "基础阶段",
      },
    ],
    builtinTemplates: [
      {
        id: "builtin.print",
        version: "1.0.0",
        label: "打印整数",
        category: "io",
        stage: "c.basics",
        source: 'printf("%d\\n", value);',
        description: "内置只读积木",
        fragmentKind: "statement",
      },
    ],
  });
}

function createCustom(catalog: LearningCatalog, id: string, label: string): void {
  catalog.createCustom({
    id,
    version: "1.0.0",
    label,
    category: "practice",
    stage: "c.basics",
    source: "value++;",
    description: "测试自定义积木",
    fragmentKind: "statement",
  });
}

interface FixtureOverrides {
  readonly validateSource?: BlockLibraryManagerCallbacks["validateSource"];
  readonly confirmRetire?: BlockLibraryManagerCallbacks["confirmRetire"];
  readonly onCatalogChange?: BlockLibraryManagerCallbacks["onCatalogChange"];
  readonly idFactory?: BlockLibraryManagerCallbacks["idFactory"];
  readonly locale?: "zh-CN" | "en";
}

function createFixtureManager(catalog: LearningCatalog, overrides: FixtureOverrides = {}) {
  const ownerDocument = new FakeDocument();
  const host = ownerDocument.createElement("div");
  host.dataset.locale = overrides.locale ?? "zh-CN";
  const manager = createBlockLibraryManager(host as unknown as HTMLElement, catalog, {
    validateSource: overrides.validateSource ?? (() => ({ fragmentKind: "statement" })),
    confirmRetire: overrides.confirmRetire ?? (() => false),
    onCatalogChange: overrides.onCatalogChange ?? vi.fn(),
    ...(overrides.idFactory === undefined ? {} : { idFactory: overrides.idFactory }),
  });
  return { host, manager };
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

type FakeListener = (event: Event) => void;

class FakeElement {
  readonly ownerDocument: FakeDocument;
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Set<FakeListener>>();
  parentElement: FakeElement | null = null;
  className = "";
  textContent = "";
  value = "";
  type = "";
  placeholder = "";
  required = false;
  disabled = false;
  rows = 0;

  constructor(ownerDocument: FakeDocument, tagName: string) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null;
    this.children.length = 0;
    this.append(...children);
  }

  remove(): void {
    if (this.parentElement === null) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const callback = listener as FakeListener;
    const listeners = this.listeners.get(type) ?? new Set<FakeListener>();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as FakeListener);
  }

  dispatch(type: string): void {
    let defaultPrevented = false;
    const event = {
      type,
      target: this,
      currentTarget: this,
      preventDefault: () => {
        defaultPrevented = true;
      },
      get defaultPrevented() {
        return defaultPrevented;
      },
    } as unknown as Event;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  click(): void {
    if (!this.disabled) this.dispatch("click");
  }
}

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(walk)];
}

function field(root: FakeElement, ariaLabel: string): FakeElement {
  const result = walk(root).find((element) => element.getAttribute("aria-label") === ariaLabel);
  if (result === undefined) throw new Error(`找不到字段：${ariaLabel}`);
  return result;
}

function form(root: FakeElement): FakeElement {
  const result = walk(root).find((element) => element.tagName === "FORM");
  if (result === undefined) throw new Error("找不到表单");
  return result;
}

function status(root: FakeElement): FakeElement {
  const result = walk(root).find((element) => element.tagName === "OUTPUT");
  if (result === undefined) throw new Error("找不到状态区");
  return result;
}

function optionalEntry(root: FakeElement, id: string): FakeElement | undefined {
  return walk(root).find((element) => element.dataset.libraryEntryId === id);
}

function byEntryId(root: FakeElement, id: string): FakeElement {
  const result = optionalEntry(root, id);
  if (result === undefined) throw new Error(`找不到积木：${id}`);
  return result;
}

function actionsWithin(root: FakeElement): FakeElement[] {
  return walk(root).filter((element) => element.dataset.operation !== undefined);
}

function action(root: FakeElement, id: string, operation: string): FakeElement {
  const result = walk(root).find(
    (element) => element.dataset.entryId === id && element.dataset.operation === operation,
  );
  if (result === undefined) throw new Error(`找不到操作：${id}/${operation}`);
  return result;
}

function treeText(root: FakeElement): string {
  return walk(root)
    .map((element) => element.textContent)
    .join(" ");
}

function visibleInterfaceStrings(root: FakeElement): readonly string[] {
  return walk(root).flatMap((element) =>
    [element.textContent, element.placeholder, element.getAttribute("aria-label") ?? ""].filter(
      (value) => value.length > 0,
    ),
  );
}

function expectWithoutUserContent(values: readonly string[], userContent: readonly string[]): void {
  const staticText = userContent.reduce(
    (text, content) => text.replaceAll(content, ""),
    values.join("\n"),
  );
  expect(staticText).not.toMatch(/[\u3400-\u9fff]/u);
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
