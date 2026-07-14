import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  AI_PROJECT_IPC_CHANNELS,
  aiProjectFailure,
  type AiConversationCreateResult,
  type AiConversationDeleteResult,
  type AiConversationMessageAppendResult,
  type AiConversationReadResult,
  type AiConversationUpdateResult,
  type AiProjectFailure,
  type AiProjectOpenResult,
} from "../../src/shared/ai-project.js";
import type { AiProjectStore } from "./ai-project-store.js";

export interface RegisterAiProjectIpcHandlersOptions {
  readonly ipcMain: Pick<IpcMain, "handle">;
  readonly store: AiProjectStore;
  readonly authorize: (event: IpcMainInvokeEvent) => void;
  readonly isShuttingDown: () => boolean;
}

export function registerAiProjectIpcHandlers(options: RegisterAiProjectIpcHandlersOptions): void {
  assertOptions(options);
  register(options, AI_PROJECT_IPC_CHANNELS.open, "open", 1);
  register(options, AI_PROJECT_IPC_CHANNELS.createConversation, "createConversation", 1);
  register(options, AI_PROJECT_IPC_CHANNELS.readConversation, "readConversation", 1);
  register(options, AI_PROJECT_IPC_CHANNELS.renameConversation, "renameConversation", 1);
  register(options, AI_PROJECT_IPC_CHANNELS.setConversationArchived, "setConversationArchived", 1);
  register(options, AI_PROJECT_IPC_CHANNELS.deleteConversation, "deleteConversation", 1);
  register(options, AI_PROJECT_IPC_CHANNELS.appendMessage, "appendMessage", 1);
}

type AiProjectStoreMethod = keyof AiProjectStore;
type AiProjectStoreResult =
  | AiProjectOpenResult
  | AiConversationCreateResult
  | AiConversationReadResult
  | AiConversationUpdateResult
  | AiConversationDeleteResult
  | AiConversationMessageAppendResult;

function register(
  options: RegisterAiProjectIpcHandlersOptions,
  channel: string,
  method: AiProjectStoreMethod,
  arity: number,
): void {
  options.ipcMain.handle(channel, async (event, ...args): Promise<AiProjectStoreResult> => {
    const context = requestContext(options, event, args, arity);
    if (context !== null) return context;
    return options.store[method](args[0]);
  });
}

function requestContext(
  options: RegisterAiProjectIpcHandlersOptions,
  event: IpcMainInvokeEvent,
  args: readonly unknown[],
  arity: number,
): AiProjectFailure | null {
  try {
    options.authorize(event);
  } catch {
    return aiProjectFailure("AI_PROJECT_CONTEXT_CLOSED", "AI Project 请求上下文不可信或已关闭。");
  }
  if (args.length !== arity) {
    return aiProjectFailure("AI_PROJECT_INVALID_REQUEST", "AI Project IPC 请求格式无效。");
  }
  return options.isShuttingDown()
    ? aiProjectFailure("AI_PROJECT_CONTEXT_CLOSED", "应用正在退出，AI Project 请求已取消。")
    : null;
}

function assertOptions(options: RegisterAiProjectIpcHandlersOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.ipcMain?.handle !== "function" ||
    typeof options.store?.open !== "function" ||
    typeof options.store?.appendMessage !== "function" ||
    typeof options.authorize !== "function" ||
    typeof options.isShuttingDown !== "function"
  ) {
    throw new TypeError("AI Project IPC 缺少受限依赖");
  }
}
