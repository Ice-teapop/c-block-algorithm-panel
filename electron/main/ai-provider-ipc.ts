import type { IpcMain, IpcMainInvokeEvent } from "electron";
import {
  AI_PROVIDER_IPC_CHANNELS,
  aiProviderFailure,
  validateCancelAiMentorRequest,
  validateConnectAiProviderRequest,
  validateDisconnectAiProviderRequest,
  validateListAiProviderModelsRequest,
  validateReadAiMentorRequest,
  validateSelectAiProviderModelRequest,
  validateStartAiMentorRequest,
  type AiMentorCancelResult,
  type AiMentorReadResult,
  type AiMentorStartResult,
  type AiProviderConnectResult,
  type AiProviderDisconnectResult,
  type AiProviderFailure,
  type AiProviderModelsResult,
  type AiProviderModelSelectResult,
  type AiProviderReadResult,
  type AiProviderId,
  type AiProviderModel,
} from "../../src/shared/ai-provider.js";
import type { AiMentorController } from "./ai-mentor-controller.js";
import type { AiProviderClient } from "./ai-provider-client.js";
import type { AiProviderConfigStore } from "./ai-provider-store.js";

const trackedOwners = new WeakSet<object>();

export interface RegisterAiProviderIpcHandlersOptions {
  readonly ipcMain: Pick<IpcMain, "handle">;
  readonly store: AiProviderConfigStore;
  readonly client: AiProviderClient;
  readonly mentor: AiMentorController;
  readonly authorize: (event: IpcMainInvokeEvent) => object;
  readonly isShuttingDown: () => boolean;
}

export function registerAiProviderIpcHandlers(options: RegisterAiProviderIpcHandlersOptions): void {
  assertOptions(options);

  options.ipcMain.handle(
    AI_PROVIDER_IPC_CHANNELS.getConfig,
    async (event, ...args): Promise<AiProviderReadResult> => {
      const context = requestContext(options, event, args, 0);
      return context.status === "failed" ? context : options.store.read();
    },
  );

  options.ipcMain.handle(
    AI_PROVIDER_IPC_CHANNELS.connect,
    async (event, ...args): Promise<AiProviderConnectResult> => {
      const context = requestContext(options, event, args, 1);
      if (context.status === "failed") return context;
      const request = validateConnectAiProviderRequest(args[0]);
      if (request === null) return invalidRequest();
      options.mentor.cancelOwner(context.owner);
      const models = await options.client.listModels(request.providerId, request.apiKey);
      if (models.status === "failed") return models;
      const initialModel = selectInitialModel(request.providerId, models.models);
      if (initialModel === undefined) {
        return aiProviderFailure("AI_PROVIDER_INVALID_RESPONSE", "官方模型目录为空。");
      }
      const saved = await options.store.connect(request, initialModel.id);
      return saved.status === "failed"
        ? saved
        : Object.freeze({ status: "connected", config: saved.config, models: models.models });
    },
  );

  options.ipcMain.handle(
    AI_PROVIDER_IPC_CHANNELS.listModels,
    async (event, ...args): Promise<AiProviderModelsResult> => {
      const context = requestContext(options, event, args, 1);
      if (context.status === "failed") return context;
      const request = validateListAiProviderModelsRequest(args[0]);
      if (request === null) return invalidRequest();
      const access = await connectedAccess(options.store, request.expectedRevision);
      if (access.status === "failed") return access;
      return options.client.listModels(access.providerId, access.credential);
    },
  );

  options.ipcMain.handle(
    AI_PROVIDER_IPC_CHANNELS.selectModel,
    async (event, ...args): Promise<AiProviderModelSelectResult> => {
      const context = requestContext(options, event, args, 1);
      if (context.status === "failed") return context;
      const request = validateSelectAiProviderModelRequest(args[0]);
      if (request === null) return invalidRequest();
      const access = await connectedAccess(options.store, request.expectedRevision);
      if (access.status === "failed") return access;
      const models = await options.client.listModels(access.providerId, access.credential);
      if (models.status === "failed") return models;
      if (!models.models.some((model) => model.id === request.model)) {
        return aiProviderFailure(
          "AI_PROVIDER_MODEL_UNAVAILABLE",
          "所选模型不在当前官方模型目录中。",
        );
      }
      options.mentor.cancelOwner(context.owner);
      return options.store.selectModel(request);
    },
  );

  options.ipcMain.handle(
    AI_PROVIDER_IPC_CHANNELS.disconnect,
    async (event, ...args): Promise<AiProviderDisconnectResult> => {
      const context = requestContext(options, event, args, 1);
      if (context.status === "failed") return context;
      const request = validateDisconnectAiProviderRequest(args[0]);
      if (request === null) return invalidRequest();
      options.mentor.cancelOwner(context.owner);
      return options.store.disconnect(request);
    },
  );

  options.ipcMain.handle(
    AI_PROVIDER_IPC_CHANNELS.startMentor,
    async (event, ...args): Promise<AiMentorStartResult> => {
      const context = requestContext(options, event, args, 1);
      if (context.status === "failed") return context;
      const request = validateStartAiMentorRequest(args[0]);
      if (request === null) return invalidRequest();
      const access = await connectedAccess(options.store, request.providerRevision);
      if (access.status === "failed") return access;
      if (access.model === null) {
        return aiProviderFailure("AI_PROVIDER_MODEL_UNAVAILABLE", "尚未选择 AI 模型。");
      }
      return options.mentor.start(
        context.owner,
        access.providerId,
        access.credential,
        access.model,
        request,
      );
    },
  );

  options.ipcMain.handle(
    AI_PROVIDER_IPC_CHANNELS.readMentor,
    async (event, ...args): Promise<AiMentorReadResult> => {
      const context = requestContext(options, event, args, 1);
      if (context.status === "failed") return context;
      const request = validateReadAiMentorRequest(args[0]);
      return request === null
        ? invalidRequest()
        : options.mentor.read(context.owner, request.sessionId, request.afterSequence);
    },
  );

  options.ipcMain.handle(
    AI_PROVIDER_IPC_CHANNELS.cancelMentor,
    async (event, ...args): Promise<AiMentorCancelResult> => {
      const context = requestContext(options, event, args, 1);
      if (context.status === "failed") return context;
      const request = validateCancelAiMentorRequest(args[0]);
      return request === null
        ? invalidRequest()
        : options.mentor.cancel(context.owner, request.sessionId);
    },
  );
}

async function connectedAccess(
  store: AiProviderConfigStore,
  expectedRevision: number,
): Promise<
  | {
      readonly status: "ready";
      readonly providerId: NonNullable<
        Extract<
          Awaited<ReturnType<AiProviderConfigStore["read"]>>,
          { status: "ready" }
        >["config"]["providerId"]
      >;
      readonly model: string | null;
      readonly credential: string;
    }
  | AiProviderFailure
> {
  const result = await store.read();
  if (result.status === "failed") return result;
  if (
    result.status !== "ready" ||
    result.config.revision !== expectedRevision ||
    result.config.state !== "connected" ||
    result.config.providerId === null ||
    !result.config.credentialUsable
  ) {
    return result.status === "ready" && result.config.revision !== expectedRevision
      ? aiProviderFailure("AI_PROVIDER_CONFLICT", "AI Provider 配置已更新，请重新载入。")
      : aiProviderFailure("AI_PROVIDER_NOT_CONNECTED", "请先在设置中连接 AI 厂商。");
  }
  const credential = await store.readCredential(result.config.providerId);
  if (credential.status === "failed") {
    return Object.freeze({ status: "failed", error: credential.error });
  }
  if (credential.status !== "ready") {
    return aiProviderFailure("AI_PROVIDER_NOT_CONNECTED", "AI 密钥不存在或不可用。");
  }
  return Object.freeze({
    status: "ready",
    providerId: result.config.providerId,
    model: result.config.model,
    credential: credential.credential,
  });
}

function requestContext(
  options: RegisterAiProviderIpcHandlersOptions,
  event: IpcMainInvokeEvent,
  args: readonly unknown[],
  arity: number,
): { readonly status: "ready"; readonly owner: object } | AiProviderFailure {
  try {
    const owner = options.authorize(event);
    if (args.length !== arity) return invalidRequest();
    if (options.isShuttingDown()) {
      return aiProviderFailure("AI_PROVIDER_CONTEXT_CLOSED", "应用正在退出，AI 请求已拒绝。");
    }
    trackOwnerLifetime(options.mentor, owner);
    return Object.freeze({ status: "ready", owner });
  } catch {
    return aiProviderFailure("AI_PROVIDER_CONTEXT_CLOSED", "AI 请求上下文不可信或已关闭。");
  }
}

function trackOwnerLifetime(mentor: AiMentorController, owner: object): void {
  if (trackedOwners.has(owner)) return;
  type Listener = (...args: unknown[]) => void;
  type EventSource = {
    once?: (name: string, listener: Listener) => unknown;
    on?: (name: string, listener: Listener) => unknown;
  };
  const eventOwner = owner as EventSource & { readonly webContents?: EventSource | undefined };
  const cancel = (): void => mentor.cancelOwner(owner);
  let lifetimeTracked = false;
  if (typeof eventOwner.once === "function") {
    eventOwner.once("closed", cancel);
    lifetimeTracked = true;
  }
  const webContents = eventOwner.webContents;
  if (webContents !== undefined && typeof webContents.on === "function") {
    webContents.on("render-process-gone", cancel);
    webContents.on("did-start-navigation", (...args): void => {
      if (args[3] === true) cancel();
    });
    lifetimeTracked = true;
  }
  if (webContents !== undefined && typeof webContents.once === "function") {
    webContents.once("destroyed", cancel);
    lifetimeTracked = true;
  }
  if (!lifetimeTracked) return;
  trackedOwners.add(owner);
}

function invalidRequest(): AiProviderFailure {
  return aiProviderFailure("AI_PROVIDER_INVALID_REQUEST", "AI Provider IPC 请求格式无效。");
}

function selectInitialModel(
  providerId: AiProviderId,
  models: readonly AiProviderModel[],
): AiProviderModel | undefined {
  const preferred: Readonly<Record<AiProviderId, readonly string[]>> = Object.freeze({
    openai: Object.freeze(["gpt-4.1-mini", "gpt-4o-mini"]),
    anthropic: Object.freeze(["claude-sonnet-4-5", "claude-3-7-sonnet-latest"]),
    gemini: Object.freeze(["models/gemini-2.5-flash", "models/gemini-2.5-pro"]),
    openrouter: Object.freeze(["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4"]),
    deepseek: Object.freeze(["deepseek-chat", "deepseek-reasoner"]),
    glm: Object.freeze(["glm-4.5", "glm-4.5-air"]),
    "kimi-cn": Object.freeze(["kimi-k2-0711-preview", "moonshot-v1-8k"]),
    "kimi-global": Object.freeze(["kimi-k2-0711-preview", "moonshot-v1-8k"]),
  });
  for (const id of preferred[providerId]) {
    const exact = models.find((model) => model.id === id);
    if (exact !== undefined) return exact;
  }
  const likelyChat = models.find((model) =>
    /(?:gpt|claude|gemini|deepseek|glm|kimi|moonshot|chat|instruct)/iu.test(model.id),
  );
  return likelyChat ?? models[0];
}

function assertOptions(options: RegisterAiProviderIpcHandlersOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.ipcMain?.handle !== "function" ||
    typeof options.store?.read !== "function" ||
    typeof options.client?.listModels !== "function" ||
    typeof options.mentor?.start !== "function" ||
    typeof options.authorize !== "function" ||
    typeof options.isShuttingDown !== "function"
  ) {
    throw new TypeError("AI Provider IPC 缺少受限依赖");
  }
}
