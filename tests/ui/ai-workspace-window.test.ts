import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createAiWorkspaceWindow,
  isAiWorkspaceWindowShortcut,
  normalizeAiWindowGeometry,
} from "../../src/ui/ai-workspace-window.js";
import type { AiWorkspaceWindowState } from "../../src/ui/ai-workspace-window.js";

const source = readFileSync(
  new URL("../../src/ui/ai-workspace-window.ts", import.meta.url),
  "utf8",
);
const style = readFileSync(
  new URL("../../src/ui/ai-workspace-window.css", import.meta.url),
  "utf8",
);

describe("AI workspace window", () => {
  it("uses Cmd/Ctrl+Shift+A without taking the other platform modifier", () => {
    const keys = (overrides: Partial<Parameters<typeof isAiWorkspaceWindowShortcut>[0]> = {}) => ({
      key: "a",
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      shiftKey: true,
      ...overrides,
    });

    expect(isAiWorkspaceWindowShortcut(keys({ metaKey: true }), true)).toBe(true);
    expect(isAiWorkspaceWindowShortcut(keys({ ctrlKey: true }), false)).toBe(true);
    expect(isAiWorkspaceWindowShortcut(keys({ metaKey: true, ctrlKey: true }), true)).toBe(false);
    expect(isAiWorkspaceWindowShortcut(keys({ metaKey: true, shiftKey: false }), true)).toBe(false);
    expect(isAiWorkspaceWindowShortcut(keys({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(isAiWorkspaceWindowShortcut(keys({ key: "k", metaKey: true }), true)).toBe(false);
  });

  it("centers the default 860x680 surface and clamps restored geometry to the viewport", () => {
    expect(normalizeAiWindowGeometry(undefined, 1440, 900)).toEqual({
      x: 290,
      y: 110,
      width: 860,
      height: 680,
    });
    expect(
      normalizeAiWindowGeometry({ x: -400, y: 2_000, width: 220, height: 4_000 }, 1200, 800),
    ).toEqual({
      x: 8,
      y: 8,
      width: 680,
      height: 784,
    });
  });

  it("is explicitly non-modal, restores focus and limits the empty state to four questions", () => {
    expect(source).toContain('element.setAttribute("aria-modal", "false")');
    expect(source).not.toContain("showModal(");
    expect(source).not.toContain("::backdrop");
    expect(source).toContain("previousFocus?.focus({ preventScroll: true })");
    expect(source).toMatch(/\.filter\(Boolean\)\s*\.slice\(0, 4\)/u);
    expect(source).toContain('event.key === "Escape"');
  });

  it("keeps project sessions, permission modes and backend actions injectable", () => {
    expect(source).toContain("onSelectProject?:");
    expect(source).toContain("onSelectConversation?:");
    expect(source).toContain("onNewConversation?:");
    expect(source).toContain("onModeChange?:");
    expect(source).toContain('"read-only",');
    expect(source).toContain('"review",');
    expect(source).toContain('"agent",');
    expect(source).toContain("state.availableModes.includes(mode)");
    expect(source).toContain('modeSelect.setAttribute("aria-describedby"');
    expect(source).toContain("complete main.c");
  });

  it("keeps transcript and composer usable at the requested density", () => {
    expect(style).toMatch(/min-width:\s*680px/u);
    expect(style).toMatch(/min-height:\s*480px/u);
    expect(style).toContain("width: min(800px, 100%)");
    expect(style).toContain("position: sticky");
    expect(style).toContain("overscroll-behavior: contain");
    expect(style).toContain("prefers-reduced-motion: reduce");
    expect(style).toContain("grid-template-rows: 40px minmax(0, 1fr)");
    expect(style).toContain("grid-template-columns: 216px minmax(0, 1fr)");
    expect(style).toContain("width: min(640px, 100%)");
    expect(style).toContain("background: var(--accent, #275d9b)");
    expect(style).not.toMatch(/font-size:\s*[89]px/u);
  });

  it("toggles, moves, resizes, renders new state and sends a project-scoped question", () => {
    const document = new FakeDocument();
    const host = document.createElement("main");
    host.dataset.locale = "zh-CN";
    const trigger = document.createElement("button");
    host.append(trigger);
    trigger.focus();
    const sends: unknown[][] = [];
    const reviewDecisions: unknown[][] = [];
    const controller = createAiWorkspaceWindow(host as unknown as HTMLElement, {
      initialState: stateFixture(),
      onSend: (...args) => sends.push(args),
      onReviewDecision: (...args) => reviewDecisions.push(args),
    });

    controller.toggle();
    expect(controller.isOpen).toBe(true);
    expect((controller.element as unknown as FakeElement).hidden).toBe(false);

    const header = find(host, (item) => item.className === "ai-workspace-window__header");
    header.dispatch("pointerdown", pointerEvent(header, 1, 100, 100));
    document.dispatch("pointermove", pointerEvent(document, 1, 160, 135));
    document.dispatch("pointerup", pointerEvent(document, 1, 160, 135));
    expect(controller.getGeometry()).toEqual({ x: 350, y: 145, width: 860, height: 680 });

    const resize = find(host, (item) => item.dataset.edge === "se");
    resize.dispatch("pointerdown", pointerEvent(resize, 2, 0, 0));
    document.dispatch("pointermove", pointerEvent(document, 2, 80, 40));
    document.dispatch("pointerup", pointerEvent(document, 2, 80, 40));
    expect(controller.getGeometry()).toEqual({ x: 350, y: 145, width: 940, height: 720 });

    find(host, (item) => item.textContent === "检查边界条件").click();
    expect(sends).toEqual([
      ["检查边界条件", { projectId: "project-1", conversationId: "chat-1", mode: "read-only" }],
    ]);

    controller.setState({
      ...stateFixture(),
      messages: [{ id: "message-1", role: "assistant", content: "保留模型原文" }],
    });
    expect(find(host, (item) => item.textContent === "保留模型原文").tagName).toBe("P");

    controller.setState({
      ...stateFixture(),
      mode: "review",
      availableModes: ["read-only", "review"],
      pendingReview: { id: "review-1", summary: "修复边界", diffSummary: "1 处替换" },
    });
    find(host, (item) => item.textContent === "应用").click();
    expect(reviewDecisions).toEqual([["review-1", true]]);

    controller.close();
    expect(controller.isOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);
    controller.destroy();
    expect(host.children.some((item) => item.className === "ai-workspace-window")).toBe(false);
  });

  it("re-renders all window chrome when the interface switches to English", () => {
    const document = new FakeDocument();
    const host = document.createElement("main");
    host.dataset.locale = "zh-CN";
    const controller = createAiWorkspaceWindow(host as unknown as HTMLElement, {
      initialState: stateFixture(),
      onSend: () => undefined,
    });
    controller.open();

    host.dataset.locale = "en";
    host.dispatch("workbench-locale-change");
    controller.setState({
      ...stateFixture(),
      projects: [
        {
          id: "project-1",
          name: "Maximum scan",
          conversations: [{ id: "chat-1", title: "Edge cases" }],
        },
      ],
      suggestedQuestions: ["Explain this algorithm"],
    });

    const visibleText = allText(host).join(" ");
    expect(visibleText).toContain("Projects and chats");
    expect(visibleText).toContain("New chat");
    expect(visibleText).toContain("Explain this algorithm");
    expect(visibleText).not.toMatch(/[\p{Script=Han}]/u);
    controller.destroy();
  });
});

function stateFixture(): AiWorkspaceWindowState {
  return {
    projects: [
      {
        id: "project-1",
        name: "最大值",
        conversations: [{ id: "chat-1", title: "边界条件" }],
      },
    ],
    activeProjectId: "project-1",
    activeConversationId: "chat-1",
    messages: [],
    mode: "read-only",
    availableModes: ["read-only"],
    modelLabel: "deepseek-chat",
    suggestedQuestions: ["解释当前算法", "检查边界条件", "设计测试", "比较优化", "不得显示"],
  };
}

function find(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement {
  if (predicate(root)) return root;
  for (const child of root.children) {
    try {
      return find(child, predicate);
    } catch {
      /* Keep searching. */
    }
  }
  throw new Error("Element not found");
}

function allText(root: FakeElement): readonly string[] {
  return [root.textContent, ...root.children.flatMap((child) => allText(child))].filter(Boolean);
}

function pointerEvent(
  target: FakeElement | FakeDocument,
  pointerId: number,
  clientX: number,
  clientY: number,
): FakeEvent {
  return new FakeEvent({ target, pointerId, clientX, clientY, button: 0 });
}

class FakeWindow {
  readonly navigator = { platform: "MacIntel" };
  readonly innerWidth = 1440;
  readonly innerHeight = 900;
  addEventListener(): void {}
  removeEventListener(): void {}
}

class FakeDocument {
  readonly defaultView = new FakeWindow();
  activeElement: FakeElement | null = null;
  private readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName.toUpperCase(), this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as unknown as (event: FakeEvent) => void);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as unknown as (event: FakeEvent) => void);
  }

  dispatch(type: string, event: FakeEvent): void {
    event.currentTarget = this;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string | undefined> = {};
  readonly style: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  className = "";
  id = "";
  textContent = "";
  type = "";
  value = "";
  title = "";
  rows = 0;
  hidden = false;
  disabled = false;
  tabIndex = 0;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

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
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener as unknown as (event: FakeEvent) => void);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as unknown as (event: FakeEvent) => void);
  }
  dispatch(type: string, event = new FakeEvent({ target: this })): void {
    event.currentTarget = this;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
  click(): void {
    this.dispatch("click");
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  setPointerCapture(): void {}
}

class FakeEvent {
  readonly target: FakeElement | FakeDocument;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly button: number;
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
  currentTarget: FakeElement | FakeDocument | null = null;

  constructor(value: {
    target: FakeElement | FakeDocument;
    pointerId?: number;
    clientX?: number;
    clientY?: number;
    button?: number;
    key?: string;
    shiftKey?: boolean;
    isComposing?: boolean;
  }) {
    this.target = value.target;
    this.pointerId = value.pointerId ?? 0;
    this.clientX = value.clientX ?? 0;
    this.clientY = value.clientY ?? 0;
    this.button = value.button ?? 0;
    this.key = value.key ?? "";
    this.shiftKey = value.shiftKey ?? false;
    this.isComposing = value.isComposing ?? false;
  }

  preventDefault(): void {}
  stopPropagation(): void {}
}
