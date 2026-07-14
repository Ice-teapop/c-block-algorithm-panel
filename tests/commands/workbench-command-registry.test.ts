import { describe, expect, it, vi } from "vitest";
import { WorkbenchCommandRegistry } from "../../src/commands/index.js";
import type { RegisteredCommand } from "../../src/workbench/contracts.js";

describe("WorkbenchCommandRegistry", () => {
  it("binds declared metadata to executable handlers in stable order", async () => {
    const execute = vi.fn();
    const registry = new WorkbenchCommandRegistry({
      contributions: [
        contribution("command.second", "Second", 20),
        contribution("command.first", "First", 10),
      ],
      handlers: [
        handler("command.second", execute),
        handler("command.first", execute, { keywords: ["alpha"], shortcut: "⌘1" }),
      ],
    });

    expect(registry.listAvailable().map(({ id }) => id)).toEqual([
      "command.first",
      "command.second",
    ]);
    expect(registry.listAvailable()[0]).toEqual(
      expect.objectContaining({ keywords: ["alpha"], shortcut: "⌘1", moduleId: "test.module" }),
    );
    await registry.execute("command.first");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("hides unavailable commands and fails closed when availability throws", async () => {
    const registry = new WorkbenchCommandRegistry({
      contributions: [
        contribution("command.ready", "Ready", 0),
        contribution("command.hidden", "Hidden", 10),
        contribution("command.broken", "Broken", 20),
      ],
      handlers: [
        handler("command.ready", () => undefined),
        handler("command.hidden", () => undefined, { isAvailable: () => false }),
        handler("command.broken", () => undefined, {
          isAvailable: () => {
            throw new Error("context unavailable");
          },
        }),
      ],
    });

    expect(registry.listAvailable().map(({ id }) => id)).toEqual(["command.ready"]);
    await expect(registry.execute("command.hidden")).rejects.toThrow(/当前不可用/u);
  });

  it("rejects undeclared or duplicate handlers atomically", () => {
    const registry = new WorkbenchCommandRegistry({
      contributions: [contribution("command.ready", "Ready", 0)],
    });

    expect(() =>
      registry.registerAll([
        handler("command.ready", () => undefined),
        handler("command.missing", () => undefined),
      ]),
    ).toThrow(/尚未声明/u);
    expect(registry.snapshot()).toEqual([]);
    registry.register(handler("command.ready", () => undefined));
    expect(() => registry.register(handler("command.ready", () => undefined))).toThrow(/重复/u);
  });

  it("removes handlers during idempotent teardown", () => {
    const registry = new WorkbenchCommandRegistry({
      contributions: [contribution("command.ready", "Ready", 0)],
      handlers: [handler("command.ready", () => undefined)],
    });
    registry.destroy();
    registry.destroy();
    expect(() => registry.listAvailable()).toThrow(/已销毁/u);
  });
});

function contribution(id: string, label: string, order: number): RegisteredCommand {
  return Object.freeze({ id, label, order, moduleId: "test.module" });
}

function handler(
  id: string,
  execute: () => void,
  options: {
    readonly keywords?: readonly string[];
    readonly shortcut?: string;
    readonly isAvailable?: () => boolean;
  } = {},
) {
  return Object.freeze({
    id,
    group: "Test",
    detail: "Test command",
    execute,
    ...options,
  });
}
