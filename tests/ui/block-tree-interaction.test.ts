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
  const source = "int total;\ntotal++;\nreturn total;\nvoid f(void) {}\n#error\n";
  const blocks: readonly Block[] = [
    syntaxBlock(source, "int total;", "declaration", "declaration"),
    syntaxBlock(source, "total++;", "statement", "expression_statement"),
    syntaxBlock(source, "return total;", "statement", "return_statement"),
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

function syntaxBlock(
  source: string,
  excerpt: string,
  role: "function" | "statement" | "declaration" | "preprocessor",
  nodeType: string,
): Block {
  const from = source.indexOf(excerpt);
  return {
    kind: "syntax",
    role,
    nodeType,
    range: textRange(from, from + excerpt.length),
    children: [],
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
    .querySelectorAll<FakeElement>("[data-block-index]")
    .find((candidate) => candidate.dataset.nodeType === nodeType);
  if (button === undefined) throw new Error(`missing ${nodeType} button`);
  return button;
}

function entryFor(index: BlockIndex, button: FakeElement): BlockIndexEntry {
  const entry = index.entries[Number(button.dataset.blockIndex)];
  if (entry === undefined) throw new Error("missing block index entry");
  return entry;
}

class FakeDataTransfer {
  dropEffect = "none";
  effectAllowed = "uninitialized";
  getData = vi.fn(() => "");
}

interface FakeEventInit {
  readonly dataTransfer?: FakeDataTransfer | null;
  readonly relatedTarget?: FakeElement | null;
}

class FakeUiEvent {
  defaultPrevented = false;

  constructor(
    readonly type: string,
    readonly target: FakeElement,
    readonly dataTransfer: FakeDataTransfer | null,
    readonly relatedTarget: FakeElement | null,
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

  closest<T>(selector: string): T | null {
    if (selector !== "[data-block-index]") return null;
    let candidate: FakeElement | null = this;
    while (candidate !== null) {
      if (candidate.dataset.blockIndex !== undefined) return candidate as T;
      candidate = candidate.parent;
    }
    return null;
  }

  querySelectorAll<T>(selector: string): T[] {
    if (selector !== "[data-block-index]") return [];
    const matches: T[] = [];
    const visit = (element: FakeElement) => {
      for (const child of element.children) {
        if (child.dataset.blockIndex !== undefined) matches.push(child as T);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector<T>(selector: string): T | null {
    const match = /^\[data-block-index="(\d+)"\]$/u.exec(selector);
    if (match === null) return null;
    return (
      (this.querySelectorAll<FakeElement>("[data-block-index]").find(
        (candidate) => candidate.dataset.blockIndex === match[1],
      ) as T | undefined) ?? null
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

  focus(): void {}

  scrollIntoView(): void {}
}
