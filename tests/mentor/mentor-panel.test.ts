import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { textRange } from "../../src/core/index.js";
import type { MentorHint } from "../../src/mentor/index.js";
import type {
  AiMentorReadResult,
  AiMentorStartResult,
  ReadAiMentorRequest,
  StartAiMentorRequest,
} from "../../src/shared/ai-provider.js";
import { AI_PROVIDER_CONFIG_CHANGE_EVENT } from "../../src/ui/ai-provider-events.js";
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
    expect(flatText(host)).toContain("运行或 Trace 后");
    panel.setStatus("正在计算证据", "working");
    expect(panel.element.dataset.state).toBe("working");
    expect(flatText(host)).toContain("正在计算证据");
    panel.destroy();
    panel.destroy();
    expect(host.children).toHaveLength(0);
    expect(() => panel.setHints([])).toThrow("MentorPanel 已销毁");
  });

  it("never parses mentor strings as markup", () => {
    expect(source).toContain("textContent = presentation.title");
    expect(source).toContain("textContent = presentation.summary");
    expect(source).not.toContain("innerHTML");
  });

  it("explains both assistant modes and opens AI settings from the disconnected state", async () => {
    const ownerDocument = new FakeDocument();
    const host = ownerDocument.createElement("div");
    const onOpenAiSettings = vi.fn();
    const panel = createMentorPanel(host as unknown as HTMLElement, {
      onOpenAiSettings,
      remoteApi: disconnectedRemoteApi(),
    });

    expect(flatText(host)).toContain("识别并解释当前算法、提示可能的边界缺口、比较设计与优化方案");
    expect(flatText(host)).toContain("本地检查");
    find(host, (element) => element.textContent === "AI 对话").click();
    await flushPromises();
    expect(flatText(host)).toContain("算法含义、可疑逻辑与优化代价");
    find(host, (element) => element.textContent === "连接 AI 模型").click();
    expect(onOpenAiSettings).toHaveBeenCalledOnce();
    panel.destroy();
  });

  it("switches every mentor control and preset immediately while preserving the transcript", async () => {
    const ownerDocument = new FakeDocument();
    const host = ownerDocument.createElement("div");
    host.dataset.locale = "zh-CN";
    let sessionNumber = 0;
    const startAiMentor = vi.fn(
      async (request: StartAiMentorRequest): Promise<AiMentorStartResult> => ({
        status: "started",
        sessionId: `mentor:locale:${String(++sessionNumber)}`,
        sourceFingerprint: request.sourceFingerprint,
      }),
    );
    const readAiMentor = vi.fn(
      async ({ sessionId }: ReadAiMentorRequest): Promise<AiMentorReadResult> => ({
        status: "completed",
        sessionId,
        sourceFingerprint: "fnv64:old",
        events: [{ sequence: 1, kind: "answer", text: "模型原文 / model original" }],
        nextSequence: 1,
      }),
    );
    const panel = createMentorPanel(host as unknown as HTMLElement, {
      remoteApi: connectedRemoteApi({ startAiMentor, readAiMentor }),
    });
    panel.setRemoteContext(remoteContext("fnv64:old"));
    panel.setHints([hintFixture()]);
    await flushPromises();

    find(host, (element) => element.textContent === "解释算法").click();
    await flushPromises();
    const originalQuestion = "这段代码实现了什么算法？请按目标、输入输出和关键步骤解释。";
    expect(startAiMentor.mock.calls[0]![0].prompt).toBe(originalQuestion);
    expect(flatText(host)).toContain(originalQuestion);
    expect(flatText(host)).toContain("模型原文 / model original");

    host.dataset.locale = "en";
    host.dispatch("workbench-locale-change", { detail: { locale: "en" } });

    expect(flatText(host)).toContain("AI Assistant");
    expect(flatText(host)).toContain("Read-only advice · No automatic edits");
    expect(flatText(host)).toContain("AI Chat");
    expect(flatText(host)).toContain("Local Checks");
    expect(flatText(host)).toContain("Suggested questions · Click to ask");
    expect(flatText(host)).toContain("Ask about this algorithm");
    expect(flatText(host)).toContain("Answer complete. You can ask a follow-up.");
    expect(flatText(host)).toContain(
      "Next step: Inspect the linked source location and evidence before changing the code.",
    );
    expect(flatText(host)).toContain("No automatic edits");
    expect(flatText(host)).toContain(originalQuestion);
    expect(flatText(host)).toContain("模型原文 / model original");

    const englishPresets = [
      [
        "Explain algorithm",
        "What algorithm does this code implement? Explain its goal, inputs and outputs, and key steps.",
      ],
      [
        "Walk through it",
        "Choose a small input and walk through the key variables, decisions, and branches. Do not present a simulation as a real Trace.",
      ],
      [
        "Find edge cases",
        "Which edge cases might this algorithm miss? Separate confirmed issues from risks that still need verification.",
      ],
      [
        "Design tests",
        "Design the highest-value edge-case tests for this algorithm. Include each input, expected result, and purpose.",
      ],
      [
        "Analyze complexity",
        "Analyze the time and space complexity and explain the evidence. Keep Big-O separate from measured runtime data.",
      ],
      [
        "Compare improvements",
        "How could this algorithm be clearer or more efficient? Compare at most two options and their trade-offs. Do not edit the code automatically.",
      ],
    ] as const;
    for (const [label, prompt] of englishPresets) {
      expect(find(host, (element) => element.textContent === label).title).toBe(prompt);
    }
    const localizedHint = find(host, (element) => element.dataset.hintId === "mentor.test");
    expect(flatText(localizedHint)).not.toMatch(/[\u3400-\u9fff]/u);
    expect(flatText(localizedHint)).toContain("Static analysis evidence");
    find(host, (element) => element.textContent === "Design tests").click();
    await flushPromises();
    expect(startAiMentor.mock.calls[1]![0].prompt).toBe(
      "Design the highest-value edge-case tests for this algorithm. Include each input, expected result, and purpose.",
    );
    expect(startAiMentor.mock.calls[1]![0].history[0]).toEqual({
      role: "user",
      content: originalQuestion,
    });

    panel.setRemoteContext(remoteContext("fnv64:new"));
    expect(flatText(host)).toContain("The source changed. Previous messages remain for reference");
    panel.destroy();
    expect(host.listeners.get("workbench-locale-change") ?? []).toHaveLength(0);
  });

  it("defaults to current-function evidence and makes full source an explicit choice", () => {
    expect(source).toContain('contextMode.value === "full-source"');
    expect(source).toContain('contextMode === "full-source" ? { fullSource:');
    expect(source).toContain("context.sourceFingerprint !== chatSourceFingerprint");
    expect(source).toContain("源码已更新。旧对话仅供查看");
    expect(source).toContain("cancelRemote();");
  });

  it("starts from a preset, keeps a bounded multi-turn history, and resets history after source changes", async () => {
    const ownerDocument = new FakeDocument();
    const host = ownerDocument.createElement("div");
    let sessionNumber = 0;
    const startAiMentor = vi.fn(
      async (request: StartAiMentorRequest): Promise<AiMentorStartResult> => {
        sessionNumber += 1;
        return {
          status: "started" as const,
          sessionId: `mentor:${String(sessionNumber)}`,
          sourceFingerprint: request.sourceFingerprint,
        };
      },
    );
    const readAiMentor = vi.fn(
      async ({ sessionId }: ReadAiMentorRequest): Promise<AiMentorReadResult> => ({
        status: "completed" as const,
        sessionId,
        sourceFingerprint: sessionId === "mentor:3" ? "fnv64:new" : "fnv64:old",
        events: [
          {
            sequence: 1,
            kind: "answer" as const,
            text: `回答 ${sessionId}`,
          },
        ],
        nextSequence: 1,
      }),
    );
    const panel = createMentorPanel(host as unknown as HTMLElement, {
      remoteApi: connectedRemoteApi({ startAiMentor, readAiMentor }),
    });
    panel.setRemoteContext(remoteContext("fnv64:old"));
    await flushPromises();

    find(host, (element) => element.textContent === "解释算法").click();
    await flushPromises();
    expect(startAiMentor.mock.calls[0]![0].history).toEqual([]);
    expect(flatText(host)).toContain("这段代码实现了什么算法");
    expect(flatText(host)).toContain("回答 mentor:1");

    find(host, (element) => element.textContent === "设计测试").click();
    await flushPromises();
    expect(startAiMentor.mock.calls[1]![0].history).toEqual([
      {
        role: "user",
        content: "这段代码实现了什么算法？请按目标、输入输出和关键步骤解释。",
      },
      { role: "assistant", content: "回答 mentor:1" },
    ]);

    panel.setRemoteContext(remoteContext("fnv64:new"));
    expect(flatText(host)).toContain("源码已更新。旧对话仅供查看");
    expect(flatText(host)).toContain("回答 mentor:1");
    find(host, (element) => element.textContent === "分析复杂度").click();
    await flushPromises();
    expect(startAiMentor.mock.calls[2]![0].history).toEqual([]);
    panel.destroy();
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

  it("shows an immediate stopped state while a pending request is being cancelled", async () => {
    const harness = await pendingRemoteHarness();
    find(harness.host, (element) => element.textContent === "停止").click();
    expect(flatText(harness.host)).toContain("回答已停止，可继续提问");
    expect(flatText(harness.host)).not.toContain("正在回答，可随时停止");

    harness.resolveStart({
      status: "started",
      sessionId: "mentor:manual-stop",
      sourceFingerprint: "fnv64:old",
    });
    await flushPromises();
    expect(harness.cancelAiMentor).toHaveBeenCalledWith({ sessionId: "mentor:manual-stop" });
    harness.panel.destroy();
  });

  it("invalidates an in-flight config read even while the local view is selected", async () => {
    const ownerDocument = new FakeDocument();
    const host = ownerDocument.createElement("div");
    let resolveConfig!: (value: ReturnType<typeof connectedConfig>) => void;
    const getAiProviderConfig = vi.fn(
      () =>
        new Promise<ReturnType<typeof connectedConfig>>((resolve) => {
          resolveConfig = resolve;
        }),
    );
    const panel = createMentorPanel(host as unknown as HTMLElement, {
      remoteApi: {
        getAiProviderConfig,
        startAiMentor: vi.fn(),
        readAiMentor: vi.fn(),
        cancelAiMentor: vi.fn(),
      },
    });
    panel.setRemoteContext(remoteContext("fnv64:old"));
    find(host, (element) => element.textContent === "本地检查").click();
    ownerDocument.defaultView.dispatch(AI_PROVIDER_CONFIG_CHANGE_EVENT);
    resolveConfig(connectedConfig());
    await flushPromises();

    expect(find(host, (element) => element.textContent === "发送").disabled).toBe(true);
    panel.destroy();
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
  return { panel, host, resolveStart, cancelAiMentor } as const;
}

function disconnectedRemoteApi() {
  return {
    getAiProviderConfig: vi.fn(async () => ({
      status: "missing" as const,
      encryptionAvailable: true,
    })),
    startAiMentor: vi.fn(),
    readAiMentor: vi.fn(),
    cancelAiMentor: vi.fn(),
  };
}

function connectedRemoteApi(overrides: {
  readonly startAiMentor: (request: StartAiMentorRequest) => Promise<AiMentorStartResult>;
  readonly readAiMentor: (request: ReadAiMentorRequest) => Promise<AiMentorReadResult>;
}) {
  return {
    getAiProviderConfig: vi.fn(async () => connectedConfig()),
    startAiMentor: overrides.startAiMentor,
    readAiMentor: overrides.readAiMentor,
    cancelAiMentor: vi.fn(async ({ sessionId }: { readonly sessionId: string }) => ({
      status: "cancelled" as const,
      sessionId,
    })),
  };
}

function connectedConfig() {
  return {
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
  };
}

function remoteContext(sourceFingerprint: string) {
  return Object.freeze({
    workspaceId: "workspace:test",
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
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
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
  readonly defaultView = new FakeWindow();

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

class FakeWindow {
  readonly listeners = new Map<string, Set<(event?: unknown) => void>>();

  addEventListener(name: string, listener: (event?: unknown) => void): void {
    const listeners = this.listeners.get(name) ?? new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }

  removeEventListener(name: string, listener: (event?: unknown) => void): void {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name: string): void {
    for (const listener of this.listeners.get(name) ?? []) listener({ type: name });
  }
}

class FakeElement {
  readonly ownerDocument: FakeDocument;
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, ((event?: unknown) => void)[]>();
  parentElement: FakeElement | null = null;
  className = "";
  textContent = "";
  title = "";
  type = "";
  disabled = false;
  value = "";
  scrollHeight = 0;
  scrollTop = 0;

  constructor(ownerDocument: FakeDocument, tagName: string) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) child.parentElement = this;
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parentElement = null;
    for (const child of children) child.parentElement = this;
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

  removeEventListener(name: string, listener: (event?: unknown) => void): void {
    const listeners = this.listeners.get(name);
    if (listeners === undefined) return;
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  }

  closest(selector: string): FakeElement | null {
    if (selector === "[data-locale]" && this.dataset.locale !== undefined) return this;
    return this.parentElement?.closest(selector) ?? null;
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  focus(): void {}

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
