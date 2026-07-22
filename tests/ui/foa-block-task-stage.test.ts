import { describe, expect, it, vi } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import {
  buildFoaSourceBlockDescriptors,
  createFoaBlockTaskStage,
  foaPointerDragOffset,
  initialFoaCompositionOrder,
  isFoaCompositionCorrect,
} from "../../src/ui/foa-block-task-stage.js";
import { teachingBoilerplateLineNumbers } from "../../src/ui/teaching-source-view.js";

describe("FOA progressive block task stage", () => {
  it("keeps pointer movement one-to-one from the original grab point", () => {
    expect(
      foaPointerDragOffset({ left: 100, top: 40 }, { x: 18, y: 9 }, { x: 178, y: 89 }),
    ).toEqual({ x: 60, y: 40 });
  });

  it("projects all 105 guided lessons to explicit ranges from their own C source", () => {
    const guidedLessons = FOA_LESSONS.slice(0, 105);
    expect(guidedLessons).toHaveLength(105);
    for (const lesson of guidedLessons) {
      const descriptors = buildFoaSourceBlockDescriptors(lesson);
      const boilerplateLines = teachingBoilerplateLineNumbers(lesson.code.text.split("\n"));
      expect(boilerplateLines.size).toBeGreaterThan(0);
      expect(descriptors).toHaveLength(lesson.semanticEvents.length);
      for (const descriptor of descriptors) {
        const sourceAnchor = lesson.semanticEvents.find(
          (event) => event.id === descriptor.eventId,
        )?.sourceAnchor;
        expect(sourceAnchor).not.toBeNull();
        expect(descriptor.sourceLine).toBeGreaterThan(0);
        expect(descriptor.sourceColumnStart).toBeGreaterThan(0);
        expect(descriptor.sourceColumnEnd).toBeGreaterThan(descriptor.sourceColumnStart);
        expect(descriptor.sourceText.trim().length).toBeGreaterThan(0);
        expect(
          lesson.code.text.slice(descriptor.sourceStartOffset, descriptor.sourceEndOffset),
        ).toBe(descriptor.sourceText);
        expect(sourceAnchor?.exact).toBe(descriptor.sourceText);
        expect(
          lesson.code.text
            .split("\n")
            [descriptor.sourceLine - 1]?.slice(
              descriptor.sourceColumnStart - 1,
              descriptor.sourceColumnEnd - 1,
            ),
        ).toBe(descriptor.sourceText);
      }
    }
  });

  it("keeps the reviewed lessons 1, 41, and 60 on their intended C expressions", () => {
    expect(buildFoaSourceBlockDescriptors(FOA_LESSONS[0]!).map((item) => item.sourceText)).toEqual([
      "int main(void) {",
      'puts("Hello, algorithm!");',
      'puts("Hello, algorithm!");',
      "return 0;",
    ]);
    expect(buildFoaSourceBlockDescriptors(FOA_LESSONS[40]!).map((item) => item.sourceText)).toEqual(
      ["return x * 2;", "twice(10)", "return x + 1;", 'printf("%d\\n", plus_one(twice(10)));'],
    );
    expect(buildFoaSourceBlockDescriptors(FOA_LESSONS[59]!).map((item) => item.sourceText)).toEqual(
      [
        "size_t j = i;",
        "values[j - 1] > values[j]",
        "values[j - 1] = values[j];",
        "values[j] = temporary;",
      ],
    );
  });

  it("confirms stable source-backed blocks in order for lessons 61-75", () => {
    const lesson = FOA_LESSONS[60]!;
    expect(lesson.mode).toBe("block-observe");
    const document = new FakeDocument();
    const host = document.createElement("div");
    const evidence = vi.fn();
    const task = createFoaBlockTaskStage(host as unknown as HTMLElement, lesson, {
      locale: "zh",
      reducedMotion: true,
      onLocalEvidence: evidence,
    });

    action(host, "start").emit("click");
    expect(host.children[0]!.dataset.layoutBasis).toBe("container");
    expect(host.children[0]!.attributes.get("style")).toContain("container-name: tutorial-stage");
    const interactionRegion = walk(host).find(
      (element) => element.className === "foa-block-stage__interaction",
    )!;
    const sourceViewport = walk(host).find((element) => element.tagName === "pre")!;
    expect(interactionRegion.tabIndex).toBe(0);
    expect(interactionRegion.attributes.get("role")).toBe("region");
    expect(interactionRegion.attributes.get("aria-label")).toBe("执行顺序");
    expect(sourceViewport.tabIndex).toBe(0);
    expect(sourceViewport.attributes.get("role")).toBe("region");
    expect(sourceViewport.attributes.get("aria-label")).toBe("真实 C 源码");
    const originalBlocks = new Map(
      sequenceBlocks(host).map((block) => [block.dataset.foaBlockEventId, block]),
    );
    const observeTransfer = new FakeDataTransfer();
    for (const block of originalBlocks.values()) expect(block.draggable).toBe(false);
    originalBlocks.get(lesson.semanticEvents[0]!.id)!.emit("dragstart", {
      dataTransfer: observeTransfer as unknown as DataTransfer,
    });
    expect(observeTransfer.getData("text/plain")).toBe("");
    expect(host.children[0]!.dataset.draggingEventId).toBeUndefined();
    const descriptors = buildFoaSourceBlockDescriptors(lesson);
    for (const descriptor of descriptors) {
      const block = originalBlocks.get(descriptor.eventId)!;
      expect(block.textContent).toContain(descriptor.sourceText);
      expect(block.title).toContain(descriptor.sourceText);
      expect(block.textContent).not.toBe(
        lesson.semanticEvents.find((event) => event.id === descriptor.eventId)?.label.zh,
      );
    }

    originalBlocks.get(lesson.semanticEvents[1]!.id)!.emit("click");
    expect(evidence).not.toHaveBeenCalled();
    expect(feedback(host).dataset.kind).toBe("incorrect");

    for (const event of lesson.semanticEvents) originalBlocks.get(event.id)!.emit("click");
    expect(task.phase).toBe("completed");
    expect(evidence).toHaveBeenCalledOnce();
    expect(evidence).toHaveBeenCalledWith({
      type: "block-observation-completed",
      lessonId: lesson.id,
      complete: true,
    });

    task.setLocale("en");
    expect(interactionRegion.attributes.get("aria-label")).toBe("Execution sequence");
    expect(sourceViewport.attributes.get("aria-label")).toBe("Real C source");
    for (const block of sequenceBlocks(host)) {
      expect(block).toBe(originalBlocks.get(block.dataset.foaBlockEventId));
      expect(block.textContent).toContain("line");
    }
    action(host, "repeat").emit("click");
    expect(task.phase).toBe("task");
    for (const event of lesson.semanticEvents) originalBlocks.get(event.id)!.emit("click");
    action(host, "back-to-intro").emit("click");
    expect(task.phase).toBe("intro");
    task.destroy();
    expect(host.children).toHaveLength(0);
  });

  it("keeps a key source line redacted until the correct compatible block is dropped", () => {
    const lesson = FOA_LESSONS[75]!;
    expect(lesson.mode).toBe("block-complete");
    const document = new FakeDocument();
    const host = document.createElement("div");
    const evidence = vi.fn();
    const task = createFoaBlockTaskStage(host as unknown as HTMLElement, lesson, {
      locale: "en",
      onLocalEvidence: evidence,
    });
    action(host, "start").emit("click");
    expect(action(host, "block-gap").tabIndex).toBe(-1);

    const target = lesson.semanticEvents[2]!;
    const targetDescriptor = buildFoaSourceBlockDescriptors(lesson)[2]!;
    const targetSourceLine = sourceLine(host, targetDescriptor.sourceLine);
    expect(targetSourceLine.dataset.redacted).toBe("true");
    expect(targetSourceLine.textContent).toContain("key line hidden");

    const candidates = candidateBlocks(host);
    expect(candidates.every((candidate) => candidate.draggable)).toBe(true);
    candidates.find((candidate) => candidate.dataset.foaBlockEventId !== target.id)!.emit("click");
    expect(evidence).not.toHaveBeenCalled();
    expect(feedback(host).dataset.kind).toBe("incorrect");

    const targetCandidate = candidates.find(
      (candidate) => candidate.dataset.foaBlockEventId === target.id,
    )!;
    const transfer = new FakeDataTransfer();
    targetCandidate.emit("dragstart", { dataTransfer: transfer as unknown as DataTransfer });
    action(host, "block-gap").emit("drop", {
      dataTransfer: transfer as unknown as DataTransfer,
    });

    expect(task.phase).toBe("completed");
    expect(evidence).toHaveBeenCalledWith({
      type: "block-gap-completed",
      lessonId: lesson.id,
      complete: true,
    });
    expect(targetSourceLine.dataset.redacted).toBe("false");
    expect(targetSourceLine.textContent).toContain(targetDescriptor.sourceText);
  });

  it("requires the complete source-backed block order and supports keyboard reordering", () => {
    const lesson = FOA_LESSONS[90]!;
    expect(lesson.mode).toBe("block-compose");
    const document = new FakeDocument();
    const host = document.createElement("div");
    const evidence = vi.fn();
    const task = createFoaBlockTaskStage(host as unknown as HTMLElement, lesson, {
      locale: "zh",
      onLocalEvidence: evidence,
    });
    action(host, "start").emit("click");

    const references = new Map(
      sequenceBlocks(host).map((block) => [block.dataset.foaBlockEventId, block]),
    );
    expect([...references.values()].every((block) => block.draggable)).toBe(true);
    action(host, "verify-composition").emit("click");
    expect(evidence).not.toHaveBeenCalled();
    expect(feedback(host).dataset.kind).toBe("incorrect");

    const expectedIds = lesson.semanticEvents.map((event) => event.id);
    for (let expectedIndex = 0; expectedIndex < expectedIds.length; expectedIndex += 1) {
      const id = expectedIds[expectedIndex]!;
      let currentIndex = orderedSequenceIds(host).indexOf(id);
      while (currentIndex > expectedIndex) {
        references.get(id)!.emit("keydown", { key: "ArrowUp" });
        currentIndex -= 1;
      }
    }
    expect(orderedSequenceIds(host)).toEqual(expectedIds);
    action(host, "verify-composition").emit("click");

    expect(task.phase).toBe("completed");
    expect(evidence).toHaveBeenCalledWith({
      type: "block-composition-completed",
      lessonId: lesson.id,
      complete: true,
    });
    for (const block of sequenceBlocks(host)) {
      expect(block).toBe(references.get(block.dataset.foaBlockEventId));
    }
    task.setReducedMotion(true);
    expect(host.children[0]!.dataset.reducedMotion).toBe("true");
  });

  it("reorders with pointer capture, rAF tracking, and the original grab offset", () => {
    const lesson = FOA_LESSONS[90]!;
    const document = new FakeDocument();
    const host = document.createElement("div");
    createFoaBlockTaskStage(host as unknown as HTMLElement, lesson, {
      locale: "en",
      reducedMotion: true,
    });
    action(host, "start").emit("click");
    const blocks = sequenceBlocks(host);
    const dragged = blocks[0]!;
    const target = blocks[2]!;
    const draggedId = dragged.dataset.foaBlockEventId!;
    const targetId = target.dataset.foaBlockEventId!;
    const targetIndex = orderedSequenceIds(host).indexOf(targetId);
    dragged.left = 100;
    dragged.top = 40;
    document.hitTarget = target;

    dragged.emit("pointerdown", {
      pointerId: 7,
      button: 0,
      isPrimary: true,
      clientX: 118,
      clientY: 49,
    });
    dragged.emit("pointermove", {
      pointerId: 7,
      clientX: 178,
      clientY: 89,
    });
    expect(dragged.style.transform).toBe("translate3d(60px, 40px, 0)");
    expect(target.dataset.pointerDropState).toBe("compatible");

    dragged.emit("pointerup", {
      pointerId: 7,
      clientX: 178,
      clientY: 89,
    });

    expect(orderedSequenceIds(host).indexOf(draggedId)).toBe(targetIndex);
    expect(dragged.style.transform).toBe("");
    expect(target.dataset.pointerDropState).toBeUndefined();
    expect(host.children[0]!.dataset.pointerDraggingEventId).toBeUndefined();
  });

  it("uses a deterministic non-solution composition and validates exact order", () => {
    const expected = ["read", "bind", "decide", "write"];
    const initial = initialFoaCompositionOrder(expected);
    expect(initial).toEqual(["bind", "decide", "write", "read"]);
    expect(isFoaCompositionCorrect(initial, expected)).toBe(false);
    expect(isFoaCompositionCorrect(expected, expected)).toBe(true);
    expect(Object.isFrozen(initial)).toBe(true);
  });

  it("rejects missing and ambiguous source anchors instead of guessing a line", () => {
    const code = {
      kind: "complete",
      text: "int main(void) {\n  int value = 1;\n  int value = 1;\n}\n",
      placeholders: [],
    };
    const baseEvent = {
      id: "event.bind",
      type: "bind",
      label: { zh: "绑定", en: "Bind" },
      codeAnchor: "int value = 1;",
    };

    expect(() =>
      buildFoaSourceBlockDescriptors({
        code,
        semanticEvents: [{ ...baseEvent, sourceAnchor: null }],
      } as never),
    ).toThrow(/no explicit source anchor/u);
    expect(() =>
      buildFoaSourceBlockDescriptors({
        code,
        semanticEvents: [{ ...baseEvent, sourceAnchor: { exact: "missing();" } }],
      } as never),
    ).toThrow(/missing from generated C source/u);
    expect(() =>
      buildFoaSourceBlockDescriptors({
        code,
        semanticEvents: [{ ...baseEvent, sourceAnchor: { exact: "int value = 1;" } }],
      } as never),
    ).toThrow(/ambiguous in generated C source/u);
  });
});

function action(host: FakeElement, value: string): FakeElement {
  const found = walk(host).find((element) => element.dataset.taskLessonAction === value);
  if (found === undefined) throw new Error(`Missing task action ${value}`);
  return found;
}

function sequenceBlocks(host: FakeElement): FakeElement[] {
  return walk(host).filter((element) => element.dataset.blockRole === "sequence");
}

function candidateBlocks(host: FakeElement): FakeElement[] {
  return walk(host).filter((element) => element.dataset.blockRole === "candidate");
}

function orderedSequenceIds(host: FakeElement): string[] {
  const sequence = walk(host).find((element) => element.className === "foa-block-stage__sequence")!;
  return sequence.children
    .filter((element) => element.dataset.blockRole === "sequence")
    .map((element) => element.dataset.foaBlockEventId!);
}

function feedback(host: FakeElement): FakeElement {
  return walk(host).find((element) => element.className === "foa-block-stage__feedback")!;
}

function sourceLine(host: FakeElement, line: number): FakeElement {
  return walk(host).find((element) => element.dataset.sourceLine === String(line))!;
}

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(walk)];
}

class FakeDataTransfer {
  effectAllowed = "none";
  private readonly values = new Map<string, string>();

  setData(format: string, value: string): void {
    this.values.set(format, value);
  }

  getData(format: string): string {
    return this.values.get(format) ?? "";
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  hitTarget: FakeElement | null = null;
  readonly defaultView = {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
    cancelAnimationFrame: () => undefined,
    setTimeout: (callback: () => void) => {
      callback();
      return 1;
    },
  };

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }

  elementFromPoint(): FakeElement | null {
    return this.hitTarget;
  }
}

class FakeElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly style: Record<string, string> = {
    position: "",
    pointerEvents: "",
    touchAction: "",
    transform: "",
    willChange: "",
    zIndex: "",
  };
  parentElement: FakeElement | null = null;
  className = "";
  hidden = false;
  disabled = false;
  draggable = false;
  tabIndex = 0;
  type = "";
  title = "";
  left = 0;
  top = 0;
  width = 120;
  height = 40;
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

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string, init: Partial<FakeEvent> = {}): void {
    const event: FakeEvent = {
      type,
      target: this,
      currentTarget: this,
      key: "",
      dataTransfer: null,
      pointerId: 0,
      button: 0,
      isPrimary: true,
      clientX: 0,
      clientY: 0,
      preventDefault: () => undefined,
      ...init,
    };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  setPointerCapture(): void {}

  releasePointerCapture(): void {}

  getBoundingClientRect(): DOMRect {
    return {
      left: this.left,
      top: this.top,
      right: this.left + this.width,
      bottom: this.top + this.height,
      width: this.width,
      height: this.height,
      x: this.left,
      y: this.top,
      toJSON: () => ({}),
    };
  }

  contains(candidate: FakeElement): boolean {
    return this === candidate || this.children.some((child) => child.contains(candidate));
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current !== null) {
      if (
        selector === '[data-task-lesson-action="block-gap"]' &&
        current.dataset.taskLessonAction === "block-gap"
      ) {
        return current;
      }
      if (
        selector === '.foa-block-stage__block[data-block-role="sequence"]' &&
        current.className === "foa-block-stage__block" &&
        current.dataset.blockRole === "sequence"
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
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
  readonly pointerId: number;
  readonly button: number;
  readonly isPrimary: boolean;
  readonly clientX: number;
  readonly clientY: number;
  preventDefault(): void;
}
