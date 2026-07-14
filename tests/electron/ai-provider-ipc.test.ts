import { describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { registerAiProviderIpcHandlers } from "../../electron/main/ai-provider-ipc.js";
import type { AiMentorController } from "../../electron/main/ai-mentor-controller.js";
import type { AiProviderClient } from "../../electron/main/ai-provider-client.js";
import type { AiProviderConfigStore } from "../../electron/main/ai-provider-store.js";
import { AI_PROVIDER_IPC_CHANNELS } from "../../src/shared/ai-provider.js";

describe("AI Provider IPC v2 boundary", () => {
  it("registers the eight narrow operations and authorizes every call", async () => {
    const harness = ipcHarness();
    const owner = {};
    const authorize = vi.fn(() => owner);
    const store = fakeStore();
    const client = fakeClient();
    const mentor = fakeMentor();
    registerAiProviderIpcHandlers({
      ipcMain: harness.ipcMain,
      store,
      client,
      mentor,
      authorize,
      isShuttingDown: () => false,
    });
    expect([...harness.handlers.keys()].sort()).toEqual(
      Object.values(AI_PROVIDER_IPC_CHANNELS).sort(),
    );

    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.getConfig);
    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.connect, connectRequest());
    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.listModels, { expectedRevision: 0 });
    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.selectModel, {
      expectedRevision: 0,
      model: "model-a",
    });
    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.startMentor, mentorRequest());
    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.readMentor, {
      sessionId: "mentor:session",
      afterSequence: 0,
    });
    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.cancelMentor, {
      sessionId: "mentor:session",
    });
    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.disconnect, { expectedRevision: 0 });

    expect(authorize).toHaveBeenCalledTimes(8);
    expect(store.readCredential).toHaveBeenCalledTimes(3);
    expect(mentor.start).toHaveBeenCalledWith(
      owner,
      "openai",
      "main-only-secret",
      "model-a",
      expect.objectContaining({ sourceFingerprint: "fnv64:abc" }),
    );
  });

  it("rejects wrong arity before store access and fails closed while shutting down", async () => {
    const harness = ipcHarness();
    const store = fakeStore();
    let shuttingDown = false;
    registerAiProviderIpcHandlers({
      ipcMain: harness.ipcMain,
      store,
      client: fakeClient(),
      mentor: fakeMentor(),
      authorize: () => ({}),
      isShuttingDown: () => shuttingDown,
    });
    await expect(
      harness.invoke(AI_PROVIDER_IPC_CHANNELS.getConfig, "extra"),
    ).resolves.toMatchObject({ error: { code: "AI_PROVIDER_INVALID_REQUEST" } });
    expect(store.read).not.toHaveBeenCalled();

    shuttingDown = true;
    await expect(
      harness.invoke(AI_PROVIDER_IPC_CHANNELS.connect, connectRequest()),
    ).resolves.toMatchObject({ error: { code: "AI_PROVIDER_CONTEXT_CLOSED" } });
    expect(store.connect).not.toHaveBeenCalled();
  });

  it("never exposes a decrypt channel, ciphertext, or the credential in results", async () => {
    const harness = ipcHarness();
    registerAiProviderIpcHandlers({
      ipcMain: harness.ipcMain,
      store: fakeStore(),
      client: fakeClient(),
      mentor: fakeMentor(),
      authorize: () => ({}),
      isShuttingDown: () => false,
    });
    expect([...harness.handlers.keys()].join(" ")).not.toMatch(/decrypt|credential|ciphertext/u);
    const result = await harness.invoke(AI_PROVIDER_IPC_CHANNELS.connect, connectRequest());
    expect(JSON.stringify(result)).not.toContain("main-only-secret");
    expect(JSON.stringify(result)).not.toContain("renderer-key");
  });

  it("cancels the owner on main-frame reload, renderer loss, webContents destruction, and close", async () => {
    const harness = ipcHarness();
    const lifetime = lifetimeOwner();
    const mentor = fakeMentor();
    registerAiProviderIpcHandlers({
      ipcMain: harness.ipcMain,
      store: fakeStore(),
      client: fakeClient(),
      mentor,
      authorize: () => lifetime.owner,
      isShuttingDown: () => false,
    });
    await harness.invoke(AI_PROVIDER_IPC_CHANNELS.getConfig);

    lifetime.webContents.emit("did-start-navigation", {}, "file:///iframe", false, false);
    expect(mentor.cancelOwner).not.toHaveBeenCalled();
    lifetime.webContents.emit("did-start-navigation", {}, "file:///index.html", false, true);
    lifetime.webContents.emit("render-process-gone");
    lifetime.webContents.emit("destroyed");
    lifetime.window.emit("closed");

    expect(mentor.cancelOwner).toHaveBeenCalledTimes(4);
    expect(mentor.cancelOwner).toHaveBeenCalledWith(lifetime.owner);
  });
});

function ipcHarness() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  const ipcMain = {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown) {
      handlers.set(channel, listener);
    },
  };
  const event = {} as IpcMainInvokeEvent;
  return {
    handlers,
    ipcMain,
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      const listener = handlers.get(channel);
      if (listener === undefined) throw new Error(`missing handler: ${channel}`);
      return Promise.resolve(listener(event, ...args));
    },
  };
}

function lifetimeOwner() {
  const window = eventSource();
  const webContents = eventSource();
  const owner = {
    once: window.once,
    webContents: {
      once: webContents.once,
      on: webContents.on,
    },
  };
  return { owner, window, webContents } as const;
}

function eventSource() {
  type Listener = (...args: unknown[]) => void;
  const listeners = new Map<string, { readonly listener: Listener; readonly once: boolean }[]>();
  const add = (name: string, listener: Listener, once: boolean): void => {
    listeners.set(name, [...(listeners.get(name) ?? []), { listener, once }]);
  };
  return {
    on: (name: string, listener: Listener): void => add(name, listener, false),
    once: (name: string, listener: Listener): void => add(name, listener, true),
    emit(name: string, ...args: unknown[]): void {
      const current = listeners.get(name) ?? [];
      listeners.set(
        name,
        current.filter((entry) => !entry.once),
      );
      for (const entry of current) entry.listener(...args);
    },
  };
}

function fakeStore(): AiProviderConfigStore {
  return {
    read: vi.fn(async () => ({
      status: "ready" as const,
      encryptionAvailable: true,
      config: publicConfig(),
    })),
    connect: vi.fn(async () => ({ status: "connected" as const, config: publicConfig() })),
    selectModel: vi.fn(async () => ({ status: "selected" as const, config: publicConfig() })),
    disconnect: vi.fn(async () => ({ status: "disconnected" as const })),
    readCredential: vi.fn(async () => ({
      status: "ready" as const,
      credential: "main-only-secret",
    })),
  };
}

function fakeClient(): AiProviderClient {
  return {
    listModels: vi.fn(async (providerId) => ({
      status: "ready" as const,
      providerId,
      models: [{ id: "model-a", label: "model-a" }],
    })),
    requestMentor: vi.fn(async () => ({ status: "completed" as const, text: "answer" })),
  };
}

function fakeMentor(): AiMentorController {
  return {
    start: vi.fn(() => ({
      status: "started" as const,
      sessionId: "mentor:session",
      sourceFingerprint: "fnv64:abc",
    })),
    read: vi.fn(() => ({
      status: "running" as const,
      sessionId: "mentor:session",
      sourceFingerprint: "fnv64:abc",
      events: [],
      nextSequence: 0,
    })),
    cancel: vi.fn(() => ({ status: "cancelled" as const, sessionId: "mentor:session" })),
    cancelOwner: vi.fn(),
  };
}

function publicConfig() {
  return {
    schemaVersion: 2 as const,
    revision: 0,
    providerId: "openai" as const,
    region: null,
    model: "model-a",
    state: "connected" as const,
    hasCredential: true,
    credentialUsable: true,
    credentialUpdatedAtMs: 123,
  };
}

function connectRequest() {
  return { expectedRevision: null, providerId: "openai" as const, apiKey: "renderer-key" };
}

function mentorRequest() {
  return {
    sourceFingerprint: "fnv64:abc",
    sourceRevision: 2,
    providerRevision: 0,
    contextMode: "current-function" as const,
    locale: "en" as const,
    prompt: "Explain",
    history: [],
    context: {
      currentFunction: "int main(void){return 0;}",
      diagnosticSummary: [],
      controlFlowSummary: "one function",
      runEvidence: [],
    },
  };
}
