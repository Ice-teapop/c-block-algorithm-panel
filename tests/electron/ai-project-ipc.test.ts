import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";
import { registerAiProjectIpcHandlers } from "../../electron/main/ai-project-ipc.js";
import type { AiProjectStore } from "../../electron/main/ai-project-store.js";
import { AI_PROJECT_IPC_CHANNELS } from "../../src/shared/ai-project.js";

describe("AI Project IPC boundary", () => {
  it("registers seven narrow operations and authorizes each request", async () => {
    const harness = ipcHarness();
    const store = fakeStore();
    const authorize = vi.fn();
    registerAiProjectIpcHandlers({
      ipcMain: harness.ipcMain,
      store,
      authorize,
      isShuttingDown: () => false,
    });
    expect([...harness.handlers.keys()].sort()).toEqual(
      Object.values(AI_PROJECT_IPC_CHANNELS).sort(),
    );

    for (const channel of Object.values(AI_PROJECT_IPC_CHANNELS)) {
      await harness.invoke(channel, { opaque: "request" });
    }
    expect(authorize).toHaveBeenCalledTimes(7);
    expect(store.open).toHaveBeenCalledWith({ opaque: "request" });
    expect(store.appendMessage).toHaveBeenCalledWith({ opaque: "request" });
  });

  it("fails closed on bad arity, shutdown, or an untrusted sender", async () => {
    const harness = ipcHarness();
    const store = fakeStore();
    let shuttingDown = false;
    const authorize = vi.fn();
    registerAiProjectIpcHandlers({
      ipcMain: harness.ipcMain,
      store,
      authorize,
      isShuttingDown: () => shuttingDown,
    });
    await expect(harness.invoke(AI_PROJECT_IPC_CHANNELS.open)).resolves.toMatchObject({
      error: { code: "AI_PROJECT_INVALID_REQUEST" },
    });
    shuttingDown = true;
    await expect(harness.invoke(AI_PROJECT_IPC_CHANNELS.open, {})).resolves.toMatchObject({
      error: { code: "AI_PROJECT_CONTEXT_CLOSED" },
    });
    expect(store.open).not.toHaveBeenCalled();

    const rejectedHarness = ipcHarness();
    registerAiProjectIpcHandlers({
      ipcMain: rejectedHarness.ipcMain,
      store,
      authorize: () => {
        throw new Error("untrusted");
      },
      isShuttingDown: () => false,
    });
    await expect(rejectedHarness.invoke(AI_PROJECT_IPC_CHANNELS.open, {})).resolves.toMatchObject({
      error: { code: "AI_PROJECT_CONTEXT_CLOSED" },
    });
  });

  it("does not expose filesystem paths or credential operations", () => {
    expect(JSON.stringify(AI_PROJECT_IPC_CHANNELS)).not.toMatch(/path|credential|key|decrypt/iu);
  });
});

function fakeStore(): AiProjectStore {
  const failed = () =>
    Promise.resolve({
      status: "failed" as const,
      error: { code: "AI_PROJECT_INVALID_REQUEST" as const, message: "invalid" },
    });
  return {
    open: vi.fn(failed),
    createConversation: vi.fn(failed),
    readConversation: vi.fn(failed),
    renameConversation: vi.fn(failed),
    setConversationArchived: vi.fn(failed),
    deleteConversation: vi.fn(failed),
    appendMessage: vi.fn(failed),
  };
}

function ipcHarness() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  const ipcMain = {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) {
      handlers.set(channel, listener);
    },
  };
  return {
    handlers,
    ipcMain,
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const listener = handlers.get(channel);
      if (listener === undefined) throw new Error(`missing handler: ${channel}`);
      return Promise.resolve(listener({} as IpcMainInvokeEvent, ...args));
    },
  };
}
