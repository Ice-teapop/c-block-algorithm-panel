import { describe, expect, it, vi } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import { getFoaSceneProfile } from "../../src/tutorials/foa-scene-profiles.js";
import { createFoaSemanticScene } from "../../src/ui/foa-semantic-scene.js";
import {
  defaultFoaInteractiveRun,
  getFoaInteractiveInputDefinition,
} from "../../src/tutorials/foa-interactive-inputs.js";

describe("FOA semantic scene", () => {
  it("renders authored recursion, alias, and matrix topologies instead of a linear disguise", () => {
    const cases = [
      { order: 36, edges: ["0:1", "1:2", "2:0", "2:3"] },
      { order: 47, edges: ["0:1", "1:2", "2:3", "1:0", "2:0"] },
      { order: 54, edges: ["0:1", "1:2", "2:3", "3:0"] },
    ] as const;

    for (const expected of cases) {
      const document = new FakeDocument();
      const lesson = FOA_LESSONS[expected.order - 1]!;
      const scene = createFoaSemanticScene(
        document as unknown as Document,
        lesson,
        getFoaSceneProfile(lesson),
        { locale: "zh", reducedMotion: true, onAttempt: vi.fn() },
      );
      const actual = walk(scene.root as unknown as FakeElement)
        .filter((element) => element.dataset.fromIndex !== undefined)
        .map((element) => `${element.dataset.fromIndex}:${element.dataset.toIndex}`);
      expect(actual).toEqual(expected.edges);
    }
  });

  it("keeps stable nodes while rendering active, done, pending, and completed evidence states", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[0]!;
    const attempts = vi.fn();
    const scene = createFoaSemanticScene(
      document as unknown as Document,
      lesson,
      getFoaSceneProfile(lesson),
      {
        locale: "zh",
        reducedMotion: true,
        onAttempt: attempts,
      },
    );
    const root = scene.root as unknown as FakeElement;
    const nodes = semanticNodes(root);
    const nodeReferences = [...nodes];
    const output = channelValues(root)[1]!;
    const edges = semanticEdges(root);

    expect(nodes).toHaveLength(lesson.semanticEvents.length);
    expect(nodes.map((node) => node.dataset.state)).toEqual([
      "active",
      "pending",
      "pending",
      "pending",
    ]);
    expect(nodes.map((node) => node.disabled)).toEqual([false, false, false, false]);
    expect(nodes[0]!.getAttribute("aria-current")).toBe("step");
    expect(edges.map((edge) => edge.dataset.state)).toEqual(["pending", "pending", "pending"]);
    expect(output.textContent).toBe("完成后显示");

    nodes[0]!.emit("click");
    expect(attempts).toHaveBeenCalledWith(lesson.semanticEvents[0]!.id);

    scene.setState({
      displayIndex: 1,
      confirmedCount: 1,
      previewing: false,
      completed: false,
    });

    expect(semanticNodes(root)).toEqual(nodeReferences);
    expect(nodes.map((node) => node.dataset.state)).toEqual([
      "done",
      "active",
      "pending",
      "pending",
    ]);
    expect(nodes.map((node) => node.disabled)).toEqual([true, false, false, false]);
    expect(nodes[1]!.getAttribute("aria-current")).toBe("step");
    expect(edges.map((edge) => edge.dataset.state)).toEqual(["done", "pending", "pending"]);
    expect(output.textContent).toBe("完成后显示");

    scene.setState({
      displayIndex: 3,
      confirmedCount: 1,
      previewing: true,
      completed: false,
    });

    expect(nodes.map((node) => node.dataset.state)).toEqual([
      "done",
      "pending",
      "pending",
      "preview",
    ]);
    expect(nodes.map((node) => node.getAttribute("aria-current"))).toEqual([
      "false",
      "false",
      "false",
      "step",
    ]);
    expect(edges.map((edge) => edge.dataset.state)).toEqual(["done", "pending", "pending"]);

    scene.setState({
      displayIndex: lesson.semanticEvents.length - 1,
      confirmedCount: lesson.semanticEvents.length,
      previewing: false,
      completed: true,
    });

    expect(semanticNodes(root)).toEqual(nodeReferences);
    expect(nodes.every((node) => node.dataset.state === "done")).toBe(true);
    expect(nodes.every((node) => node.disabled)).toBe(true);
    expect(edges.every((edge) => edge.dataset.state === "done")).toBe(true);
    expect(output.textContent).toBe("Hello, algorithm! ↵");
    expect(root.dataset.completed).toBe("true");
  });

  it("activates only the in-flight edge and routes its travel token between node ports", async () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[0]!;
    const scene = createFoaSemanticScene(
      document as unknown as Document,
      lesson,
      getFoaSceneProfile(lesson),
      {
        locale: "en",
        reducedMotion: false,
        onAttempt: vi.fn(),
      },
    );
    const root = scene.root as unknown as FakeElement;
    const diagram = elementByClass(root, "foa-semantic-scene__diagram");
    const nodes = semanticNodes(root);
    const edges = semanticEdges(root);
    const travelToken = elementByClass(root, "foa-semantic-scene__travel-token");
    diagram.setRect({ left: 0, top: 0, width: 680, height: 160 });
    nodes.forEach((node, index) => {
      node.setRect({ left: 20 + index * 160, top: 40, width: 100, height: 60 });
    });

    const transition = scene.animateAdvance(0, 1);

    expect(transition).not.toBeNull();
    expect(edges.map((edge) => edge.dataset.state)).toEqual(["active", "pending", "pending"]);
    expect(edges[0]!.dataset.route).toBe("ports");
    expect(edges[0]!.getAttribute("d")).toBe("M 120 70 L 180 70");
    expect(root.dataset.transitionFrom).toBe("0");
    expect(root.dataset.transitionTo).toBe("1");
    expect(travelToken.hidden).toBe(false);

    await transition;

    expect(edges.every((edge) => edge.dataset.state === "pending")).toBe(true);
    expect(root.dataset.transitionFrom).toBeUndefined();
    expect(root.dataset.transitionTo).toBeUndefined();
    expect(travelToken.hidden).toBe(true);

    scene.setState({ displayIndex: 1, confirmedCount: 1, previewing: false, completed: false });
    expect(edges.map((edge) => edge.dataset.state)).toEqual(["done", "pending", "pending"]);
  });

  it("switches all learner-facing copy to English and honors reduced motion", async () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[0]!;
    const scene = createFoaSemanticScene(
      document as unknown as Document,
      lesson,
      getFoaSceneProfile(lesson),
      {
        locale: "zh",
        reducedMotion: false,
        onAttempt: vi.fn(),
      },
    );
    const root = scene.root as unknown as FakeElement;
    const firstNode = semanticNodes(root)[0]!;

    expect(root.dataset.reducedMotion).toBe("false");
    await scene.animateAdvance(0, null);
    expect(firstNode.animationCalls).toHaveLength(1);

    scene.setReducedMotion(true);
    expect(root.dataset.reducedMotion).toBe("true");
    await scene.animateAdvance(0, null);
    expect(firstNode.animationCalls).toHaveLength(1);

    scene.setLocale("en");
    expect(root.getAttribute("aria-label")).toContain(lesson.title.en);
    expect(root.textContent).toContain("Lesson case");
    expect(root.textContent).toContain("Shown on completion");
    expect(root.textContent).toContain(getFoaSceneProfile(lesson).rationale.en);
    expect(elementByClass(root, "foa-semantic-scene__boundary").title).toContain(
      "Fixed-case replay; it is not sampled runtime state.",
    );
    expect(root.textContent).not.toMatch(/[\u3400-\u9fff]/u);
    semanticNodes(root).forEach((node, index) => {
      expect(node.textContent).toContain(lesson.semanticEvents[index]!.label.en);
      expect(node.textContent).toContain(index === 0 ? "Run this step" : "Pending");
    });
  });

  it("binds one learner input to the scene, reveals evidence stepwise, and invalidates output until completion", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[8]!;
    const definition = getFoaInteractiveInputDefinition(lesson.order)!;
    const runtimeCase = defaultFoaInteractiveRun(definition);
    const changeInput = vi.fn();
    const scene = createFoaSemanticScene(
      document as unknown as Document,
      lesson,
      getFoaSceneProfile(lesson),
      {
        locale: "zh",
        reducedMotion: true,
        onAttempt: vi.fn(),
        onChangeInput: changeInput,
      },
    );
    const root = scene.root as unknown as FakeElement;
    const nodes = semanticNodes(root);
    const channel = channelValues(root);

    scene.setRuntimeCase?.(runtimeCase);
    expect(root.dataset.inputGroup).toBe("special");
    expect(root.textContent).toContain("当前输入");
    expect(channel[0]!.textContent).toBe("41 ↵");
    expect(channel[1]!.textContent).toBe("完成后显示");
    expect(nodes[0]!.textContent).not.toContain(runtimeCase.eventDetails[0]!.zh);

    scene.setState({
      displayIndex: 1,
      confirmedCount: 1,
      previewing: false,
      completed: false,
      runtimeState: "running",
    });
    expect(root.dataset.runState).toBe("running");
    expect(nodes[0]!.textContent).toContain(runtimeCase.eventDetails[0]!.zh);
    expect(channel[1]!.textContent).toBe("完成后显示");

    scene.setState({
      displayIndex: 3,
      confirmedCount: 4,
      previewing: false,
      completed: true,
      runtimeState: "completed",
    });
    expect(root.dataset.runState).toBe("completed");
    expect(channel[1]!.textContent).toBe("42 ↵");
    elementByClass(root, "foa-semantic-scene__change-input").emit("click");
    expect(changeInput).toHaveBeenCalledOnce();
  });
});

function semanticNodes(root: FakeElement): FakeElement[] {
  return walk(root).filter((element) => element.dataset.eventId !== undefined);
}

function semanticEdges(root: FakeElement): FakeElement[] {
  return walk(root).filter((element) => element.dataset.fromIndex !== undefined);
}

function channelValues(root: FakeElement): FakeElement[] {
  return walk(root).filter((element) => element.tagName === "dd");
}

function elementByClass(root: FakeElement, className: string): FakeElement {
  const found = walk(root).find((element) => element.className === className);
  if (found === undefined) throw new Error(`Missing element with class ${className}`);
  return found;
}

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(walk)];
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly defaultView = {
    requestAnimationFrame: (_callback: FrameRequestCallback) => 1,
  };

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return this.createElement(tagName);
  }
}

class FakeElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly animationCalls: Array<{
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions | undefined;
  }> = [];
  readonly classList = {
    add: (...names: string[]) => {
      this.className = [
        ...new Set([...this.className.split(/\s+/u).filter(Boolean), ...names]),
      ].join(" ");
    },
  };
  readonly style: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  className = "";
  id = "";
  title = "";
  hidden = false;
  disabled = false;
  type = "";
  readonly isConnected = true;
  scrollLeft = 0;
  scrollTop = 0;
  private rect = makeRect(0, 0, 0, 0);
  private ownText = "";

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tagName: string,
  ) {}

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
    this.clearChildren();
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.attach(node, this.children.length);
  }

  prepend(...nodes: FakeElement[]): void {
    nodes.reverse().forEach((node) => this.attach(node, 0));
  }

  remove(): void {
    this.parentElement?.removeChild(this);
  }

  removeChild(node: FakeElement): void {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    const event = { type, target: this, currentTarget: this };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  animate(keyframes: Keyframe[], options?: KeyframeAnimationOptions): Animation {
    this.animationCalls.push({ keyframes, options });
    return {
      finished: Promise.resolve(),
      cancel: () => undefined,
      finish: () => undefined,
    } as unknown as Animation;
  }

  get clientWidth(): number {
    return this.rect.width;
  }

  get clientHeight(): number {
    return this.rect.height;
  }

  get scrollWidth(): number {
    return this.rect.width;
  }

  get scrollHeight(): number {
    return this.rect.height;
  }

  setRect(rect: Readonly<{ left: number; top: number; width: number; height: number }>): void {
    this.rect = makeRect(rect.left, rect.top, rect.width, rect.height);
  }

  getBoundingClientRect(): DOMRect {
    return this.rect;
  }

  getTotalLength(): number {
    return this.attributes.get("d")?.length === 0 ? 0 : 100;
  }

  getPointAtLength(distance: number): DOMPoint {
    return { x: distance, y: 70 } as DOMPoint;
  }

  private attach(node: FakeElement, index: number): void {
    node.parentElement?.removeChild(node);
    node.parentElement = this;
    this.children.splice(index, 0, node);
  }

  private clearChildren(): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0);
  }
}

interface FakeEvent {
  readonly type: string;
  readonly target: FakeElement;
  readonly currentTarget: FakeElement;
}

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}
