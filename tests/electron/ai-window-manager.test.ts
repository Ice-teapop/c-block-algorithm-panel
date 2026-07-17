import type { IpcMainInvokeEvent } from "electron";
import { describe, expect, it } from "vitest";
import {
  registerAiWindowManager,
  type AiWindowNativeWindow,
} from "../../electron/main/ai-window-manager.js";
import { AI_WINDOW_IPC_CHANNELS, type AiWindowStateEnvelope } from "../../src/shared/ai-window.js";

describe("native AI window manager", () => {
  it("waits for ready-to-show and publishes state only after the child renderer is ready", async () => {
    const harness = managerHarness();
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.publishState, stateEnvelope(1));
    await expect(harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.open)).resolves.toEqual({
      status: "ok",
    });
    const child = harness.children[0]!;
    expect(child.showCount).toBe(0);
    expect(child.title).toBe("Maximum scan — AI Assistant");
    child.emit("ready-to-show");
    expect(child.showCount).toBe(0);
    expect(child.webContents.sent).toEqual([]);

    await harness.invoke(child, AI_WINDOW_IPC_CHANNELS.ready);
    expect(child.showCount).toBe(1);
    expect(child.title).toBe("Maximum scan — AI Assistant");
    expect(child.webContents.sent).toEqual([
      { channel: AI_WINDOW_IPC_CHANNELS.state, payload: stateEnvelope(1) },
    ]);
  });

  it("routes validated child intents only to its owning parent", async () => {
    const harness = managerHarness();
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.open);
    const child = harness.children[0]!;
    await expect(
      harness.invoke(child, AI_WINDOW_IPC_CHANNELS.intent, { type: "cancel" }),
    ).resolves.toEqual({ status: "ok" });
    expect(harness.parent.webContents.sent).toContainEqual({
      channel: AI_WINDOW_IPC_CHANNELS.intent,
      payload: { type: "cancel" },
    });
    await expect(
      harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.intent, { type: "cancel" }),
    ).resolves.toEqual({ status: "failed", code: "INVALID_CONTEXT" });
    await expect(
      harness.invoke(child, AI_WINDOW_IPC_CHANNELS.intent, { type: "cancel", extra: true }),
    ).resolves.toEqual({ status: "failed", code: "INVALID_PAYLOAD" });
  });

  it("keeps minimized windows in the background until an explicit open restores them", async () => {
    const harness = managerHarness();
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.publishState, stateEnvelope(1));
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.open);
    const child = harness.children[0]!;
    child.emit("ready-to-show");
    await harness.invoke(child, AI_WINDOW_IPC_CHANNELS.ready);
    expect(child.focusCount).toBe(1);

    child.minimize();
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.publishState, stateEnvelope(2));
    expect(child.isMinimized()).toBe(true);
    expect(child.restoreCount).toBe(0);
    expect(child.focusCount).toBe(1);

    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.open);
    expect(child.isMinimized()).toBe(false);
    expect(child.restoreCount).toBe(1);
    expect(child.focusCount).toBe(2);
  });

  it("does not steal focus on state updates and brings a background window forward on toggle", async () => {
    const harness = managerHarness();
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.publishState, stateEnvelope(1));
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.open);
    const child = harness.children[0]!;
    child.emit("ready-to-show");
    await harness.invoke(child, AI_WINDOW_IPC_CHANNELS.ready);
    child.blur();

    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.publishState, stateEnvelope(2));
    expect(child.focusCount).toBe(1);
    expect(child.hideCount).toBe(0);

    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.toggle);
    expect(child.focusCount).toBe(2);
    expect(child.hideCount).toBe(0);
  });

  it("returns model settings to the workbench without making the child modal", async () => {
    const harness = managerHarness();
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.open);
    const child = harness.children[0]!;
    child.emit("ready-to-show");
    await harness.invoke(child, AI_WINDOW_IPC_CHANNELS.intent, { type: "open-model-settings" });
    expect(child.hideCount).toBe(1);
    expect(harness.parent.focusCount).toBe(1);
    expect(harness.parent.webContents.sent).toEqual([
      { channel: AI_WINDOW_IPC_CHANNELS.closed, payload: undefined },
      { channel: AI_WINDOW_IPC_CHANNELS.intent, payload: { type: "open-model-settings" } },
    ]);
  });

  it("owns the child lifetime and does not accumulate parent close listeners", async () => {
    const harness = managerHarness();
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.open);
    const first = harness.children[0]!;
    expect(harness.parent.listenerCount("closed")).toBe(1);
    first.close();
    await harness.invoke(harness.parent, AI_WINDOW_IPC_CHANNELS.open);
    const second = harness.children[1]!;
    expect(harness.parent.listenerCount("closed")).toBe(1);
    harness.parent.close();
    expect(second.closeCount).toBe(1);
  });
});

function managerHarness() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  const parent = new FakeWindow(1);
  const children: FakeWindow[] = [];
  registerAiWindowManager({
    ipcMain: {
      handle(channel, listener) {
        handlers.set(channel, listener);
      },
    },
    authorizeHost(event) {
      if ((event as unknown as { owner: FakeWindow }).owner !== parent)
        throw new Error("untrusted");
      return parent;
    },
    resolveSender: (event) => (event as unknown as { owner: FakeWindow }).owner,
    createChildWindow() {
      const child = new FakeWindow(children.length + 10);
      children.push(child);
      return child;
    },
    isShuttingDown: () => false,
  });
  return {
    parent,
    children,
    invoke(owner: FakeWindow, channel: string, ...args: unknown[]): Promise<unknown> {
      const listener = handlers.get(channel);
      if (listener === undefined) throw new Error(`missing handler: ${channel}`);
      return Promise.resolve(listener({ owner } as unknown as IpcMainInvokeEvent, ...args));
    },
  };
}

class FakeWebContents {
  readonly sent: { readonly channel: string; readonly payload: unknown }[] = [];
  private destroyed = false;

  constructor(readonly id: number) {}
  isDestroyed(): boolean {
    return this.destroyed;
  }
  send(channel: string, payload?: unknown): void {
    this.sent.push({ channel, payload });
  }
}

class FakeWindow implements AiWindowNativeWindow {
  readonly webContents: FakeWebContents;
  private destroyed = false;
  private visible = false;
  private minimized = false;
  private focused = false;
  private readonly listeners = new Map<
    string,
    { readonly callback: () => void; readonly once: boolean }[]
  >();
  showCount = 0;
  hideCount = 0;
  focusCount = 0;
  closeCount = 0;
  restoreCount = 0;
  title = "";

  constructor(id: number) {
    this.webContents = new FakeWebContents(id);
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  isVisible(): boolean {
    return this.visible;
  }
  isFocused(): boolean {
    return this.focused;
  }
  isMinimized(): boolean {
    return this.minimized;
  }
  show(): void {
    this.visible = true;
    this.showCount += 1;
  }
  hide(): void {
    this.visible = false;
    this.focused = false;
    this.hideCount += 1;
  }
  minimize(): void {
    this.minimized = true;
    this.visible = false;
    this.focused = false;
  }
  restore(): void {
    this.minimized = false;
    this.visible = true;
    this.restoreCount += 1;
  }
  blur(): void {
    this.focused = false;
  }
  focus(): void {
    this.focused = true;
    this.focusCount += 1;
  }
  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.visible = false;
    this.closeCount += 1;
    this.emit("closed");
  }
  setTitle(title: string): void {
    this.title = title;
  }
  on(event: "closed", listener: () => void): this {
    this.addListener(event, listener, false);
    return this;
  }
  once(event: "closed" | "ready-to-show", listener: () => void): this {
    this.addListener(event, listener, true);
    return this;
  }
  emit(event: "closed" | "ready-to-show"): void {
    const entries = [...(this.listeners.get(event) ?? [])];
    this.listeners.set(
      event,
      entries.filter((entry) => !entry.once),
    );
    for (const entry of entries) entry.callback();
  }
  listenerCount(event: string): number {
    return this.listeners.get(event)?.length ?? 0;
  }
  private addListener(event: string, callback: () => void, once: boolean): void {
    const entries = this.listeners.get(event) ?? [];
    entries.push({ callback, once });
    this.listeners.set(event, entries);
  }
}

function stateEnvelope(sequence: number): AiWindowStateEnvelope {
  const projectId = "ai-project-12345678-1234-4123-8123-123456789abc";
  const conversationId = "conversation-12345678-1234-4123-8123-123456789abc";
  return {
    sequence,
    locale: "en",
    background: "white",
    theme: "light",
    state: {
      projects: [
        {
          id: projectId,
          name: "Maximum scan",
          conversations: [{ id: conversationId, title: "Tests" }],
        },
      ],
      activeProjectId: projectId,
      activeConversationId: conversationId,
      messages: [],
      mode: "read-only",
      availableModes: ["read-only"],
      modelLabel: "AI",
    },
  };
}
