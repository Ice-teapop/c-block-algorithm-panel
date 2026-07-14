import type { PanelApi } from "../shared/api.js";
import {
  AI_PROVIDER_LABELS,
  type AiMentorTurn,
  type AiProviderError,
  type AiProviderPublicConfig,
} from "../shared/ai-provider.js";
import type {
  AiWindowBackground,
  AiWindowIntent,
  AiWindowMessage as AiWorkspaceMessage,
  AiWindowPendingReview as AiWorkspacePendingReview,
  AiWindowPermissionMode as AiWorkspacePermissionMode,
  AiWindowStateEnvelope,
  AiWindowViewState as AiWorkspaceWindowState,
} from "../shared/ai-window.js";
import type { WorkspaceEntrySummary } from "../shared/workspace.js";
import type { InterfaceLocale } from "../shared/interface-locale.js";
import type {
  AiSourceEditController,
  AiSourceEditPlan,
  AiSourceEditRejectionCode,
} from "./ai-source-edit-controller.js";
import {
  createAiProjectController,
  type AiProjectControllerState,
} from "./ai-project-controller.js";
import {
  AI_EDIT_PERMISSION_CHANGE_EVENT,
  availableAiEditPermissions,
  readAiEditPermission,
} from "../ui/ai-edit-permission.js";
import { AI_PROVIDER_CONFIG_CHANGE_EVENT } from "../ui/ai-provider-events.js";
import type { MentorRemoteContext } from "../ui/mentor-panel.js";

const AI_WINDOW_MODE_STORAGE_KEY = "c-block-algorithm-panel.ai-window-mode.v1";
const POLL_INTERVAL_MS = 120;

export interface AiWorkspaceIntegrationOptions {
  readonly host: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly api: PanelApi;
  readonly getRemoteContext: () => MentorRemoteContext | null;
  readonly sourceEdit: AiSourceEditController;
  readonly openSettings: () => void;
}

export interface AiWorkspaceIntegration {
  readonly workspaceId: string | null;
  readonly permission: AiWorkspacePermissionMode;
  setWorkspace(entry: WorkspaceEntrySummary | null): Promise<void>;
  invalidateSource(): void;
  confirmEdit(plan: AiSourceEditPlan): Promise<boolean>;
  open(): void;
  destroy(): void;
}

interface PendingReviewResolver {
  readonly id: string;
  readonly resolve: (accepted: boolean) => void;
}

export function createAiWorkspaceIntegration(
  options: AiWorkspaceIntegrationOptions,
): AiWorkspaceIntegration {
  let destroyed = false;
  let requestGeneration = 0;
  let activeSessionId: string | null = null;
  let responding = false;
  let providerConfig: AiProviderPublicConfig | null = null;
  let maximumPermission = readAiEditPermission();
  let permission = readStoredMode();
  if (!availableAiEditPermissions(maximumPermission).includes(permission)) permission = "read-only";
  let transient: AiWorkspaceMessage | null = null;
  let pendingReview: AiWorkspacePendingReview | null = null;
  let pendingReviewResolver: PendingReviewResolver | null = null;
  const changeSummaries = new Map<string, string>();
  let projectState: AiProjectControllerState | null = null;
  let stateSequence = 0;
  let windowOpen = false;
  let readyToRender = false;

  const project = createAiProjectController({
    api: options.api,
    defaultConversationTitle: () => localized(options.host, "新对话", "New conversation"),
    onState(next): void {
      projectState = next;
      if (readyToRender) render();
    },
  });

  const windowState = (): AiWorkspaceWindowState => {
    const current = projectState;
    const snapshot = current?.project ?? null;
    const locale = interfaceLocale(options.host);
    const messages: AiWorkspaceMessage[] = (current?.activeConversation?.messages ?? []).map(
      (message) =>
        Object.freeze({
          id: message.id,
          role: message.role,
          content: message.content,
          state: "complete" as const,
          ...(changeSummaries.has(message.id)
            ? { changeSummary: changeSummaries.get(message.id)! }
            : {}),
        }),
    );
    if (transient !== null) messages.push(transient);
    const projectSummary =
      snapshot === null
        ? Object.freeze([])
        : Object.freeze([
            Object.freeze({
              id: snapshot.projectId,
              name: localizeAiSystemLabel(
                current?.workspaceTitle || localized(options.host, "当前项目", "Current project"),
                locale,
              ),
              conversations: Object.freeze(
                snapshot.conversations
                  .filter((conversation) => conversation.state === "active")
                  .map((conversation) =>
                    Object.freeze({
                      id: conversation.id,
                      title: localizeAiSystemLabel(conversation.title, locale),
                      updatedLabel: compactUpdatedLabel(conversation.updatedAt, locale),
                    }),
                  ),
              ),
            }),
          ]);
    return Object.freeze({
      projects: projectSummary,
      activeProjectId: snapshot?.projectId ?? null,
      activeConversationId: current?.activeConversation?.id ?? null,
      messages: Object.freeze(messages),
      mode: permission,
      availableModes: availableAiEditPermissions(maximumPermission),
      modelLabel: providerLabel(providerConfig, options.host),
      suggestedQuestions: suggestedQuestions(options.host),
      isResponding: responding,
      pendingReview,
    });
  };

  function render(): void {
    if (destroyed) return;
    const envelope: AiWindowStateEnvelope = Object.freeze({
      sequence: ++stateSequence,
      locale: options.host.dataset.locale === "en" ? "en" : "zh-CN",
      background: readBackground(options.host),
      theme: readTheme(options.host),
      state: windowState(),
    });
    void options.api.publishAiWindowState(envelope);
  }

  const cancelReview = (): void => {
    const resolver = pendingReviewResolver;
    pendingReviewResolver = null;
    pendingReview = null;
    resolver?.resolve(false);
    render();
  };

  const cancelCurrent = (): void => {
    requestGeneration += 1;
    responding = false;
    transient = null;
    cancelReview();
    const sessionId = activeSessionId;
    activeSessionId = null;
    if (sessionId !== null) void options.api.cancelAiMentor({ sessionId });
    render();
  };

  const refreshProvider = async (): Promise<void> => {
    const generation = requestGeneration;
    const result = await options.api.getAiProviderConfig();
    if (destroyed || generation !== requestGeneration) return;
    providerConfig = result.status === "ready" ? result.config : null;
    render();
  };

  const showError = (message: string): void => {
    transient = Object.freeze({
      id: `ai-error:${String(Date.now())}`,
      role: "assistant",
      content: message,
      state: "error",
    });
    render();
  };

  const handleProposal = async (
    proposal: Parameters<AiSourceEditController["plan"]>[0],
    context: MentorRemoteContext,
    assistantMessageId: string | null,
  ): Promise<void> => {
    const planned = options.sourceEdit.plan(
      proposal,
      Object.freeze({
        workspaceId: context.workspaceId,
        sourceRevision: context.sourceRevision,
        sourceFingerprint: context.sourceFingerprint,
      }),
    );
    if (planned.status === "rejected") {
      if (assistantMessageId !== null) {
        changeSummaries.set(
          assistantMessageId,
          aiSourceEditFailureMessage(planned.code, planned.message, interfaceLocale(options.host)),
        );
      }
      render();
      return;
    }
    const result = await options.sourceEdit.apply(planned.plan);
    const summary =
      result.status === "applied"
        ? aiDiffSummaryMessage(result.diffSummary, interfaceLocale(options.host))
        : result.status === "source-changed"
          ? localized(
              options.host,
              `源码已提交，但画布刷新失败 · ${result.diffSummary}`,
              `Source committed, but the canvas could not refresh · ${aiDiffSummaryMessage(result.diffSummary, "en")}`,
            )
          : result.status === "cancelled"
            ? localized(options.host, "已放弃修改", "Change discarded")
            : aiSourceEditFailureMessage(
                result.code,
                result.message,
                interfaceLocale(options.host),
              );
    if (assistantMessageId !== null) changeSummaries.set(assistantMessageId, summary);
    if (result.status === "rejected" || result.status === "source-changed") {
      showError(
        result.status === "rejected"
          ? aiSourceEditFailureMessage(result.code, result.message, interfaceLocale(options.host))
          : localized(
              options.host,
              "源码已提交，但画布无法刷新；请重新打开项目。",
              "The source was committed, but the canvas could not refresh. Reopen the project.",
            ),
      );
    } else {
      render();
    }
  };

  const pollResponse = async (
    sessionId: string,
    generation: number,
    context: MentorRemoteContext,
  ): Promise<void> => {
    let sequence = 0;
    for (;;) {
      await delay(POLL_INTERVAL_MS);
      if (destroyed || generation !== requestGeneration || activeSessionId !== sessionId) return;
      const result = await options.api.readAiMentor({ sessionId, afterSequence: sequence });
      if (destroyed || generation !== requestGeneration || activeSessionId !== sessionId) return;
      if (result.status === "failed") {
        activeSessionId = null;
        responding = false;
        showError(localizedProviderFailure(result.error, options.host));
        return;
      }
      if (result.sourceFingerprint !== context.sourceFingerprint) {
        cancelCurrent();
        showError(
          localized(
            options.host,
            "源码已变化，旧回答已丢弃。",
            "Source changed; the stale answer was discarded.",
          ),
        );
        return;
      }
      sequence = result.nextSequence;
      if (result.status === "running") continue;
      activeSessionId = null;
      responding = false;
      transient = null;
      if (result.status === "cancelled") {
        render();
        return;
      }
      const answer = result.events.find((event) => event.kind === "answer")?.text ?? "";
      const proposal = result.events.find((event) => event.kind === "proposal");
      const message =
        answer.trim().length === 0
          ? null
          : await project.appendMessage("assistant", answer, context.sourceFingerprint);
      render();
      if (proposal?.kind === "proposal") {
        await handleProposal(proposal.proposal, context, message?.id ?? null);
      }
      return;
    }
  };

  const send = async (prompt: string): Promise<void> => {
    if (destroyed || responding) return;
    const context = options.getRemoteContext();
    const config = providerConfig;
    const conversation = project.state.activeConversation;
    if (
      config === null ||
      config.state !== "connected" ||
      !config.credentialUsable ||
      config.model === null
    ) {
      showError(
        localized(options.host, "请先在设置中连接模型。", "Connect a model in Settings first."),
      );
      return;
    }
    if (context === null || conversation === null || project.state.workspaceId === null) {
      showError(
        localized(
          options.host,
          "等待项目源码与分析证据就绪。",
          "Waiting for project source and analysis evidence.",
        ),
      );
      return;
    }
    const history = completedHistory(conversation.messages);
    const generation = ++requestGeneration;
    transient = null;
    const userMessage = await project.appendMessage("user", prompt, context.sourceFingerprint);
    if (destroyed || generation !== requestGeneration || userMessage === null) return;
    responding = true;
    transient = Object.freeze({
      id: `ai-pending:${String(generation)}`,
      role: "assistant",
      content: localized(options.host, "正在读取当前证据…", "Reading current evidence…"),
      state: "streaming",
    });
    render();
    const proposeEdit = permission !== "read-only";
    const start = await options.api.startAiMentor({
      sourceFingerprint: context.sourceFingerprint,
      sourceRevision: context.sourceRevision,
      providerRevision: config.revision,
      contextMode: proposeEdit ? "full-source" : "current-function",
      intent: proposeEdit ? "propose-edit" : "chat",
      locale: interfaceLocale(options.host),
      prompt,
      history,
      context: Object.freeze({
        currentFunction: context.currentFunction,
        diagnosticSummary: context.diagnosticSummary,
        controlFlowSummary: context.controlFlowSummary,
        runEvidence: context.runEvidence,
        ...(proposeEdit ? { fullSource: context.fullSource } : {}),
      }),
    });
    if (destroyed || generation !== requestGeneration) return;
    if (start.status === "failed") {
      responding = false;
      transient = null;
      showError(localizedProviderFailure(start.error, options.host));
      return;
    }
    activeSessionId = start.sessionId;
    void pollResponse(start.sessionId, generation, context);
  };

  const handleWindowIntent = (intent: AiWindowIntent): void => {
    const activeProjectId = project.state.project?.projectId ?? null;
    if (intent.type === "cancel") {
      cancelCurrent();
      return;
    }
    if (intent.type === "open-model-settings") {
      options.openSettings();
      return;
    }
    if (intent.type === "mode-change") {
      if (!availableAiEditPermissions(maximumPermission).includes(intent.mode)) return;
      permission = intent.mode;
      writeStoredMode(intent.mode);
      render();
      return;
    }
    if (intent.type === "review-decision") {
      if (pendingReviewResolver?.id !== intent.reviewId) return;
      const resolver = pendingReviewResolver;
      pendingReviewResolver = null;
      pendingReview = null;
      render();
      resolver.resolve(intent.accepted);
      return;
    }
    if (intent.type === "select-project") return;
    if (intent.type === "select-conversation") {
      if (intent.projectId !== activeProjectId) return;
      cancelCurrent();
      void project.selectConversation(intent.conversationId);
      return;
    }
    if (intent.type === "new-conversation") {
      if (intent.projectId !== activeProjectId) return;
      cancelCurrent();
      void project.createConversation();
      return;
    }
    if (intent.type === "send") {
      const activeConversationId = project.state.activeConversation?.id ?? null;
      if (
        intent.projectId !== activeProjectId ||
        intent.conversationId !== activeConversationId ||
        intent.mode !== permission
      ) {
        showError(
          localized(
            options.host,
            "项目或对话已变化，请重新发送。",
            "The project or conversation changed. Send the question again.",
          ),
        );
        return;
      }
      void send(intent.prompt);
    }
  };

  const onTrigger = (): void => {
    void options.api.toggleAiWindow().then((result) => {
      if (destroyed || result.status !== "ok") return;
      windowOpen = !windowOpen;
      options.trigger.setAttribute("aria-expanded", String(windowOpen));
      if (windowOpen) void refreshProvider();
    });
  };
  const onProviderChange = (): void => void refreshProvider();
  const onPermissionChange = (): void => {
    maximumPermission = readAiEditPermission();
    permission = maximumPermission;
    writeStoredMode(permission);
    if (permission === "read-only") cancelReview();
    render();
  };
  const onLocaleChange = (): void => render();
  const stopWindowIntents = options.api.onAiWindowIntent(handleWindowIntent);
  const stopWindowClosed = options.api.onAiWindowClosed(() => {
    windowOpen = false;
    options.trigger.setAttribute("aria-expanded", "false");
  });
  options.trigger.addEventListener("click", onTrigger);
  options.host.ownerDocument.defaultView?.addEventListener(
    AI_PROVIDER_CONFIG_CHANGE_EVENT,
    onProviderChange,
  );
  options.host.ownerDocument.addEventListener(AI_EDIT_PERMISSION_CHANGE_EVENT, onPermissionChange);
  options.host.addEventListener("workbench-locale-change", onLocaleChange);
  const preferenceObserver = observeInterfacePreferences(options.host, render);
  readyToRender = true;
  render();
  void refreshProvider();

  return Object.freeze({
    get workspaceId(): string | null {
      return project.state.workspaceId;
    },
    get permission(): AiWorkspacePermissionMode {
      return permission;
    },
    async setWorkspace(entry: WorkspaceEntrySummary | null): Promise<void> {
      cancelCurrent();
      changeSummaries.clear();
      await project.setWorkspace(entry?.id ?? null, entry?.title ?? "");
    },
    invalidateSource(): void {
      cancelCurrent();
    },
    confirmEdit(plan: AiSourceEditPlan): Promise<boolean> {
      if (destroyed || permission !== "review") return Promise.resolve(permission === "agent");
      cancelReview();
      const id = `ai-review:${String(Date.now())}:${String(Math.random()).slice(2)}`;
      pendingReview = Object.freeze({
        id,
        summary: plan.proposal.summary,
        diffSummary: aiDiffSummaryMessage(plan.diffSummary, interfaceLocale(options.host)),
      });
      render();
      return new Promise<boolean>((resolve) => {
        pendingReviewResolver = Object.freeze({ id, resolve });
      });
    },
    open(): void {
      void options.api.openAiWindow().then((result) => {
        if (destroyed || result.status !== "ok") return;
        windowOpen = true;
        options.trigger.setAttribute("aria-expanded", "true");
        void refreshProvider();
      });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cancelCurrent();
      options.trigger.removeEventListener("click", onTrigger);
      options.host.ownerDocument.defaultView?.removeEventListener(
        AI_PROVIDER_CONFIG_CHANGE_EVENT,
        onProviderChange,
      );
      options.host.ownerDocument.removeEventListener(
        AI_EDIT_PERMISSION_CHANGE_EVENT,
        onPermissionChange,
      );
      options.host.removeEventListener("workbench-locale-change", onLocaleChange);
      preferenceObserver?.disconnect();
      stopWindowIntents();
      stopWindowClosed();
      project.destroy();
    },
  });
}

function completedHistory(
  messages: readonly { readonly role: "user" | "assistant"; readonly content: string }[],
): readonly AiMentorTurn[] {
  const pairs: AiMentorTurn[][] = [];
  for (let index = 0; index + 1 < messages.length; index += 1) {
    const user = messages[index];
    const assistant = messages[index + 1];
    if (user?.role !== "user" || assistant?.role !== "assistant") continue;
    pairs.push([
      Object.freeze({ role: "user", content: user.content.slice(0, 4_096) }),
      Object.freeze({ role: "assistant", content: assistant.content.slice(0, 4_096) }),
    ]);
    index += 1;
  }
  const turns = pairs.slice(-6).flat();
  while (turns.reduce((total, turn) => total + turn.content.length, 0) > 24 * 1_024) {
    turns.splice(0, 2);
  }
  return Object.freeze(turns);
}

function providerLabel(config: AiProviderPublicConfig | null, host: HTMLElement): string {
  if (
    config?.providerId === null ||
    config?.providerId === undefined ||
    config.state !== "connected"
  ) {
    return localized(host, "连接模型", "Connect model");
  }
  return `${localizedProviderLabel(config.providerId, interfaceLocale(host))} · ${config.model ?? localized(host, "选择模型", "Choose model")}`;
}

function localizedProviderLabel(
  providerId: keyof typeof AI_PROVIDER_LABELS,
  locale: InterfaceLocale,
): string {
  if (locale !== "en") return AI_PROVIDER_LABELS[providerId];
  if (providerId === "glm") return "GLM";
  if (providerId === "kimi-cn") return "Kimi (China)";
  if (providerId === "kimi-global") return "Kimi (Global)";
  return AI_PROVIDER_LABELS[providerId];
}

function suggestedQuestions(host: HTMLElement): readonly string[] {
  return host.dataset.locale === "en"
    ? Object.freeze([
        "Explain the current algorithm",
        "Find a likely edge-case bug",
        "Design three useful tests",
        "Suggest one measurable improvement",
      ])
    : Object.freeze([
        "解释当前算法",
        "找一个可能的边界错误",
        "设计三组有效测试",
        "提出一个可量化的改进",
      ]);
}

function compactUpdatedLabel(value: string, locale: InterfaceLocale): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? ""
    : parsed.toLocaleTimeString(locale === "en" ? "en" : "zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** Only translates labels created by the application; arbitrary user names remain untouched. */
export function localizeAiSystemLabel(value: string, locale: InterfaceLocale): string {
  if (value === "新对话" || value === "New conversation") {
    return locale === "en" ? "New conversation" : "新对话";
  }
  if (value === "教程 · 扫描求最大值" || value === "Tutorial · Scan for Maximum") {
    return locale === "en" ? "Tutorial · Scan for Maximum" : "教程 · 扫描求最大值";
  }
  if (value === "当前项目" || value === "Current project") {
    return locale === "en" ? "Current project" : "当前项目";
  }
  return value;
}

function localized(host: HTMLElement, zh: string, en: string): string {
  return host.dataset.locale === "en" ? en : zh;
}

function localizedProviderFailure(error: AiProviderError, host: HTMLElement): string {
  const copy: Record<AiProviderError["code"], readonly [string, string]> = {
    AI_PROVIDER_INVALID_REQUEST: ["AI 请求无效。", "The AI request is invalid."],
    AI_PROVIDER_CONFLICT: ["AI 设置已变化，请重试。", "AI settings changed. Try again."],
    AI_PROVIDER_ENCRYPTION_UNAVAILABLE: [
      "系统加密存储不可用。",
      "Secure credential storage is unavailable.",
    ],
    AI_PROVIDER_CONTEXT_CLOSED: ["AI 窗口上下文已关闭。", "The AI window context was closed."],
    AI_PROVIDER_CORRUPT_STORE: ["AI 设置无法读取。", "AI settings could not be read."],
    AI_PROVIDER_NOT_REGULAR_FILE: ["AI 设置文件无效。", "The AI settings file is invalid."],
    AI_PROVIDER_TOO_LARGE: ["AI 设置超过安全上限。", "AI settings exceed the safety limit."],
    AI_PROVIDER_READ_FAILED: ["无法读取 AI 设置。", "AI settings could not be read."],
    AI_PROVIDER_WRITE_FAILED: ["无法保存 AI 设置。", "AI settings could not be saved."],
    AI_PROVIDER_NOT_CONNECTED: ["请先连接模型。", "Connect a model first."],
    AI_PROVIDER_CREDENTIAL_REJECTED: [
      "服务商拒绝了 API 密钥。",
      "The provider rejected the API key.",
    ],
    AI_PROVIDER_NETWORK_FAILED: ["无法连接 AI 服务。", "The AI service could not be reached."],
    AI_PROVIDER_TIMEOUT: ["AI 请求超时。", "The AI request timed out."],
    AI_PROVIDER_RESPONSE_TOO_LARGE: [
      "AI 响应超过安全上限。",
      "The AI response exceeds the safety limit.",
    ],
    AI_PROVIDER_INVALID_RESPONSE: ["AI 返回内容无效。", "The AI response is invalid."],
    AI_PROVIDER_MODEL_UNAVAILABLE: ["所选模型不可用。", "The selected model is unavailable."],
    AI_PROVIDER_BUSY: ["已有 AI 请求正在进行。", "Another AI request is already running."],
    AI_PROVIDER_SESSION_NOT_FOUND: ["AI 会话已失效。", "The AI session is no longer available."],
    AI_PROVIDER_SOURCE_STALE: [
      "源码已变化，旧回答已丢弃。",
      "Source changed; the stale answer was discarded.",
    ],
  };
  const [zh, en] = copy[error.code];
  return localized(host, zh, en);
}

export function aiSourceEditFailureMessage(
  code: AiSourceEditRejectionCode,
  rawMessage: string,
  locale: InterfaceLocale,
): string {
  if (locale !== "en") return rawMessage;
  const copy: Record<AiSourceEditRejectionCode, string> = {
    "invalid-proposal": "The proposed source change is invalid.",
    "not-ready": "Source analysis is not ready yet.",
    "read-only": "Source editing is disabled in read-only mode.",
    "stale-workspace": "The project changed before the edit could be applied.",
    "stale-source": "The source changed before the edit could be applied.",
    "ambiguous-anchor": "The edit target is ambiguous.",
    "locked-region": "This source region cannot be changed safely.",
    "invalid-source": "The proposed change would create invalid source.",
    "parse-error": "The proposed source could not be parsed safely.",
    "roundtrip-failed": "The proposed change failed the lossless source check.",
    "cfg-regression": "The proposed change would reduce control-flow accuracy.",
    "unsafe-projection": "The current canvas projection is not safe to edit.",
    "foreign-plan": "This edit belongs to a different project or source version.",
    "confirmation-failed": "The source change could not be confirmed.",
    "commit-failed": "The verified source change could not be committed.",
  };
  return copy[code];
}

export function aiDiffSummaryMessage(raw: string, locale: InterfaceLocale): string {
  if (locale !== "en") return raw;
  const match = /^(\d+) 处替换 · -(\d+) 行\/\+(\d+) 行 · -(\d+)\/\+(\d+) 字符$/u.exec(raw);
  if (match === null) {
    return /[\p{Script=Han}]/u.test(raw) ? "Source change summary available" : raw;
  }
  return `${match[1]} replacements · -${match[2]} lines/+${match[3]} lines · -${match[4]}/+${match[5]} characters`;
}

function interfaceLocale(host: HTMLElement): InterfaceLocale {
  return host.dataset.locale === "en" ? "en" : "zh-CN";
}

function readBackground(host: HTMLElement): AiWindowBackground {
  const value = host.ownerDocument.documentElement.dataset.background;
  return value === "paper" || value === "cool" ? value : "white";
}

function readTheme(host: HTMLElement): "light" | "dark" {
  return host.ownerDocument.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function observeInterfacePreferences(
  host: HTMLElement,
  onChange: () => void,
): MutationObserver | null {
  const Observer = host.ownerDocument.defaultView?.MutationObserver;
  if (Observer === undefined) return null;
  const root = host.ownerDocument.documentElement;
  let background = readBackground(host);
  let theme = readTheme(host);
  const observer = new Observer(() => {
    const next = readBackground(host);
    const nextTheme = readTheme(host);
    if (next === background && nextTheme === theme) return;
    background = next;
    theme = nextTheme;
    onChange();
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["data-background", "data-theme"],
  });
  return observer;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function readStoredMode(): AiWorkspacePermissionMode {
  try {
    const value = globalThis.localStorage.getItem(AI_WINDOW_MODE_STORAGE_KEY);
    return value === "review" || value === "agent" ? value : "read-only";
  } catch {
    return "read-only";
  }
}

function writeStoredMode(mode: AiWorkspacePermissionMode): void {
  try {
    globalThis.localStorage.setItem(AI_WINDOW_MODE_STORAGE_KEY, mode);
  } catch {
    // Session selection remains active when storage is unavailable.
  }
}
