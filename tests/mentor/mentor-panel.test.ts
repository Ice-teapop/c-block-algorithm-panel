import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { textRange } from "../../src/core/index.js";
import type { MentorHint } from "../../src/mentor/index.js";
import type { AiMentorStartResult } from "../../src/shared/ai-provider.js";
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

  it("defaults to current-function evidence and makes full source an explicit choice", () => {
    expect(source).toContain('contextMode.value === "full-source"');
    expect(source).toContain('contextMode === "full-source" ? { fullSource:');
    expect(source).toContain("context?.sourceFingerprint !== remoteContext?.sourceFingerprint");
    expect(source).toContain("cancelRemote();");
  });

  it("cancels a pending start as soon as its stale session id arrives", async () => {
    const harness = await pendingRemoteHarness();
    harness.panel.setRemoteContext(remoteContext("fnv64:new"));
    harness.resolveStart({
      status: "started",
      sessionId: "mentor:stale",
      sourceFingerprint: "fnv64:old",
    });
    await flushPromises();

    expect(harness.cancelAiMentor).toHaveBeenCalledWith({ sessionId: "mentor:stale" });
    harness.panel.destroy();
  });

  it("cancels a session that starts after the mentor panel was destroyed", async () => {
    const harness = await pendingRemoteHarness();
    harness.panel.destroy();
    harness.resolveStart({
      status: "started",
      sessionId: "mentor:destroyed",
      sourceFingerprint: "fnv64:old",
    });
    await flushPromises();

    expect(harness.cancelAiMentor).toHaveBeenCalledWith({ sessionId: "mentor:destroyed" });
  });
});

async function pendingRemoteHarness() {
  const ownerDocument = new FakeDocument();
  const host = ownerDocument.createElement("div");
  let resolveStart!: (result: AiMentorStartResult) => void;
  const startAiMentor = vi.fn(
    () =>
      new Promise<AiMentorStartResult>((resolve) => {
        resolveStart = resolve;
      }),
  );
  const cancelAiMentor = vi.fn(async ({ sessionId }: { readonly sessionId: string }) => ({
    status: "cancelled" as const,
    sessionId,
  }));
  const panel = createMentorPanel(host as unknown as HTMLElement, {
    remoteApi: {
      getAiProviderConfig: vi.fn(async () => ({
        status: "ready" as const,
        encryptionAvailable: true,
        config: {
          schemaVersion: 2 as const,
          revision: 1,
          providerId: "openai" as const,
          region: null,
          model: "model-a",
          state: "connected" as const,
          hasCredential: true,
          credentialUsable: true,
          credentialUpdatedAtMs: 1,
        },
      })),
      startAiMentor,
      readAiMentor: vi.fn(async () => ({
        status: "running" as const,
        sessionId: "mentor:pending",
        sourceFingerprint: "fnv64:old",
        events: [],
        nextSequence: 0,
      })),
      cancelAiMentor,
    },
  });
  panel.setRemoteContext(remoteContext("fnv64:old"));
  find(host, (element) => element.textContent === "AI 对话").click();
  await flushPromises();
  const prompt = find(host, (element) => element.tagName === "textarea");
  prompt.value = "Explain this function";
  find(host, (element) => element.tagName === "form").dispatch("submit", {
    preventDefault() {},
  });
  expect(startAiMentor).toHaveBeenCalledOnce();
  return { panel, resolveStart, cancelAiMentor } as const;
}

function remoteContext(sourceFingerprint: string) {
  return Object.freeze({
    sourceFingerprint,
    sourceRevision: 1,
    currentFunction: "int main(void){return 0;}",
    diagnosticSummary: Object.freeze([]),
    controlFlowSummary: "one function",
    runEvidence: Object.freeze([]),
    fullSource: "int main(void){return 0;}",
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

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
  readonly listeners = new Map<string, ((event?: unknown) => void)[]>();
  className = "";
  textContent = "";
  type = "";
  disabled = false;
  value = "";

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

  addEventListener(name: string, listener: (event?: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  dispatch(name: string, event?: unknown): void {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
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
