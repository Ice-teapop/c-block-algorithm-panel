import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectionStatus } from "../../src/ui/projection-status.js";

describe("projection status banner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts hidden with polite status semantics", () => {
    const { host, output } = setupDom();
    const status = createProjectionStatus(host as unknown as HTMLElement);

    expect(host.prepended).toBe(output);
    expect(output.className).toBe("projection-status");
    expect(output.attribute("role")).toBe("status");
    expect(output.attribute("aria-live")).toBe("polite");
    expect(output.attribute("aria-atomic")).toBe("true");
    expect(output.hidden).toBe(true);
    expect(output.dataset.state).toBe("hidden");
    expect(output.textContent).toBe("");
    expect(status.element).toBe(output);
  });

  it.each([
    ["synced", "代码与积木已同步"],
    ["pending", "正在更新积木投影…"],
    ["held", "代码尚未形成稳定结构，积木暂时保持上次结果"],
    ["recovery", "代码仍有局部语法问题，已显示可恢复积木"],
  ] as const)("renders the %s state with stable default copy", (state, message) => {
    const { host, output } = setupDom();
    const status = createProjectionStatus(host as unknown as HTMLElement);

    status.setState(state);

    expect(output.hidden).toBe(false);
    expect(output.dataset.state).toBe(state);
    expect(output.textContent).toBe(message);
  });

  it("supports caller copy, validates input and clears content when hidden", () => {
    const { host, output } = setupDom();
    const status = createProjectionStatus(host as unknown as HTMLElement);

    status.setState("pending", "重新解析中");
    expect(output.textContent).toBe("重新解析中");
    expect(() => status.setState("invalid" as never)).toThrow(/未知 projection status/u);
    expect(() => status.setState("pending", 42 as never)).toThrow(/message/u);

    status.setState("hidden");
    expect(output.hidden).toBe(true);
    expect(output.textContent).toBe("");
  });

  it("removes itself exactly once and rejects post-destroy updates", () => {
    const { host, output } = setupDom();
    const status = createProjectionStatus(host as unknown as HTMLElement);

    status.destroy();
    status.destroy();

    expect(output.removeCount).toBe(1);
    expect(() => status.setState("synced")).toThrow(/已销毁/u);
  });
});

function setupDom(): { host: FakeHost; output: FakeOutput } {
  const host = new FakeHost();
  const output = new FakeOutput();
  vi.stubGlobal("document", {
    createElement(tagName: string) {
      expect(tagName).toBe("output");
      return output;
    },
  });
  return { host, output };
}

class FakeHost {
  prepended: FakeOutput | null = null;

  prepend(output: FakeOutput): void {
    this.prepended = output;
  }
}

class FakeOutput {
  className = "";
  hidden = false;
  textContent = "";
  removeCount = 0;
  readonly dataset: Record<string, string | undefined> = {};
  private readonly attributes = new Map<string, string>();

  attribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  remove(): void {
    this.removeCount += 1;
  }
}
