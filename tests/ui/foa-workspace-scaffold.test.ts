import { describe, expect, it } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import { createFoaTaskLesson } from "../../src/ui/foa-task-lesson.js";

describe("FOA workspace lesson presentation", () => {
  it("renders the TODO scaffold, never the lesson reference template, in both locales", () => {
    for (const lesson of FOA_LESSONS.slice(105)) {
      const exercise = lesson.workspaceExercise;
      if (exercise === null) throw new Error(`${lesson.id} has no workspace exercise`);
      const document = new FakeDocument();
      const host = document.createElement("div");
      const task = createFoaTaskLesson(host as unknown as HTMLElement, lesson, { locale: "zh" });

      clickAction(host, "start");
      expect(renderedSource(host), `${lesson.id}.zh`).toBe(exercise.initialSource);
      expect(renderedSource(host), `${lesson.id}.zh`).not.toBe(lesson.code.text);

      task.setLocale("en");
      expect(renderedSource(host), `${lesson.id}.en`).toBe(exercise.initialSource);
      expect(renderedSource(host), `${lesson.id}.en`).not.toBe(lesson.code.text);
      task.destroy();
    }
  });
});

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly ownerDocument: FakeDocument;
  readonly #listeners = new Map<string, Set<() => void>>();
  className = "";
  textContent = "";
  type = "";
  disabled = false;
  tabIndex = 0;

  constructor(ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(_name: string, _value: string): void {}

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  emit(type: string): void {
    for (const listener of this.#listeners.get(type) ?? []) listener();
  }
}

class FakeDocument {
  createElement(_tagName: string): FakeElement {
    return new FakeElement(this);
  }
}

function walk(root: FakeElement): readonly FakeElement[] {
  return [root, ...root.children.flatMap((child) => walk(child))];
}

function clickAction(host: FakeElement, actionId: string): void {
  const target = walk(host).find((element) => element.dataset.taskLessonAction === actionId);
  if (target === undefined) throw new Error(`Missing task lesson action ${actionId}`);
  target.emit("click");
}

function renderedSource(host: FakeElement): string {
  return walk(host)
    .filter((element) => element.className === "teaching-source-view__content")
    .map(renderedText)
    .join("\n");
}

function renderedText(element: FakeElement): string {
  return element.textContent + element.children.map(renderedText).join("");
}
