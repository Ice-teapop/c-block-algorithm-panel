import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBlockIndex,
  textRange,
  type Block,
  type BlockIndex,
  type BlockIndexEntry,
  type SourceDoc,
} from "../../src/core/index.js";
import { createBlockTree } from "../../src/ui/block-tree.js";

describe("block tree interaction gate", () => {
  let fakeDocument: FakeDocument;

  beforeEach(() => {
    fakeDocument = new FakeDocument();
    vi.stubGlobal("window", { document: fakeDocument });
    vi.stubGlobal("Node", FakeElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mirrors disabled interaction onto inert, aria-disabled and draggability", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn());
    tree.setDocument(document, index);
    const statement = buttonFor(host, "expression_statement");

    expect(statement.draggable).toBe(true);
    tree.setInteractionEnabled(false);
    expect(host.inert).toBe(true);
    expect(host.attribute("aria-disabled")).toBe("true");
    expect(statement.draggable).toBe(false);

    tree.setInteractionEnabled(true);
    expect(host.inert).toBe(false);
    expect(host.attribute("aria-disabled")).toBeUndefined();
    expect(statement.draggable).toBe(true);
  });

  it("only enables indexed statement and declaration cards when a move callback exists", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn());
    tree.setDocument(document, index);

    expect(buttonFor(host, "declaration").draggable).toBe(true);
    expect(buttonFor(host, "expression_statement").draggable).toBe(true);
    expect(buttonFor(host, "return_statement").draggable).toBe(true);
    expect(buttonFor(host, "function_definition").draggable).toBe(false);
    expect(buttonFor(host, "raw").draggable).toBe(false);

    const legacyHost = fakeDocument.createElement("div");
    const legacyTree = createBlockTree(legacyHost as unknown as HTMLElement, vi.fn());
    legacyTree.setDocument(document, index);
    expect(
      legacyHost
        .querySelectorAll<FakeElement>("[data-block-index]")
        .every((card) => !card.draggable),
    ).toBe(true);
  });

  it("moves between two cards only after an internal dragstart", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const onMove = vi.fn<(source: BlockIndexEntry, target: BlockIndexEntry) => void>();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), onMove);
    tree.setDocument(document, index);
    const source = buttonFor(host, "expression_statement");
    const target = buttonFor(host, "return_statement");
    const transfer = new FakeDataTransfer();

    host.emit("dragstart", source, { dataTransfer: transfer });
    expect(source.classList.contains("is-dragging")).toBe(true);
    expect(transfer.effectAllowed).toBe("move");
    expect(transfer.setData).toHaveBeenCalledWith("text/plain", "c-block-tree-item");

    const dragOver = host.emit("dragover", target, { dataTransfer: transfer });
    expect(dragOver.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("move");
    expect(target.classList.contains("is-drop-target")).toBe(true);

    const targetChild = target.children[0];
    if (targetChild === undefined) throw new Error("target card has no child");
    host.emit("dragleave", target, { relatedTarget: targetChild });
    expect(target.classList.contains("is-drop-target")).toBe(true);
    host.emit("dragleave", target);
    expect(target.classList.contains("is-drop-target")).toBe(false);
    host.emit("dragover", target, { dataTransfer: transfer });

    const drop = host.emit("drop", target, { dataTransfer: transfer });
    expect(drop.defaultPrevented).toBe(true);
    expect(onMove).toHaveBeenCalledOnce();
    expect(onMove).toHaveBeenCalledWith(entryFor(index, source), entryFor(index, target));
    expect(source.classList.contains("is-dragging")).toBe(false);
    expect(target.classList.contains("is-drop-target")).toBe(false);
  });

  it("does not trust an external dataTransfer payload as a source index", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const onMove = vi.fn();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), onMove);
    tree.setDocument(document, index);
    const target = buttonFor(host, "return_statement");
    const transfer = new FakeDataTransfer();
    transfer.getData = vi.fn(() => "2");

    const dragOver = host.emit("dragover", target, { dataTransfer: transfer });
    const drop = host.emit("drop", target, { dataTransfer: transfer });

    expect(dragOver.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    expect(transfer.getData).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
  });

  it("inserts a catalog template only through an internal template drag session", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const onInsert = vi.fn();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn(), onInsert);
    tree.setDocument(document, index);
    const target = buttonFor(host, "return_statement");
    const slot = slotFor(host, target.dataset.blockIndex ?? "", "before");
    const transfer = new FakeDataTransfer();
    transfer.getData = vi.fn(() => "builtin.control.for");

    expect(host.emit("dragover", slot, { dataTransfer: transfer }).defaultPrevented).toBe(false);
    host.emit("drop", slot, { dataTransfer: transfer });
    expect(onInsert).not.toHaveBeenCalled();
    expect(transfer.getData).not.toHaveBeenCalled();

    tree.setTemplateDrag("builtin.control.for");
    expect(host.dataset.templateDrag).toBe("true");
    const over = host.emit("dragover", slot, { dataTransfer: transfer });
    expect(over.defaultPrevented).toBe(true);
    expect(transfer.dropEffect).toBe("copy");
    expect(slot.classList.contains("is-template-drop-target")).toBe(true);

    const drop = host.emit("drop", slot, { dataTransfer: transfer });
    expect(drop.defaultPrevented).toBe(true);
    expect(onInsert).toHaveBeenCalledOnce();
    expect(onInsert).toHaveBeenCalledWith({
      templateId: "builtin.control.for",
      target: entryFor(index, target),
      position: "before",
    });
    expect(host.dataset.templateDrag).toBeUndefined();
    expect(slot.classList.contains("is-template-drop-target")).toBe(false);
  });

  it("only activates structural slots accepted by the dragged C block", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const onInsert = vi.fn();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn(), onInsert);
    tree.setDocument(document, index);
    const target = buttonFor(host, "return_statement");
    const slot = slotFor(host, target.dataset.blockIndex ?? "", "before");

    expect(slot.dataset.syntaxSlot).toBe("function-body");
    tree.setTemplateDrag("builtin.control.continue", ["loop-body"]);
    expect(
      host.emit("dragover", slot, { dataTransfer: new FakeDataTransfer() }).defaultPrevented,
    ).toBe(false);
    expect(onInsert).not.toHaveBeenCalled();

    tree.setTemplateDrag("builtin.c.print-integer", ["function-body"]);
    expect(
      host.emit("dragover", slot, { dataTransfer: new FakeDataTransfer() }).defaultPrevented,
    ).toBe(true);
  });

  it("uses enclosing control capabilities for break and continue inside nested compounds", () => {
    const { document, index } = nestedLoopFixture();
    const host = fakeDocument.createElement("div");
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn(), vi.fn());
    tree.setDocument(document, index);
    const nestedStatement = buttonFor(host, "expression_statement");
    const nestedSlot = slotFor(host, nestedStatement.dataset.blockIndex ?? "", "before");
    const outsideReturn = buttonFor(host, "return_statement");
    const outsideSlot = slotFor(host, outsideReturn.dataset.blockIndex ?? "", "before");
    const allStatementSlots = [
      "function-body",
      "compound-body",
      "loop-body",
      "switch-case",
    ] as const;

    expect(nestedSlot.dataset.syntaxSlot).toBe("compound-body");
    expect(nestedSlot.dataset.syntaxAncestorCapabilities).toContain("loop");
    tree.setTemplateDrag("builtin.control.continue", allStatementSlots, ["loop"]);
    expect(
      host.emit("dragover", nestedSlot, { dataTransfer: new FakeDataTransfer() }).defaultPrevented,
    ).toBe(true);
    expect(
      host.emit("dragover", outsideSlot, { dataTransfer: new FakeDataTransfer() }).defaultPrevented,
    ).toBe(false);

    tree.setTemplateDrag("builtin.control.break", allStatementSlots, ["loop", "switch"]);
    expect(
      host.emit("dragover", nestedSlot, { dataTransfer: new FakeDataTransfer() }).defaultPrevented,
    ).toBe(true);
  });

  it("falls back to the enclosing tree node when it intercepts an expanded slot", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const onInsert = vi.fn();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn(), onInsert);
    tree.setDocument(document, index);
    const target = buttonFor(host, "return_statement");
    const targetIndex = target.dataset.blockIndex ?? "";
    const targetNode = assemblyTargetFor(host, targetIndex);

    tree.setTemplateDrag("builtin.control.while");
    const over = host.emit("dragover", targetNode, { dataTransfer: new FakeDataTransfer() });
    expect(over.defaultPrevented).toBe(true);
    expect(slotFor(host, targetIndex, "before").classList.contains("is-template-drop-target")).toBe(
      true,
    );

    const drop = host.emit("drop", targetNode, { dataTransfer: new FakeDataTransfer() });
    expect(drop.defaultPrevented).toBe(true);
    expect(onInsert).toHaveBeenCalledWith({
      templateId: "builtin.control.while",
      target: entryFor(index, target),
      position: "before",
    });

    tree.setTemplateDrag("builtin.c.print-integer");
    host.emit("drop", targetNode, { dataTransfer: new FakeDataTransfer(), clientY: 19 });
    expect(onInsert).toHaveBeenLastCalledWith({
      templateId: "builtin.c.print-integer",
      target: entryFor(index, target),
      position: "after",
    });
  });

  it("marks tree roots with stable function, control, declaration, statement and raw semantics", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn());
    tree.setDocument(document, index);
    const nodes = host.querySelectorAll<FakeElement>(".block-tree-node");

    const declaration = nodes.find((node) => node.dataset.blockSemantic === "declaration");
    const functionNode = nodes.find((node) => node.dataset.blockSemantic === "function");
    const control = nodes.find((node) => node.dataset.blockSemantic === "control");
    const raw = nodes.find((node) => node.dataset.blockSemantic === "raw");
    expect(declaration?.dataset.fragmentKind).toBe("declaration");
    expect(declaration?.classList.contains("block-tree-node--declaration")).toBe(true);
    expect(functionNode?.dataset.fragmentKind).toBe("function");
    expect(functionNode?.classList.contains("block-tree-node--function")).toBe(true);
    expect(control?.dataset.fragmentKind).toBe("control");
    expect(control?.classList.contains("block-tree-node--control")).toBe(true);
    expect(raw?.dataset.fragmentKind).toBe("raw");
    expect(raw?.classList.contains("block-tree-node--raw")).toBe(true);
  });

  it("attaches mapped clang diagnostics to the deepest block and clears stale badges", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn());
    tree.setDocument(document, index);
    const expression = buttonFor(host, "expression_statement");
    const expressionRange = entryFor(index, expression).range;

    tree.setDiagnostics([
      { range: expressionRange, severity: "warning", message: "unused value" },
      { range: expressionRange, severity: "error", message: "invalid operands" },
    ]);
    const badge = expression.children.find((child) =>
      child.classList.contains("block-card__diagnostic"),
    );
    expect(badge?.textContent).toBe("错误 2");
    expect(badge?.dataset.severity).toBe("error");
    expect(badge?.title).toContain("unused value");
    expect(badge?.title).toContain("invalid operands");

    tree.setDiagnostics([]);
    expect(
      expression.children.some((child) => child.classList.contains("block-card__diagnostic")),
    ).toBe(false);
    tree.setDiagnostics([{ range: expressionRange, severity: "warning", message: "again" }]);
    tree.setDocument(document, index);
    expect(host.querySelectorAll<FakeElement>(".block-card__diagnostic")).toEqual([]);
  });

  it("switches tree structure labels, diagnostics, empty state and ARIA without changing source", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    host.dataset.locale = "zh-CN";
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn());
    tree.setDocument(document, index);
    const selected = entryFor(index, buttonFor(host, "expression_statement"));
    tree.select(selected);
    tree.setDiagnostics([
      { range: selected.range, severity: "error", message: "user diagnostic text" },
    ]);

    expect(flatTreeText(host)).toContain("变量声明");
    expect(flatTreeText(host)).toContain("原始 C · 解析恢复");
    expect(flatTreeText(host)).toContain("错误 1");
    expect(flatTreeText(host)).toContain("total++;");
    expect(
      findTree(host, (element) => element.attribute("role") === "tree").attribute("aria-label"),
    ).toBe("C 语句积木树");

    host.dataset.locale = "en";
    host.emit("workbench-locale-change", host);
    expect(flatTreeText(host)).toContain("Variable Declaration");
    expect(flatTreeText(host)).toContain("while Loop");
    expect(flatTreeText(host)).toContain("Raw C · Parse recovery");
    expect(flatTreeText(host)).toContain("Error 1");
    expect(flatTreeText(host)).toContain("total++;");
    expect(flatTreeText(host)).not.toContain("变量声明");
    expect(
      findTree(host, (element) => element.attribute("role") === "tree").attribute("aria-label"),
    ).toBe("C statement block tree");
    expect(buttonFor(host, "expression_statement").attribute("aria-selected")).toBe("true");
    expect(tree.getSelectedEntry()).toBe(selected);
    const diagnostic = buttonFor(host, "expression_statement").children.find((child) =>
      child.classList.contains("block-card__diagnostic"),
    );
    expect(diagnostic?.title).toBe("user diagnostic text");

    const emptyDocument: SourceDoc = { ...document, blocks: [] };
    tree.setDocument(emptyDocument, createBlockIndex(emptyDocument));
    expect(flatTreeText(host)).toContain("This file has no statement blocks to display");
    host.dataset.locale = "zh-CN";
    host.emit("workbench-locale-change", host);
    expect(flatTreeText(host)).toContain("这份文件目前没有可显示的语句积木");

    tree.destroy();
    expect(host.removeCount("workbench-locale-change")).toBe(1);
  });

  it("exposes the selected target for keyboard-accessible palette insertion", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn(), vi.fn());
    tree.setDocument(document, index);
    const statement = entryFor(index, buttonFor(host, "expression_statement"));

    expect(tree.getSelectedEntry()).toBeNull();
    tree.select(statement);
    expect(tree.getSelectedEntry()).toBe(statement);
    tree.select(null);
    expect(tree.getSelectedEntry()).toBeNull();
  });

  it("ignores every drag action while disabled and clears an active drag immediately", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const onMove = vi.fn();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), onMove);
    tree.setDocument(document, index);
    const source = buttonFor(host, "expression_statement");
    const target = buttonFor(host, "return_statement");

    host.emit("dragstart", source);
    host.emit("dragover", target);
    expect(source.classList.contains("is-dragging")).toBe(true);
    expect(target.classList.contains("is-drop-target")).toBe(true);

    tree.setInteractionEnabled(false);
    expect(source.classList.contains("is-dragging")).toBe(false);
    expect(target.classList.contains("is-drop-target")).toBe(false);

    const start = host.emit("dragstart", source, {
      dataTransfer: Object.assign(new FakeDataTransfer(), { effectAllowed: "copy" }),
    });
    const over = host.emit("dragover", target);
    const drop = host.emit("drop", target);
    host.emit("dragend", source);

    expect(start.defaultPrevented).toBe(false);
    expect(over.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("clears drag state for same-card drops, dragend and document replacement", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const onMove = vi.fn();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), onMove);
    tree.setDocument(document, index);
    const source = buttonFor(host, "expression_statement");

    host.emit("dragstart", source);
    const sameDrop = host.emit("drop", source);
    expect(sameDrop.defaultPrevented).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
    expect(source.classList.contains("is-dragging")).toBe(false);

    host.emit("dragstart", source);
    host.emit("dragend", source);
    expect(source.classList.contains("is-dragging")).toBe(false);

    host.emit("dragstart", source);
    expect(source.classList.contains("is-dragging")).toBe(true);
    tree.setDocument(document, index);
    expect(source.classList.contains("is-dragging")).toBe(false);
    expect(
      host
        .querySelectorAll<FakeElement>("[data-block-index]")
        .some((card) => card.classList.contains("is-dragging")),
    ).toBe(false);
  });

  it("clears all drag listeners, metadata and visual state during idempotent teardown", () => {
    const { document, index } = fixture();
    const host = fakeDocument.createElement("div");
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn(), vi.fn());
    tree.setDocument(document, index);
    const source = buttonFor(host, "expression_statement");
    const target = buttonFor(host, "return_statement");
    host.emit("dragstart", source);
    host.emit("dragover", target);
    tree.setInteractionEnabled(false);

    tree.destroy();
    tree.destroy();

    expect(source.classList.contains("is-dragging")).toBe(false);
    expect(target.classList.contains("is-drop-target")).toBe(false);
    expect(host.inert).toBe(false);
    expect(host.attribute("aria-disabled")).toBeUndefined();
    for (const eventType of [
      "click",
      "keydown",
      "dragstart",
      "dragover",
      "dragleave",
      "drop",
      "dragend",
    ]) {
      expect(host.removeCount(eventType)).toBe(1);
    }
    expect(host.children).toHaveLength(0);
    expect(() => tree.setInteractionEnabled(true)).toThrow(/已销毁/u);
  });
});

function fixture(): { readonly document: SourceDoc; readonly index: BlockIndex } {
  const source =
    "int total;\ntotal++;\nreturn total;\nwhile (ready) { total++; }\nvoid f(void) {}\n#error\n";
  const blocks: readonly Block[] = [
    syntaxBlock(source, "int total;", "declaration", "declaration"),
    syntaxBlock(source, "total++;", "statement", "expression_statement"),
    syntaxBlock(source, "return total;", "statement", "return_statement"),
    syntaxBlock(source, "while (ready) { total++; }", "statement", "while_statement"),
    syntaxBlock(source, "void f(void) {}", "function", "function_definition"),
    rawBlock(source, "#error"),
  ];
  const document: SourceDoc = {
    source,
    range: textRange(0, source.length),
    blocks,
    comments: [],
    parse: { mode: "tree-sitter", hasError: false, errorRanges: [], missingOffsets: [] },
    issues: [],
    concerns: [],
    symbols: { symbols: [], occurrences: [] },
  };
  return { document, index: createBlockIndex(document) };
}

function nestedLoopFixture(): { readonly document: SourceDoc; readonly index: BlockIndex } {
  const source = "while (ready) { if (flag) { total++; } }\nreturn total;\n";
  const statement = syntaxBlock(source, "total++;", "statement", "expression_statement");
  const branch = syntaxBlock(source, "if (flag) { total++; }", "statement", "if_statement", [
    statement,
  ]);
  const loop = syntaxBlock(
    source,
    "while (ready) { if (flag) { total++; } }",
    "statement",
    "while_statement",
    [branch],
  );
  const blocks: readonly Block[] = [
    loop,
    syntaxBlock(source, "return total;", "statement", "return_statement"),
  ];
  const document: SourceDoc = {
    source,
    range: textRange(0, source.length),
    blocks,
    comments: [],
    parse: { mode: "tree-sitter", hasError: false, errorRanges: [], missingOffsets: [] },
    issues: [],
    concerns: [],
    symbols: { symbols: [], occurrences: [] },
  };
  return { document, index: createBlockIndex(document) };
}

function syntaxBlock(
  source: string,
  excerpt: string,
  role: "function" | "statement" | "declaration" | "preprocessor",
  nodeType: string,
  children: readonly Block[] = [],
): Block {
  const from = source.indexOf(excerpt);
  return {
    kind: "syntax",
    role,
    nodeType,
    range: textRange(from, from + excerpt.length),
    children,
  };
}

function rawBlock(source: string, excerpt: string): Block {
  const from = source.indexOf(excerpt);
  return {
    kind: "raw",
    reason: "parse-error",
    range: textRange(from, from + excerpt.length),
    children: [],
  };
}

function buttonFor(host: FakeElement, nodeType: string): FakeElement {
  const button = host
    .querySelectorAll<FakeElement>("button[data-block-index]")
    .find((candidate) => candidate.dataset.nodeType === nodeType);
  if (button === undefined) throw new Error(`missing ${nodeType} button`);
  return button;
}

function slotFor(host: FakeElement, blockIndex: string, position: "before" | "after"): FakeElement {
  const slot = host
    .querySelectorAll<FakeElement>("[data-assembly-slot]")
    .find(
      (candidate) =>
        candidate.dataset.blockIndex === blockIndex && candidate.dataset.assemblySlot === position,
    );
  if (slot === undefined) throw new Error(`missing ${position} assembly slot for ${blockIndex}`);
  return slot;
}

function assemblyTargetFor(host: FakeElement, blockIndex: string): FakeElement {
  const target = host
    .querySelectorAll<FakeElement>("[data-assembly-target-index]")
    .find((candidate) => candidate.dataset.assemblyTargetIndex === blockIndex);
  if (target === undefined) throw new Error(`missing assembly target for ${blockIndex}`);
  return target;
}

function entryFor(index: BlockIndex, button: FakeElement): BlockIndexEntry {
  const entry = index.entries[Number(button.dataset.blockIndex)];
  if (entry === undefined) throw new Error("missing block index entry");
  return entry;
}

class FakeDataTransfer {
  dropEffect = "none";
  effectAllowed = "uninitialized";
  setData = vi.fn();
  getData = vi.fn(() => "");
}

interface FakeEventInit {
  readonly dataTransfer?: FakeDataTransfer | null;
  readonly relatedTarget?: FakeElement | null;
  readonly clientY?: number;
}

class FakeUiEvent {
  defaultPrevented = false;

  constructor(
    readonly type: string,
    readonly target: FakeElement,
    readonly dataTransfer: FakeDataTransfer | null,
    readonly relatedTarget: FakeElement | null,
    readonly clientY: number | undefined,
  ) {}

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

class FakeClassList {
  private readonly tokens = new Set<string>();

  set(value: string): void {
    this.tokens.clear();
    for (const token of value.split(/\s+/u)) {
      if (token.length > 0) this.tokens.add(token);
    }
  }

  add(...tokens: string[]): void {
    for (const token of tokens) this.tokens.add(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.tokens.delete(token);
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }

  toString(): string {
    return [...this.tokens].join(" ");
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string | undefined> = {};
  draggable = false;
  inert = false;
  tabIndex = 0;
  textContent = "";
  title = "";
  type = "";
  private parent: FakeElement | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  private readonly removeCounts = new Map<string, number>();

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  get className(): string {
    return this.classList.toString();
  }

  set className(value: string) {
    this.classList.set(value);
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

  contains(node: unknown): boolean {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  getBoundingClientRect(): Pick<DOMRect, "height" | "top"> {
    return { height: 20, top: 0 };
  }

  closest<T>(selector: string): T | null {
    let candidate: FakeElement | null = this;
    while (candidate !== null) {
      const matchesBlock =
        selector === "[data-block-index]" && candidate.dataset.blockIndex !== undefined;
      const matchesButton =
        selector === "button[data-block-index]" &&
        candidate.tagName === "button" &&
        candidate.dataset.blockIndex !== undefined;
      const matchesSlot =
        selector === "[data-assembly-slot]" && candidate.dataset.assemblySlot !== undefined;
      const matchesAssemblyTarget =
        selector === "[data-assembly-target-index]" &&
        candidate.dataset.assemblyTargetIndex !== undefined;
      const matchesLocale = selector === "[data-locale]" && candidate.dataset.locale !== undefined;
      if (matchesBlock || matchesButton || matchesSlot || matchesAssemblyTarget || matchesLocale) {
        return candidate as T;
      }
      candidate = candidate.parent;
    }
    return null;
  }

  querySelectorAll<T>(selector: string): T[] {
    if (
      selector !== "[data-block-index]" &&
      selector !== "button[data-block-index]" &&
      selector !== "[data-assembly-slot]" &&
      selector !== "[data-assembly-target-index]" &&
      selector !== ".block-tree-node" &&
      selector !== ".block-card__diagnostic"
    ) {
      return [];
    }
    const matches: T[] = [];
    const visit = (element: FakeElement) => {
      for (const child of element.children) {
        const matchesBlock =
          selector === "[data-block-index]" && child.dataset.blockIndex !== undefined;
        const matchesButton =
          selector === "button[data-block-index]" &&
          child.tagName === "button" &&
          child.dataset.blockIndex !== undefined;
        const matchesSlot =
          selector === "[data-assembly-slot]" && child.dataset.assemblySlot !== undefined;
        const matchesAssemblyTarget =
          selector === "[data-assembly-target-index]" &&
          child.dataset.assemblyTargetIndex !== undefined;
        const matchesTreeNode =
          selector === ".block-tree-node" && child.classList.contains("block-tree-node");
        const matchesDiagnostic =
          selector === ".block-card__diagnostic" &&
          child.classList.contains("block-card__diagnostic");
        if (
          matchesBlock ||
          matchesButton ||
          matchesSlot ||
          matchesAssemblyTarget ||
          matchesTreeNode ||
          matchesDiagnostic
        ) {
          matches.push(child as T);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector<T>(selector: string): T | null {
    const match = /^(?:button)?\[data-block-index="(\d+)"\]$/u.exec(selector);
    if (match === null) return null;
    return (
      (this.querySelectorAll<FakeElement>(
        selector.startsWith("button") ? "button[data-block-index]" : "[data-block-index]",
      ).find((candidate) => candidate.dataset.blockIndex === match[1]) as T | undefined) ?? null
    );
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  attribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (listener === null) return;
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (listener !== null) this.listeners.get(type)?.delete(listener);
    this.removeCounts.set(type, (this.removeCounts.get(type) ?? 0) + 1);
  }

  emit(type: string, target: FakeElement, init: FakeEventInit = {}): FakeUiEvent {
    const event = new FakeUiEvent(
      type,
      target,
      init.dataTransfer ?? null,
      init.relatedTarget ?? null,
      init.clientY,
    );
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") listener(event as unknown as Event);
      else listener.handleEvent(event as unknown as Event);
    }
    return event;
  }

  removeCount(type: string): number {
    return this.removeCounts.get(type) ?? 0;
  }

  remove(): void {
    const parent = this.parent;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parent = null;
  }

  focus(): void {}

  scrollIntoView(): void {}
}

function findTree(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement {
  if (predicate(root)) return root;
  for (const child of root.children) {
    try {
      return findTree(child, predicate);
    } catch {
      // Continue through sibling branches.
    }
  }
  throw new Error("tree element not found");
}

function flatTreeText(root: FakeElement): string {
  return [root.textContent, ...root.children.map(flatTreeText)].join(" ");
}
