import { describe, expect, it } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import {
  createFoaTaskLesson,
  foaTaskEventLine,
  isVerifiedWorkspaceEvidenceForLesson,
  localEvidenceType,
} from "../../src/ui/foa-task-lesson.js";

describe("FOA task lesson helpers", () => {
  it("maps every local mode to course-recordable completion evidence", () => {
    expect(localEvidenceType("semantic")).toBe("semantic-sequence-completed");
    expect(localEvidenceType("block-observe")).toBe("block-observation-completed");
    expect(localEvidenceType("block-complete")).toBe("block-gap-completed");
    expect(localEvidenceType("block-compose")).toBe("block-composition-completed");
    expect(localEvidenceType("workspace-evidence")).toBeNull();
  });

  it("accepts workspace completion only for matching, explicitly verified mastery", () => {
    const lesson = { id: "tutorial.foa.example" };
    expect(
      isVerifiedWorkspaceEvidenceForLesson(
        {
          lessonId: lesson.id,
          mastered: true,
          completedCaseId: "case-3",
          nextCaseId: null,
          verified: true,
        },
        lesson,
      ),
    ).toBe(true);
    expect(
      isVerifiedWorkspaceEvidenceForLesson(
        {
          lessonId: lesson.id,
          mastered: false,
          completedCaseId: "case-1",
          nextCaseId: "case-2",
          verified: true,
        },
        lesson,
      ),
    ).toBe(false);
    expect(
      isVerifiedWorkspaceEvidenceForLesson(
        {
          lessonId: lesson.id,
          mastered: true,
          completedCaseId: "case-3",
          nextCaseId: null,
          verified: false,
        } as unknown as {
          readonly lessonId: string;
          readonly mastered: boolean;
          readonly completedCaseId: string | null;
          readonly nextCaseId: string | null;
          readonly verified: true;
        },
        lesson,
      ),
    ).toBe(false);
  });

  it("keeps source highlighting tied to semantic anchors", () => {
    const lesson = {
      code: {
        text: [
          "#include <stdio.h>",
          "int main(void) {",
          "  /* FOA_STEP */",
          '  printf("ok\\n");',
          "}",
        ].join("\n"),
      },
      semanticEvents: [
        { codeAnchor: "scanf/input" },
        { codeAnchor: "FOA_STEP" },
        { codeAnchor: "core-step" },
        { codeAnchor: "printf/output" },
      ],
    } as never;
    expect(foaTaskEventLine(lesson, 0)).toBe(1);
    expect(foaTaskEventLine(lesson, 1)).toBe(3);
    expect(foaTaskEventLine(lesson, 2)).toBe(3);
    expect(foaTaskEventLine(lesson, 3)).toBe(4);
  });

  it("restarts a completed workspace lesson directly and keeps introduction navigation separate", () => {
    const lesson = FOA_LESSONS.find((candidate) => candidate.mode === "workspace-evidence")!;
    const document = new FakeDocument();
    const host = document.createElement("div");
    const task = createFoaTaskLesson(host as unknown as HTMLElement, lesson, { locale: "en" });
    const evidence = {
      lessonId: lesson.id,
      mastered: true,
      completedCaseId: "verified-case",
      nextCaseId: null,
      verified: true,
    } as const;

    action(host, "start").emit("click");
    task.setVerifiedWorkspaceEvidence(evidence);
    expect(task.phase).toBe("completed");
    action(host, "repeat").emit("click");
    expect(task.phase).toBe("task");

    task.setVerifiedWorkspaceEvidence(evidence);
    action(host, "back-to-intro").emit("click");
    expect(task.phase).toBe("intro");
  });
});

function action(host: FakeElement, value: string): FakeElement {
  const found = walk(host).find((element) => element.dataset.taskLessonAction === value);
  if (found === undefined) throw new Error(`Missing task lesson action: ${value}`);
  return found;
}

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(walk)];
}

class FakeDocument {
  readonly defaultView = { matchMedia: () => ({ matches: false }) };

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

class FakeElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<() => void>>();
  parentElement: FakeElement | null = null;
  className = "";
  disabled = false;
  tabIndex = 0;
  type = "";
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
      } else {
        node.parentElement = this;
        this.children.push(node);
      }
    }
  }

  replaceChildren(...nodes: (FakeElement | string)[]): void {
    this.ownText = "";
    this.clearChildren();
    this.append(...nodes);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  private clearChildren(): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0);
  }
}
