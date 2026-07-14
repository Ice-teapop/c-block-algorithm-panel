import { describe, expect, it, vi } from "vitest";
import { createFirstRunStart, type FirstRunStartCallbacks } from "../../src/ui/first-run-start.js";
import {
  createGuidedLessonRail,
  resolveRailLocale,
  type GuidedLessonRailCallbacks,
  type GuidedLessonRailSnapshot,
} from "../../src/ui/guided-lesson-rail.js";

describe("guided lesson rail", () => {
  it("renders a non-modal evidence rail without persona copy", () => {
    const fixture = fakeHost();
    const callbacks = lessonCallbacks();
    const rail = createGuidedLessonRail(
      fixture.host as unknown as HTMLElement,
      lessonSnapshot(),
      callbacks,
    );
    const root = rail.element as unknown as FakeElement;

    expect(root.tagName).toBe("ASIDE");
    expect(root.getAttribute("role")).not.toBe("dialog");
    expect(root.getAttribute("aria-modal")).toBeUndefined();
    expect(treeText(root)).not.toMatch(/导师|助手|我来教你|恭喜/u);
    expect(treeText(root)).toContain("第一课");
    expect(treeText(root)).toContain("任务 2 / 5");
    expect(treeText(root)).toContain("真实 Trace 同时经过两个分支");
    expect(treeText(root)).toContain("逐轮推演（非运行时变量）");
    expect(byText(root, "待验证").tagName).toBe("STRONG");
    expect(byText(root, "定位").tagName).toBe("BUTTON");
    expect(byText(root, "为什么").tagName).toBe("SUMMARY");
    expect(byText(root, "验收条件 · 0/1").parentElement?.open).toBe(false);
    expect(byText(root, "逐轮推演（非运行时变量）").parentElement?.open).toBe(false);
    expect(byText(root, "为什么").parentElement?.open).toBe(false);
    expect(byText(root, "提示 · 0/3").parentElement?.open).toBe(false);
    expect(byText(root, "任务工具").parentElement?.open).toBe(false);
    expect(byText(root, "查看任务详情").parentElement?.open).toBe(false);
    const primaryAction = walk(root).find(
      (element) => element.className === "guided-lesson-rail__primary-action",
    );
    expect(
      primaryAction?.children
        .filter((element) => element.tagName === "BUTTON" && !element.hidden)
        .map((element) => element.textContent),
    ).toEqual(["下一任务"]);
    expect(byText(root, "下一任务").disabled).toBe(true);
  });

  it("exposes text actions, progressive hints, semantic states and busy locking", () => {
    const fixture = fakeHost();
    const callbacks = lessonCallbacks();
    const rail = createGuidedLessonRail(
      fixture.host as unknown as HTMLElement,
      lessonSnapshot(),
      callbacks,
    );
    const root = rail.element as unknown as FakeElement;

    byText(root, "定位").click();
    byText(root, "为什么").click();
    byText(root, "显示第一条提示").click();
    byText(root, "重置").click();
    byText(root, "退出课程").click();
    expect(callbacks.onLocate).toHaveBeenCalledOnce();
    expect(callbacks.onToggleWhy).toHaveBeenCalledOnce();
    expect(callbacks.onNextHint).toHaveBeenCalledOnce();
    expect(callbacks.onReset).toHaveBeenCalledOnce();
    expect(callbacks.onExit).toHaveBeenCalledOnce();
    expect(callbacks.onNext).not.toHaveBeenCalled();

    rail.update(
      lessonSnapshot({
        canAdvance: true,
        expandedWhy: true,
        hintLevel: 2,
        showPrepareSkeleton: true,
        requirements: [{ label: "两个分支已覆盖", status: "passed" }],
        status: { state: "success", message: "真实 Trace 已通过。" },
      }),
    );

    expect(byText(root, "为什么").parentElement?.open).toBe(true);
    expect(treeText(root)).toContain("先找到比较节点");
    expect(treeText(root)).toContain("再核对 true/false 路径");
    expect(byText(root, "已通过").parentElement?.dataset.state).toBe("passed");
    expect(byText(root, "真实 Trace 已通过。").dataset.state).toBe("success");
    expect(byText(root, "开始补全").hidden).toBe(false);
    expect(byText(root, "载入故障版本").hidden).toBe(true);
    expect(byText(root, "下一任务").hidden).toBe(true);

    byText(root, "开始补全").click();
    rail.update(
      lessonSnapshot({
        showInjectBug: true,
        status: { state: "idle", message: "等待故障版本。" },
      }),
    );
    expect(byText(root, "开始补全").hidden).toBe(true);
    expect(byText(root, "载入故障版本").hidden).toBe(false);
    byText(root, "载入故障版本").click();
    rail.update(lessonSnapshot({ canAdvance: true }));
    expect(byText(root, "下一任务").hidden).toBe(false);
    expect(byText(root, "下一任务").disabled).toBe(false);
    byText(root, "下一任务").click();
    expect(callbacks.onPrepareSkeleton).toHaveBeenCalledOnce();
    expect(callbacks.onInjectBug).toHaveBeenCalledOnce();
    expect(callbacks.onNext).toHaveBeenCalledOnce();

    rail.update(
      lessonSnapshot({
        busy: true,
        canAdvance: true,
        status: { state: "working", message: "正在核对证据…" },
      }),
    );
    expect(root.getAttribute("aria-busy")).toBe("true");
    for (const element of walk(root).filter(({ tagName }) => tagName === "BUTTON")) {
      expect(element.disabled, element.textContent).toBe(true);
    }
    byText(root, "下一任务").click();
    expect(callbacks.onNext).toHaveBeenCalledOnce();

    rail.destroy();
    rail.destroy();
    expect(fixture.host.children).toHaveLength(0);
    expect(() => rail.update(lessonSnapshot())).toThrow("GuidedLessonRail 已销毁");
  });

  it("rejects impossible progress snapshots", () => {
    const fixture = fakeHost();
    expect(() =>
      createGuidedLessonRail(
        fixture.host as unknown as HTMLElement,
        lessonSnapshot({ missionIndex: 6, missionCount: 5 }),
        lessonCallbacks(),
      ),
    ).toThrow("任务总数不能小于当前任务序号");
  });

  it("renders a compact read-chart lesson and records an explicit answer", () => {
    const fixture = fakeHost();
    const callbacks = lessonCallbacks();
    const rail = createGuidedLessonRail(
      fixture.host as unknown as HTMLElement,
      lessonSnapshot({
        visualGuide: {
          phase: "跟练",
          title: "先读点，再读波动范围",
          explanation: "圆点是中位数，竖线是最小值到最大值。",
          facts: [
            { label: "圆点", description: "重复真实运行的中位数" },
            { label: "竖线", description: "最小值—最大值范围" },
          ],
          question: "竖线更长说明什么？",
          options: [
            { id: "variation", label: "这组运行波动更大" },
            { id: "wrong", label: "中位数一定更大" },
          ],
          selectedOptionId: null,
          feedback: null,
          feedbackState: "idle",
        },
      }),
      callbacks,
    );
    const root = rail.element as unknown as FakeElement;

    expect(treeText(root)).toContain("跟练 先读点，再读波动范围");
    expect(treeText(root)).toContain("圆点 重复真实运行的中位数");
    expect(byText(root, "这组运行波动更大").tagName).toBe("BUTTON");
    byText(root, "这组运行波动更大").click();
    expect(callbacks.onVisualAnswer).toHaveBeenCalledWith("variation");

    rail.update(
      lessonSnapshot({
        visualGuide: {
          phase: "跟练",
          title: "先读点，再读波动范围",
          explanation: "圆点是中位数，竖线是最小值到最大值。",
          facts: [],
          question: "竖线更长说明什么？",
          options: [{ id: "wrong", label: "中位数一定更大" }],
          selectedOptionId: "wrong",
          feedback: "竖线表达范围，不决定中位数。",
          feedbackState: "incorrect",
        },
      }),
    );
    expect(byText(root, "中位数一定更大").getAttribute("aria-pressed")).toBe("true");
    expect(byText(root, "竖线表达范围，不决定中位数。").dataset.state).toBe("incorrect");
  });

  it("switches rail controls, status labels, defaults and table copy without translating lesson evidence", () => {
    const fixture = fakeHost();
    fixture.host.dataset.locale = "en";
    const snapshot = lessonSnapshot({
      hintLevel: 1,
      why: undefined,
      hints: undefined,
    });
    const rail = createGuidedLessonRail(
      fixture.host as unknown as HTMLElement,
      snapshot,
      lessonCallbacks(),
    );
    const root = rail.element as unknown as FakeElement;

    expect(resolveRailLocale("en-AU")).toBe("en");
    expect(resolveRailLocale("zh-Hans")).toBe("zh-CN");
    expect(root.dataset.locale).toBe("en");
    expect(root.getAttribute("aria-label")).toBe("第一课 mission rail");
    expect(treeText(root)).toContain("Mission 2 / 5");
    expect(treeText(root)).toContain("Acceptance criteria · 0/1");
    expect(treeText(root)).toContain("Iteration walkthrough (not runtime variables)");
    expect(treeText(root)).toContain("Iteration Input Comparison maximum");
    expect(treeText(root)).toContain("Use Locate to find the panel for the current mission.");
    expect(byText(root, "Pending").tagName).toBe("STRONG");
    expect(byText(root, "Locate").tagName).toBe("BUTTON");
    expect(byText(root, "Show next hint").tagName).toBe("BUTTON");
    expect(treeText(root)).toContain(snapshot.title);
    expect(treeText(root)).toContain(snapshot.instruction);
    expect(treeText(root)).toContain(snapshot.status.message);
    expect(treeText(root)).toContain(snapshot.requirements[0]!.label);
    expect(fixture.host.listenerCount("workbench-locale-change")).toBe(1);

    fixture.host.dataset.locale = "zh-CN";
    fixture.host.dispatchEvent(localeChangeEvent("zh-CN"));

    expect(root.dataset.locale).toBe("zh-CN");
    expect(root.getAttribute("aria-label")).toBe("第一课任务轨");
    expect(treeText(root)).toContain("任务 2 / 5");
    expect(treeText(root)).toContain("验收条件 · 0/1");
    expect(byText(root, "待验证").tagName).toBe("STRONG");
    expect(byText(root, "定位").tagName).toBe("BUTTON");
    expect(treeText(root)).toContain(snapshot.title);
    expect(treeText(root)).toContain(snapshot.requirements[0]!.detail!);

    rail.destroy();
    expect(fixture.host.listenerCount("workbench-locale-change")).toBe(0);
  });
});

describe("first run start", () => {
  it("stays inline and offers the two explicit routes", () => {
    const fixture = fakeHost();
    const start = createFirstRunStart(fixture.host as unknown as HTMLElement, {
      onStartLesson: vi.fn(),
      onContinue: vi.fn(),
    });
    const root = start.element as unknown as FakeElement;

    expect(root.tagName).toBe("SECTION");
    expect(root.getAttribute("role")).not.toBe("dialog");
    expect(root.getAttribute("aria-modal")).toBeUndefined();
    expect(treeText(root)).not.toMatch(/导师|助手|欢迎回来|恭喜/u);
    expect(byText(root, "开始第一课 · 扫描求最大值").tagName).toBe("BUTTON");
    expect(byText(root, "直接进入工作台").tagName).toBe("BUTTON");
  });

  it("announces asynchronous progress and prevents duplicate actions", async () => {
    const fixture = fakeHost();
    const pending = deferred();
    const callbacks: FirstRunStartCallbacks = {
      onStartLesson: vi.fn(() => pending.promise),
      onContinue: vi.fn(),
    };
    const start = createFirstRunStart(fixture.host as unknown as HTMLElement, callbacks);
    const root = start.element as unknown as FakeElement;
    const startButton = byText(root, "开始第一课 · 扫描求最大值");
    const continueButton = byText(root, "直接进入工作台");

    startButton.click();
    startButton.click();
    continueButton.click();
    expect(callbacks.onStartLesson).toHaveBeenCalledOnce();
    expect(callbacks.onContinue).not.toHaveBeenCalled();
    expect(root.getAttribute("aria-busy")).toBe("true");
    expect(startButton.disabled).toBe(true);
    expect(continueButton.disabled).toBe(true);
    expect(treeText(root)).toContain("正在创建教学沙箱…");

    pending.resolve();
    await flushMicrotasks();
    expect(root.getAttribute("aria-busy")).toBe("false");
    expect(startButton.disabled).toBe(false);
    expect(byText(root, "教学沙箱已准备。").dataset.state).toBe("success");

    continueButton.click();
    await flushMicrotasks();
    expect(callbacks.onContinue).toHaveBeenCalledOnce();
    expect(treeText(root)).toContain("已进入工作台。");

    start.setStatus("创建失败", "error");
    expect(byText(root, "创建失败").dataset.state).toBe("error");
    start.setBusy(true, "等待工作区…");
    expect(root.getAttribute("aria-busy")).toBe("true");
    expect(treeText(root)).toContain("等待工作区…");

    start.destroy();
    start.destroy();
    expect(fixture.host.children).toHaveLength(0);
    expect(() => start.setStatus("无效")).toThrow("FirstRunStart 已销毁");
  });
});

function lessonSnapshot(
  overrides: Partial<GuidedLessonRailSnapshot> = {},
): GuidedLessonRailSnapshot {
  return {
    lessonLabel: "第一课",
    missionIndex: 2,
    missionCount: 5,
    title: "观察真实路径",
    instruction: "启动 Trace，确认比较节点的两个分支都被实际执行。",
    requirements: [
      {
        label: "真实 Trace 同时经过两个分支",
        status: "pending",
        detail: "模拟结果不能通过这一项",
      },
    ],
    canAdvance: false,
    expandedWhy: false,
    hintLevel: 0,
    predictionRows: [
      { iteration: "1", input: "8", comparison: "8 > 3 · true", maximum: "8" },
      { iteration: "2", input: "2", comparison: "2 > 8 · false", maximum: "8" },
    ],
    busy: false,
    status: { state: "idle", message: "等待真实 Trace 证据。" },
    why: "两个分支都经过，才能证明案例同时覆盖了更新和保持路径。",
    hints: ["先找到比较节点", "再核对 true/false 路径", "检查案例是否仍为普通案例"],
    ...overrides,
  };
}

function lessonCallbacks(): GuidedLessonRailCallbacks {
  return {
    onLocate: vi.fn(),
    onToggleWhy: vi.fn(),
    onNextHint: vi.fn(),
    onReset: vi.fn(),
    onExit: vi.fn(),
    onNext: vi.fn(),
    onPrepareSkeleton: vi.fn(),
    onInjectBug: vi.fn(),
    onVisualAnswer: vi.fn(),
  };
}

function deferred(): { readonly promise: Promise<void>; resolve(): void } {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return {
    promise,
    resolve(): void {
      resolve?.();
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function localeChangeEvent(locale: "zh-CN" | "en"): Event {
  const event = new Event("workbench-locale-change");
  Object.defineProperty(event, "detail", { value: Object.freeze({ locale }) });
  return event;
}

function fakeHost(): { readonly document: FakeDocument; readonly host: FakeElement } {
  const document = new FakeDocument();
  return { document, host: document.createElement("div") };
}

type FakeListener = (event: Event) => void;

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
  readonly #attributes = new Map<string, string>();
  readonly #listeners = new Map<string, Set<FakeListener>>();
  parentElement: FakeElement | null = null;
  className = "";
  textContent = "";
  type = "";
  scope = "";
  hidden = false;
  open = false;
  disabled = false;

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

  prepend(...children: FakeElement[]): void {
    for (const child of [...children].reverse()) {
      child.parentElement = this;
      this.children.unshift(child);
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
    this.#attributes.set(name, value);
  }

  getAttribute(name: string): string | undefined {
    return this.#attributes.get(name);
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.#listeners.get(type) ?? new Set<FakeListener>();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.#listeners.get(event.type) ?? []) listener(event);
    return !event.defaultPrevented;
  }

  listenerCount(type: string): number {
    return this.#listeners.get(type)?.size ?? 0;
  }

  click(): void {
    if (this.disabled || this.hidden) return;
    const event = new Event("click", { cancelable: true });
    for (const listener of this.#listeners.get("click") ?? []) listener(event);
  }
}

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(walk)];
}

function treeText(root: FakeElement): string {
  return walk(root)
    .map(({ textContent }) => textContent)
    .filter((value) => value.length > 0)
    .join(" ");
}

function byText(root: FakeElement, text: string): FakeElement {
  const element = walk(root).find((candidate) => candidate.textContent === text);
  if (element === undefined) throw new Error(`未找到文本：${text}`);
  return element;
}
