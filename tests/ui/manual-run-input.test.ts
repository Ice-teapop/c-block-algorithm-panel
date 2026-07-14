import { describe, expect, it, vi } from "vitest";
import { createManualRunInput, sourceMayNeedRuntimeInput } from "../../src/ui/manual-run-input.js";

describe("manual run input locale", () => {
  it("updates controls, hints and aria copy without losing entered values", () => {
    const document = new FakeDocument();
    const shell = document.createElement("div");
    shell.id = "workbench-shell";
    shell.dataset.locale = "zh-CN";
    const host = document.createElement("div");
    shell.append(host);
    const input = createManualRunInput(host as unknown as HTMLElement, { onRun: vi.fn() });
    input.setNeeded(true);
    input.setValue({ stdin: "3\n", arguments: ["--verbose"] });

    shell.dataset.locale = "en";
    shell.dispatchEvent(new Event("workbench-locale-change"));

    const toggle = find(host, "manual-run-input__toggle");
    expect(toggle.textContent).toBe("Input set");
    expect(toggle.attributes.get("aria-label")).toBe("Open run input editor");
    expect(find(host, "manual-run-input__hint").textContent).toContain("standard input");
    expect(find(host, "manual-run-input__stdin").value).toBe("3\n");
    expect(find(host, "manual-run-input__args").value).toBe("--verbose");

    toggle.click();
    expect(toggle.attributes.get("aria-label")).toBe("Close run input editor");
    input.destroy();
  });
});

describe("manual run input detection", () => {
  it("detects direct standard input and main arguments", () => {
    expect(sourceMayNeedRuntimeInput('int main(void) { int x; scanf("%d", &x); }')).toBe(true);
    expect(
      sourceMayNeedRuntimeInput(
        "int main(int argc, char **argv) { return argc > 1 && argv[1] != 0; }",
      ),
    ).toBe(true);
    expect(sourceMayNeedRuntimeInput("int main(void) { return getchar(); }")).toBe(true);
  });

  it("requires an explicit stdin stream for stream-oriented calls", () => {
    expect(sourceMayNeedRuntimeInput("int main(void) { char b[8]; fgets(b, 8, stdin); }")).toBe(
      true,
    );
    expect(sourceMayNeedRuntimeInput("int main(void) { char b[8]; fgets(b, 8, file); }")).toBe(
      false,
    );
  });

  it("ignores input-looking text in comments and literals", () => {
    expect(
      sourceMayNeedRuntimeInput(
        'int main(void) { /* scanf("%d", &x); */ puts("getchar()"); return 0; }',
      ),
    ).toBe(false);
  });
});

class FakeDocument {
  createElement(_tagName: string): FakeElement {
    return new FakeElement(this);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, ((event?: Event) => void)[]>();
  parent: FakeElement | null = null;
  className = "";
  id = "";
  textContent = "";
  value = "";
  type = "";
  placeholder = "";
  rows = 0;
  hidden = false;

  constructor(readonly ownerDocument: FakeDocument) {}

  append(...children: FakeElement[]): void {
    for (const child of children) child.parent = this;
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of children) child.parent = this;
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: (event?: Event) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event?: Event) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  focus(): void {}

  remove(): void {
    const parent = this.parent;
    if (parent === null) return;
    const index = parent.children.indexOf(this);
    if (index >= 0) parent.children.splice(index, 1);
    this.parent = null;
  }

  closest<T extends Element>(selector: string): T | null {
    let candidate: FakeElement | null = this;
    while (candidate !== null) {
      if (selector === "#workbench-shell" && candidate.id === "workbench-shell") {
        return candidate as unknown as T;
      }
      candidate = candidate.parent;
    }
    return null;
  }
}

function find(root: FakeElement, className: string): FakeElement {
  if (root.className === className) return root;
  for (const child of root.children) {
    try {
      return find(child, className);
    } catch {
      // Continue through siblings.
    }
  }
  throw new Error(`Missing ${className}`);
}
