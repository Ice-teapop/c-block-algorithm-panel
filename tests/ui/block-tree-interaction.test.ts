import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createBlockTree } from "../../src/ui/block-tree.js";

const source = readFileSync(new URL("../../src/ui/block-tree.ts", import.meta.url), "utf8");

describe("block tree interaction gate", () => {
  it("mirrors disabled interaction onto inert and aria-disabled", () => {
    const host = new FakeHost();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn());

    tree.setInteractionEnabled(false);
    expect(host.inert).toBe(true);
    expect(host.attribute("aria-disabled")).toBe("true");

    tree.setInteractionEnabled(true);
    expect(host.inert).toBe(false);
    expect(host.attribute("aria-disabled")).toBeUndefined();
  });

  it("guards both pointer and keyboard handlers while disabled", () => {
    expect(source.match(/if \(!interactionEnabled\) return;/gu)).toHaveLength(2);
    expect(source).toContain('host.addEventListener("click", onClick)');
    expect(source).toContain('host.addEventListener("keydown", onKeyDown)');
  });

  it("clears listeners, inert metadata and content during idempotent teardown", () => {
    const host = new FakeHost();
    const tree = createBlockTree(host as unknown as HTMLElement, vi.fn());
    tree.setInteractionEnabled(false);

    tree.destroy();
    tree.destroy();

    expect(host.inert).toBe(false);
    expect(host.attribute("aria-disabled")).toBeUndefined();
    expect(host.removeCount("click")).toBe(1);
    expect(host.removeCount("keydown")).toBe(1);
    expect(host.replaceChildrenCount).toBe(1);
    expect(() => tree.setInteractionEnabled(true)).toThrow(/已销毁/u);
  });
});

class FakeHost {
  inert = false;
  replaceChildrenCount = 0;
  private readonly attributes = new Map<string, string>();
  private readonly removeCounts = new Map<string, number>();

  attribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(): void {}

  removeEventListener(type: string): void {
    this.removeCounts.set(type, (this.removeCounts.get(type) ?? 0) + 1);
  }

  removeCount(type: string): number {
    return this.removeCounts.get(type) ?? 0;
  }

  replaceChildren(): void {
    this.replaceChildrenCount += 1;
  }
}
