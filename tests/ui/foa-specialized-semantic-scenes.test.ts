import { describe, expect, it, vi } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import { getFoaSceneProfile } from "../../src/tutorials/foa-scene-profiles.js";
import { createFoaSpecializedSemanticScene } from "../../src/ui/foa-specialized-semantic-scene.js";

describe("FOA specialized semantic scenes", () => {
  it("separates lesson 47's forward process from one evidence-gated alias", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[46]!;
    const profile = getFoaSceneProfile(lesson);
    const scene = createFoaSpecializedSemanticScene(
      document as unknown as Document,
      lesson,
      profile,
      { locale: "zh", reducedMotion: true, onAttempt: vi.fn() },
    )!;
    const root = scene.root as unknown as FakeElement;
    const aliasEdges = byDataset(root, "pointerAliasEdge");
    const alias = aliasEdges[0]!;
    const value = byDataset(root, "pointerObjectValue")[0]!;

    expect(profile.pointerAlias).toMatchObject({
      objectName: "value",
      pointerName: "address",
      revealAfterConfirmedCount: 2,
      writeAfterConfirmedCount: 3,
    });
    expect(Object.isFrozen(profile.pointerAlias)).toBe(true);
    expect(root.dataset.specializedScene).toBe("pointer-alias");
    expect(processEdges(root)).toEqual(["0:1", "1:2", "2:3"]);
    expect(aliasEdges).toHaveLength(1);
    expect(alias.hidden).toBe(true);
    expect(value.textContent).toBe("7");

    setProgress(scene, 1);
    expect(alias.hidden).toBe(true);
    expect(value.textContent).toBe("7");

    setProgress(scene, 2);
    expect(alias.hidden).toBe(false);
    expect(value.textContent).toBe("7");
    expect(byDataset(root, "pointerAliasStatus")[0]!.textContent).toContain("别名已成立");

    setProgress(scene, 3);
    expect(alias.hidden).toBe(false);
    expect(value.textContent).toBe("9");
    expect(byDataset(root, "pointerAliasEdge")).toEqual([alias]);

    scene.setLocale("en");
    expect(root.textContent).toContain("Object and alias");
    expect(root.textContent).toContain("Alias established");
    expect(root.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("renders lesson 54 as a stable 2 by 3 grid with row, column, and sum evidence", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[53]!;
    const profile = getFoaSceneProfile(lesson);
    const scene = createFoaSpecializedSemanticScene(
      document as unknown as Document,
      lesson,
      profile,
      { locale: "zh", reducedMotion: true, onAttempt: vi.fn() },
    )!;
    const root = scene.root as unknown as FakeElement;
    const panel = byDataset(root, "matrixPanel")[0]!;
    const rows = byDataset(root, "matrixRow").filter(
      (element) => element.className === "foa-matrix-scene__row",
    );
    const cells = byDataset(root, "matrixCell");
    const cellReferences = [...cells];
    const sum = byDataset(root, "matrixSum")[0]!;
    const cursor = byDataset(root, "matrixCursor")[0]!;
    const outputs = byDataset(root, "matrixRowOutput");

    expect(profile.matrixCase?.values).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(Object.isFrozen(profile.matrixCase?.values)).toBe(true);
    expect(profile.matrixCase?.values.every(Object.isFrozen)).toBe(true);
    expect(root.dataset.specializedScene).toBe("matrix-grid");
    expect(processEdges(root)).toEqual(["0:1", "1:2", "2:3"]);
    expect(panel.dataset.activeRow).toBe("none");
    expect(panel.dataset.activeColumn).toBe("none");
    expect(rows).toHaveLength(2);
    expect(cells).toHaveLength(6);
    expect(cells.map((cell) => cell.textContent)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(sum.textContent).toBe("当前行累计: 0");

    setProgress(scene, 1);
    expect(panel.dataset.activeRow).toBe("0");
    expect(panel.dataset.activeColumn).toBe("0");
    expect(rows[0]!.dataset.state).toBe("active");
    expect(cells[0]!.dataset.cursor).toBe("true");
    expect(sum.textContent).toBe("当前行累计: 0");

    setProgress(scene, 2);
    expect(panel.dataset.activeColumn).toBe("2");
    expect(cells.slice(0, 3).every((cell) => cell.dataset.visited === "true")).toBe(true);
    expect(cells[2]!.dataset.cursor).toBe("true");
    expect(sum.textContent).toBe("当前行累计: 6");

    setProgress(scene, 3);
    expect(outputs[0]!.textContent).toBe("行 0 = 6");
    expect(outputs[1]!.textContent).toBe("行 1 = 待输出");

    setProgress(scene, 4, true);
    expect(byDataset(root, "matrixCell")).toEqual(cellReferences);
    expect(panel.dataset.activeRow).toBe("1");
    expect(panel.dataset.activeColumn).toBe("2");
    expect(rows[0]!.dataset.state).toBe("done");
    expect(rows[1]!.dataset.state).toBe("active");
    expect(cells[5]!.dataset.cursor).toBe("true");
    expect(cells.every((cell) => cell.dataset.visited === "true")).toBe(true);
    expect(sum.textContent).toBe("当前行累计: 15");
    expect(outputs.map((output) => output.textContent)).toEqual(["行 0 = 6", "行 1 = 15"]);

    scene.setLocale("en");
    expect(root.textContent).toContain("2 × 3 row scan");
    expect(root.textContent).toContain("Current row sum: 15");
    expect(root.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("returns null for lessons that intentionally use the shared semantic scene", () => {
    const lesson = FOA_LESSONS[0]!;
    expect(
      createFoaSpecializedSemanticScene(
        new FakeDocument() as unknown as Document,
        lesson,
        getFoaSceneProfile(lesson),
        { locale: "en", reducedMotion: true, onAttempt: vi.fn() },
      ),
    ).toBeNull();
  });
});

function setProgress(
  scene: NonNullable<ReturnType<typeof createFoaSpecializedSemanticScene>>,
  confirmedCount: number,
  completed = false,
): void {
  scene.setState({
    displayIndex: Math.min(confirmedCount, 3),
    confirmedCount,
    previewing: false,
    completed,
  });
}

function processEdges(root: FakeElement): string[] {
  return walk(root)
    .filter((element) => element.dataset.fromIndex !== undefined)
    .map((element) => `${element.dataset.fromIndex}:${element.dataset.toIndex}`);
}

function byDataset(root: FakeElement, key: string): FakeElement[] {
  return walk(root).filter((element) => element.dataset[key] !== undefined);
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
  readonly isConnected = false;
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

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  animate(): Animation {
    return {
      cancel: () => undefined,
      finished: Promise.resolve(),
    } as unknown as Animation;
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
