import { afterEach, describe, expect, it, vi } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import { createFoaTaskLesson } from "../../src/ui/foa-task-lesson.js";

describe("stable FOA semantic task stage", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps scene node and source identities while only validated learner actions advance mastery", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const evidence = vi.fn();
    const phases: string[] = [];
    const lesson = FOA_LESSONS[0]!;
    const task = createFoaTaskLesson(host as unknown as HTMLElement, lesson, {
      locale: "zh",
      reducedMotion: true,
      onLocalEvidence: evidence,
      onPhaseChange: (phase) => phases.push(phase),
    });

    const root = host.children[0]!;
    expect(root.className).toContain("foa-semantic-stage");
    expect(root.children).toHaveLength(3);
    action(host, "start").emit("click");
    expect(task.phase).toBe("task");
    expect(root.dataset.confirmedEvents).toBe("0");
    const seek = walk(host).find((element) => element.dataset.taskLessonInput === "timeline")!;
    expect(seek.getAttribute("aria-valuenow")).toBe("0");
    expect(seek.getAttribute("aria-valuetext")).toBe("1 / 4");

    const scene = walk(host).find((element) =>
      element.className.split(/\s+/u).includes("foa-semantic-scene"),
    )!;
    const nodes = semanticSceneNodes(host);
    const sourceLines = teachingSourceLines(host);
    expect(scene.hidden).toBe(false);
    expect(nodes).toHaveLength(lesson.semanticEvents.length);
    expect(nodes.map((node) => node.dataset.eventId)).toEqual(
      lesson.semanticEvents.map((event) => event.id),
    );
    expect(
      nodes.every((node, index) =>
        node.textContent.includes(lesson.semanticEvents[index]!.label.zh),
      ),
    ).toBe(true);
    expect(timelineItems(host).every((item) => !/^0\d$/u.test(item.textContent))).toBe(true);
    expect(nodes.map((node) => node.dataset.state)).toEqual([
      "active",
      "pending",
      "pending",
      "pending",
    ]);
    expect(nodes.map((node) => node.getAttribute("aria-current"))).toEqual([
      "step",
      "false",
      "false",
      "false",
    ]);
    const nodeReferences = new Map(nodes.map((node) => [node.dataset.eventId, node]));
    const sourceReferences = new Map(sourceLines.map((line) => [line.dataset.sourceLine, line]));
    const goal = walk(host).find((element) => element.dataset.semanticRole === "goal")!;
    expect(goal.textContent).toContain(lesson.semanticEvents[0]!.label.zh);
    expect(sourceLines.some((line) => line.hidden)).toBe(true);
    const sourceToggle = walk(host).find(
      (element) => element.dataset.teachingSourceAction === "toggle-boilerplate",
    )!;
    expect(sourceToggle.textContent).toBe("展开完整源码");
    expect(sourceLines.find((line) => line.dataset.state === "active")?.hidden).toBe(false);
    sourceToggle.emit("click");
    expect(sourceLines.every((line) => !line.hidden)).toBe(true);
    sourceToggle.emit("click");
    expect(sourceLines.some((line) => line.hidden)).toBe(true);

    action(host, "next").emit("click");
    expect(root.dataset.timelinePosition).toBe("1");
    expect(seek.getAttribute("aria-valuenow")).toBe("1");
    expect(seek.getAttribute("aria-valuetext")).toBe("2 / 4");
    expect(root.dataset.confirmedEvents).toBe("0");
    expect(root.dataset.interactionMode).toBe("preview");
    expect(nodes.map((node) => node.dataset.state)).toEqual([
      "pending",
      "preview",
      "pending",
      "pending",
    ]);
    expect(nodes.map((node) => node.getAttribute("aria-current"))).toEqual([
      "false",
      "step",
      "false",
      "false",
    ]);
    const activeTimelineItems = timelineItems(host).filter(
      (item) => item.dataset.state === "preview",
    );
    expect(activeTimelineItems).toHaveLength(1);
    expect(activeTimelineItems[0]!.dataset.semanticEventId).toBe(root.dataset.currentEventId);
    expect(nodes[1]!.dataset.eventId).toBe(root.dataset.currentEventId);
    expect(nodes.every((node) => node.disabled)).toBe(true);
    expect(evidence).not.toHaveBeenCalled();
    expect(goal.textContent).toContain(lesson.semanticEvents[0]!.label.zh);
    expect(action(host, "return-to-current").parentElement?.hidden).toBe(false);

    seek.value = "3";
    seek.emit("input");
    expect(root.dataset.timelinePosition).toBe("3");
    expect(root.dataset.confirmedEvents).toBe("0");
    expect(evidence).not.toHaveBeenCalled();

    action(host, "return-to-current").emit("click");
    expect(root.dataset.interactionMode).toBe("act");
    expect(nodes[0]!.dataset.state).toBe("active");
    expect(nodes[0]!.getAttribute("aria-current")).toBe("step");
    nodes[2]!.emit("click");
    expect(root.dataset.confirmedEvents).toBe("0");
    expect(root.dataset.timelinePosition).toBe("0");
    expect(
      walk(host).find((element) => element.className.includes("foa-semantic-stage__feedback"))
        ?.dataset.kind,
    ).toBe("incorrect");

    nodes[0]!.emit("click");
    expect(root.dataset.confirmedEvents).toBe("1");
    expect(nodes.map((node) => node.dataset.state)).toEqual([
      "done",
      "active",
      "pending",
      "pending",
    ]);
    expect(nodes.map((node) => node.getAttribute("aria-current"))).toEqual([
      "false",
      "step",
      "false",
      "false",
    ]);
    action(host, "undo").emit("click");
    expect(root.dataset.confirmedEvents).toBe("0");
    expect(nodes[0]!.dataset.state).toBe("active");
    expect(nodes[0]!.getAttribute("aria-current")).toBe("step");

    for (const node of nodes) node.emit("click");
    expect(task.phase).toBe("completed");
    expect(evidence).toHaveBeenCalledOnce();
    expect(evidence).toHaveBeenCalledWith({
      type: "semantic-sequence-completed",
      lessonId: lesson.id,
      complete: true,
    });
    expect(phases).toEqual(["intro", "task", "completed"]);
    for (const node of semanticSceneNodes(host)) {
      expect(node).toBe(nodeReferences.get(node.dataset.eventId));
      expect(node.dataset.state).toBe("done");
      expect(node.getAttribute("aria-current")).toBe("false");
    }
    for (const line of teachingSourceLines(host)) {
      expect(line).toBe(sourceReferences.get(line.dataset.sourceLine));
    }

    task.setLocale("en");
    expect(action(host, "repeat").textContent).toBe("Try again");
    const completionDetails = walk(host).find((element) =>
      element.className.includes("foa-semantic-stage__completion-details"),
    )!;
    for (const point of lesson.knowledgePoints) {
      expect(completionDetails.textContent).toContain(point.title.en);
    }
    for (const internalId of lesson.libraryKnowledgeIds) {
      expect(completionDetails.textContent).not.toContain(internalId);
    }
    for (const [index, node] of semanticSceneNodes(host).entries()) {
      expect(node).toBe(nodeReferences.get(node.dataset.eventId));
      expect(node.textContent).toContain(lesson.semanticEvents[index]!.label.en);
    }
    action(host, "repeat").emit("click");
    expect(task.phase).toBe("task");
    expect(root.dataset.confirmedEvents).toBe("0");
    expect(evidence).toHaveBeenCalledOnce();
    expect(nodes[0]!.dataset.state).toBe("active");
    expect(nodes[0]!.getAttribute("aria-current")).toBe("step");
    for (const node of nodes) node.emit("click");
    expect(task.phase).toBe("completed");
    action(host, "back-to-intro").emit("click");
    expect(task.phase).toBe("intro");
    task.destroy();
    expect(host.children).toHaveLength(0);
  });

  it("plays and seeks a cancellable preview without manufacturing completion evidence", () => {
    vi.useFakeTimers();
    const document = new FakeDocument();
    const host = document.createElement("div");
    const evidence = vi.fn();
    const lesson = FOA_LESSONS[2]!;
    const task = createFoaTaskLesson(host as unknown as HTMLElement, lesson, {
      locale: "en",
      reducedMotion: true,
      onLocalEvidence: evidence,
    });
    const root = host.children[0]!;
    action(host, "start").emit("click");
    action(host, "rate-1-5").emit("click");
    action(host, "play-pause").emit("click");
    expect(root.dataset.playbackState).toBe("playing");
    vi.advanceTimersByTime(300);
    action(host, "play-pause").emit("click");
    expect(root.dataset.playbackState).toBe("paused");
    vi.advanceTimersByTime(10_000);
    expect(root.dataset.timelinePosition).toBe("0");
    action(host, "play-pause").emit("click");
    vi.advanceTimersByTime(899);
    expect(root.dataset.timelinePosition).toBe("0");
    vi.advanceTimersByTime(1);
    expect(root.dataset.timelinePosition).toBe("1");
    expect(root.dataset.confirmedEvents).toBe("0");
    expect(evidence).not.toHaveBeenCalled();
    task.destroy();
    vi.runOnlyPendingTimers();
    expect(evidence).not.toHaveBeenCalled();
  });

  it("does not resume a semantic transition after its course stage is destroyed", async () => {
    vi.useFakeTimers();
    const document = new FakeDocument();
    const host = document.createElement("div");
    const lesson = FOA_LESSONS[0]!;
    const task = createFoaTaskLesson(host as unknown as HTMLElement, lesson, {
      locale: "en",
      reducedMotion: true,
    });

    action(host, "start").emit("click");
    semanticSceneNodes(host)[0]!.emit("click");
    task.destroy();

    await vi.runAllTimersAsync();
    expect(host.children).toHaveLength(0);
  });
});

function action(host: FakeElement, value: string): FakeElement {
  const found = walk(host).find((element) => element.dataset.taskLessonAction === value);
  if (found === undefined) throw new Error(`Missing task lesson action: ${value}`);
  return found;
}

function semanticSceneNodes(host: FakeElement): FakeElement[] {
  return walk(host).filter(
    (element) =>
      element.className === "foa-semantic-scene__node" && element.dataset.eventId !== undefined,
  );
}

function teachingSourceLines(host: FakeElement): FakeElement[] {
  return walk(host).filter((element) => element.dataset.sourceLine !== undefined);
}

function timelineItems(host: FakeElement): FakeElement[] {
  return walk(host).filter(
    (element) => element.parentElement?.className === "library-task-stage__progress",
  );
}

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(walk)];
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly defaultView = {
    matchMedia: () => ({ matches: false }),
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
  readonly classList = {
    add: (...names: string[]) => {
      this.className = [
        ...new Set([...this.className.split(/\s+/u).filter(Boolean), ...names]),
      ].join(" ");
    },
  };
  parentElement: FakeElement | null = null;
  className = "";
  hidden = false;
  disabled = false;
  draggable = false;
  tabIndex = 0;
  type = "";
  value = "";
  min = "";
  max = "";
  step = "";
  readonly style: Record<string, string> = {};
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

  append(...nodes: (FakeElement | string)[]): void {
    for (const node of nodes) {
      if (typeof node === "string") {
        this.ownText += node;
        continue;
      }
      node.parentElement?.removeChild(node);
      node.parentElement = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: (FakeElement | string)[]): void {
    this.ownText = "";
    this.clearChildren();
    this.append(...nodes);
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

  removeEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, init: Partial<FakeEvent> = {}): void {
    const event: FakeEvent = {
      type,
      target: this,
      currentTarget: this,
      key: "",
      dataTransfer: null,
      preventDefault: () => undefined,
      ...init,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  querySelector(selector: string): FakeElement | null {
    const match = /^\[data-([a-z-]+)\]$/u.exec(selector);
    if (match === null) return null;
    const key = match[1]!.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase());
    return walk(this).find((element) => element.dataset[key] !== undefined) ?? null;
  }

  matches(selector: string): boolean {
    return selector
      .split(",")
      .map((part) => part.trim())
      .some((part) => part === this.tagName.toLowerCase());
  }

  getBoundingClientRect(): DOMRect {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    };
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
  readonly key: string;
  readonly dataTransfer: DataTransfer | null;
  preventDefault(): void;
}
