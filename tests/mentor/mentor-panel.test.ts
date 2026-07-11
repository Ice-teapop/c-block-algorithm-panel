import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { textRange } from "../../src/core/index.js";
import type { MentorHint } from "../../src/mentor/index.js";
import { createMentorPanel } from "../../src/ui/mentor-panel.js";

const source = readFileSync(new URL("../../src/ui/mentor-panel.ts", import.meta.url), "utf8");

describe("mentor panel", () => {
  it("renders evidence with textContent and locates a target when its hint is clicked", () => {
    const ownerDocument = new FakeDocument();
    const host = ownerDocument.createElement("div");
    const onLocate = vi.fn();
    const panel = createMentorPanel(host as unknown as HTMLElement, { onLocate });
    const hint = hintFixture();
    panel.setHints([hint]);

    const item = find(host, (element) => element.dataset.hintId === hint.id);
    const button = find(item, (element) => element.tagName === "button");
    expect(item.dataset.confidence).toBe("certain");
    expect(button.disabled).toBe(false);
    button.click();
    expect(onLocate).toHaveBeenCalledWith(hint.target, hint);
    expect(flatText(item)).toContain("不会自动改码");
  });

  it("supports empty, status and idempotent destroy states", () => {
    const ownerDocument = new FakeDocument();
    const host = ownerDocument.createElement("div");
    const panel = createMentorPanel(host as unknown as HTMLElement);
    expect(flatText(host)).toContain("当前没有足够证据生成提示");
    panel.setStatus("正在计算证据", "working");
    expect(panel.element.dataset.state).toBe("working");
    expect(flatText(host)).toContain("正在计算证据");
    panel.destroy();
    panel.destroy();
    expect(host.children).toHaveLength(0);
    expect(() => panel.setHints([])).toThrow("MentorPanel 已销毁");
  });

  it("never parses mentor strings as markup", () => {
    expect(source).toContain("textContent = hint.title");
    expect(source).toContain("textContent = hint.summary");
    expect(source).not.toContain("innerHTML");
  });
});

function hintFixture(): MentorHint {
  return Object.freeze({
    id: "mentor.test",
    level: "verification",
    confidence: "certain",
    title: "检查边界",
    summary: "当前边界会访问长度本身。",
    nextStep: "比较 < 与 <=。",
    target: Object.freeze({
      range: textRange(10, 20),
      nodeId: "node.loop",
    }),
    evidence: Object.freeze([
      Object.freeze({
        kind: "analysis-finding",
        label: "循环条件",
        range: textRange(12, 16),
        nodeId: "node.loop",
        runIds: Object.freeze([]),
      }),
    ]),
    sourceMutation: "none",
  });
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

class FakeElement {
  readonly ownerDocument: FakeDocument;
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (() => void)[]>();
  className = "";
  textContent = "";
  type = "";
  disabled = false;

  constructor(ownerDocument: FakeDocument, tagName: string) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(name: string, listener: () => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }
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
