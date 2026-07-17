import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  AI_WINDOW_IPC_CHANNELS,
  validateAiWindowIntent,
  validateAiWindowStateEnvelope,
  type AiWindowCommandResult,
  type AiWindowStateEnvelope,
} from "../../src/shared/ai-window.js";

type WindowListener = (...args: unknown[]) => void;

export interface AiWindowWebContents {
  readonly id: number;
  isDestroyed(): boolean;
  send(channel: string, payload?: unknown): void;
}

export interface AiWindowNativeWindow {
  readonly webContents: AiWindowWebContents;
  isDestroyed(): boolean;
  isFocused(): boolean;
  isMinimized(): boolean;
  isVisible(): boolean;
  show(): void;
  hide(): void;
  focus(): void;
  restore(): void;
  close(): void;
  setTitle(title: string): void;
  on(event: "closed", listener: WindowListener): unknown;
  once(event: "closed" | "ready-to-show", listener: WindowListener): unknown;
}

export interface AiWindowManagerOptions {
  readonly ipcMain: Pick<IpcMain, "handle">;
  readonly authorizeHost: (event: IpcMainInvokeEvent) => AiWindowNativeWindow;
  readonly resolveSender: (event: IpcMainInvokeEvent) => AiWindowNativeWindow | null;
  readonly createChildWindow: (parent: AiWindowNativeWindow) => AiWindowNativeWindow;
  readonly isShuttingDown: () => boolean;
}

export interface AiWindowManager {
  closeAll(): void;
}

interface WindowRecord {
  readonly parent: AiWindowNativeWindow;
  readonly child: AiWindowNativeWindow;
  rendererReady: boolean;
  readyToShow: boolean;
  desiredVisible: boolean;
  activationPending: boolean;
}

const OK: AiWindowCommandResult = Object.freeze({ status: "ok" });

export function registerAiWindowManager(options: AiWindowManagerOptions): AiWindowManager {
  assertOptions(options);
  const recordByParent = new WeakMap<AiWindowNativeWindow, WindowRecord>();
  const recordByChild = new WeakMap<AiWindowNativeWindow, WindowRecord>();
  const latestByParent = new WeakMap<AiWindowNativeWindow, AiWindowStateEnvelope>();
  const records = new Set<WindowRecord>();
  const trackedParents = new WeakSet<AiWindowNativeWindow>();

  const closeRecord = (record: WindowRecord): void => {
    records.delete(record);
    recordByParent.delete(record.parent);
    recordByChild.delete(record.child);
  };

  const publishLatest = (record: WindowRecord): void => {
    const latest = latestByParent.get(record.parent);
    if (
      !record.rendererReady ||
      latest === undefined ||
      record.child.isDestroyed() ||
      record.child.webContents.isDestroyed()
    ) {
      return;
    }
    record.child.setTitle(windowTitle(latest));
    record.child.webContents.send(AI_WINDOW_IPC_CHANNELS.state, latest);
  };

  const fulfillActivation = (record: WindowRecord): void => {
    if (!record.activationPending) return;
    record.desiredVisible = true;
    if (
      !record.readyToShow ||
      !record.rendererReady ||
      latestByParent.get(record.parent) === undefined ||
      record.child.isDestroyed()
    ) {
      return;
    }
    if (record.child.isMinimized()) record.child.restore();
    if (!record.child.isVisible()) record.child.show();
    if (!record.child.isFocused()) record.child.focus();
    record.activationPending = false;
  };

  const activate = (record: WindowRecord): void => {
    record.desiredVisible = true;
    record.activationPending = true;
    fulfillActivation(record);
  };

  const ensureWindow = (parent: AiWindowNativeWindow): WindowRecord => {
    const existing = recordByParent.get(parent);
    if (existing !== undefined && !existing.child.isDestroyed()) return existing;
    const child = options.createChildWindow(parent);
    const latest = latestByParent.get(parent);
    if (latest !== undefined) child.setTitle(windowTitle(latest));
    const record: WindowRecord = {
      parent,
      child,
      rendererReady: false,
      readyToShow: false,
      desiredVisible: false,
      activationPending: false,
    };
    records.add(record);
    recordByParent.set(parent, record);
    recordByChild.set(child, record);
    child.once("ready-to-show", () => {
      if (child.isDestroyed()) return;
      record.readyToShow = true;
      fulfillActivation(record);
    });
    child.on("closed", () => {
      closeRecord(record);
      if (!parent.isDestroyed() && !parent.webContents.isDestroyed()) {
        parent.webContents.send(AI_WINDOW_IPC_CHANNELS.closed);
      }
    });
    if (!trackedParents.has(parent)) {
      trackedParents.add(parent);
      parent.once("closed", () => {
        const current = recordByParent.get(parent);
        if (current !== undefined && !current.child.isDestroyed()) current.child.close();
        if (current !== undefined) closeRecord(current);
      });
    }
    return record;
  };

  options.ipcMain.handle(AI_WINDOW_IPC_CHANNELS.open, (event, ...args): AiWindowCommandResult => {
    const parent = hostContext(options, event, args, 0);
    if (typeof parent === "string") return failed(parent);
    const record = ensureWindow(parent);
    activate(record);
    publishLatest(record);
    return OK;
  });

  options.ipcMain.handle(AI_WINDOW_IPC_CHANNELS.toggle, (event, ...args): AiWindowCommandResult => {
    const parent = hostContext(options, event, args, 0);
    if (typeof parent === "string") return failed(parent);
    const record = ensureWindow(parent);
    if (!record.readyToShow || !record.rendererReady) {
      if (record.activationPending) {
        record.desiredVisible = false;
        record.activationPending = false;
      } else {
        activate(record);
      }
    } else if (
      record.child.isVisible() &&
      !record.child.isMinimized() &&
      record.child.isFocused()
    ) {
      record.desiredVisible = false;
      record.activationPending = false;
      record.child.hide();
    } else {
      activate(record);
      publishLatest(record);
    }
    return OK;
  });

  options.ipcMain.handle(
    AI_WINDOW_IPC_CHANNELS.publishState,
    (event, ...args): AiWindowCommandResult => {
      const parent = hostContext(options, event, args, 1);
      if (typeof parent === "string") return failed(parent);
      const state = validateAiWindowStateEnvelope(args[0]);
      if (state === null) return failed("INVALID_PAYLOAD");
      const previous = latestByParent.get(parent);
      if (previous !== undefined && state.sequence < previous.sequence) return OK;
      latestByParent.set(parent, state);
      const record = recordByParent.get(parent);
      if (record !== undefined) {
        publishLatest(record);
        fulfillActivation(record);
      }
      return OK;
    },
  );

  options.ipcMain.handle(AI_WINDOW_IPC_CHANNELS.ready, (event, ...args): AiWindowCommandResult => {
    if (args.length !== 0 || options.isShuttingDown()) return failed("INVALID_CONTEXT");
    const child = options.resolveSender(event);
    const record = child === null ? undefined : recordByChild.get(child);
    if (record === undefined || record.child !== child || child?.isDestroyed()) {
      return failed("INVALID_CONTEXT");
    }
    record.rendererReady = true;
    publishLatest(record);
    fulfillActivation(record);
    return OK;
  });

  options.ipcMain.handle(AI_WINDOW_IPC_CHANNELS.intent, (event, ...args): AiWindowCommandResult => {
    if (args.length !== 1 || options.isShuttingDown()) return failed("INVALID_CONTEXT");
    const child = options.resolveSender(event);
    const record = child === null ? undefined : recordByChild.get(child);
    const intent = validateAiWindowIntent(args[0]);
    if (record === undefined || record.child !== child) return failed("INVALID_CONTEXT");
    if (intent === null) return failed("INVALID_PAYLOAD");
    if (intent.type === "close") {
      record.child.close();
      return OK;
    }
    if (record.parent.isDestroyed() || record.parent.webContents.isDestroyed()) {
      return failed("WINDOW_UNAVAILABLE");
    }
    if (intent.type === "open-model-settings") {
      record.desiredVisible = false;
      record.activationPending = false;
      record.child.hide();
      record.parent.show();
      record.parent.focus();
      record.parent.webContents.send(AI_WINDOW_IPC_CHANNELS.closed);
    }
    record.parent.webContents.send(AI_WINDOW_IPC_CHANNELS.intent, intent);
    return OK;
  });

  return Object.freeze({
    closeAll(): void {
      for (const record of [...records]) {
        if (!record.child.isDestroyed()) record.child.close();
        closeRecord(record);
      }
    },
  });
}

function hostContext(
  options: AiWindowManagerOptions,
  event: IpcMainInvokeEvent,
  args: readonly unknown[],
  arity: number,
): AiWindowNativeWindow | "INVALID_CONTEXT" | "INVALID_PAYLOAD" {
  if (args.length !== arity) return "INVALID_PAYLOAD";
  if (options.isShuttingDown()) return "INVALID_CONTEXT";
  try {
    const parent = options.authorizeHost(event);
    return parent.isDestroyed() || parent.webContents.isDestroyed() ? "INVALID_CONTEXT" : parent;
  } catch {
    return "INVALID_CONTEXT";
  }
}

function failed(
  code: Exclude<AiWindowCommandResult, { status: "ok" }>["code"],
): AiWindowCommandResult {
  return Object.freeze({ status: "failed", code });
}

function windowTitle(state: AiWindowStateEnvelope): string {
  const project = state.state.projects.find((item) => item.id === state.state.activeProjectId);
  const assistant = state.locale === "en" ? "AI Assistant" : "AI 助手";
  return project === undefined ? assistant : `${project.name} — ${assistant}`;
}

function assertOptions(options: AiWindowManagerOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.ipcMain?.handle !== "function" ||
    typeof options.authorizeHost !== "function" ||
    typeof options.resolveSender !== "function" ||
    typeof options.createChildWindow !== "function" ||
    typeof options.isShuttingDown !== "function"
  ) {
    throw new TypeError("AI window manager dependencies are invalid");
  }
}
