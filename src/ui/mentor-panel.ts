import type { MentorHint, MentorHintTarget } from "../mentor/index.js";
import type { PanelApi } from "../shared/api.js";
import type { AiProviderPublicConfig } from "../shared/ai-provider.js";

export interface MentorRemoteContext {
  readonly sourceFingerprint: string;
  readonly sourceRevision: number;
  readonly currentFunction: string;
  readonly diagnosticSummary: readonly string[];
  readonly controlFlowSummary: string;
  readonly runEvidence: readonly string[];
  readonly fullSource: string;
}

type MentorRemoteApi = Pick<
  PanelApi,
  "getAiProviderConfig" | "startAiMentor" | "readAiMentor" | "cancelAiMentor"
>;

export interface MentorPanelOptions {
  readonly onLocate?: ((target: MentorHintTarget, hint: MentorHint) => void) | undefined;
  readonly remoteApi?: MentorRemoteApi | undefined;
}

export interface MentorPanel {
  readonly element: HTMLElement;
  setHints(hints: readonly MentorHint[]): void;
  setStatus(message: string, state?: "ready" | "working" | "error"): void;
  setRemoteContext(context: MentorRemoteContext | null): void;
  destroy(): void;
}

export function createMentorPanel(
  host: HTMLElement,
  options: MentorPanelOptions = {},
): MentorPanel {
  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "mentor-panel";
  root.dataset.state = "ready";

  const headingRow = ownerDocument.createElement("header");
  headingRow.className = "mentor-panel__header";
  const heading = ownerDocument.createElement("h2");
  heading.className = "mentor-panel__title";
  heading.textContent = "导师";
  const boundary = ownerDocument.createElement("span");
  boundary.className = "mentor-panel__boundary";
  boundary.textContent = "只读建议 · 不会自动改码";
  headingRow.append(heading, boundary);

  const tabs = ownerDocument.createElement("div");
  tabs.className = "mentor-panel__tabs";
  tabs.setAttribute("role", "tablist");
  const localTab = tabButton(ownerDocument, "本地提示", true);
  const remoteTab = tabButton(ownerDocument, "AI 对话", false);
  remoteTab.disabled = options.remoteApi === undefined;
  tabs.append(localTab, remoteTab);

  const localView = ownerDocument.createElement("section");
  localView.className = "mentor-panel__view";
  localView.dataset.view = "local";
  const status = ownerDocument.createElement("output");
  status.className = "mentor-panel__status";
  status.setAttribute("aria-live", "polite");
  status.textContent = "等待分析证据";
  const list = ownerDocument.createElement("div");
  list.className = "mentor-panel__list";
  list.setAttribute("role", "list");
  localView.append(status, list);

  const remoteView = createRemoteView(ownerDocument);
  remoteView.root.hidden = true;
  root.append(headingRow, tabs, localView, remoteView.root);
  host.replaceChildren(root);

  let destroyed = false;
  let remoteContext: MentorRemoteContext | null = null;
  let remoteConfig: AiProviderPublicConfig | null = null;
  let activeSessionId: string | null = null;
  let activeFingerprint: string | null = null;
  let nextSequence = 0;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let requestGeneration = 0;
  let startPending = false;

  const render = (hints: readonly MentorHint[]): void => {
    list.replaceChildren();
    if (hints.length === 0) {
      const empty = ownerDocument.createElement("p");
      empty.className = "mentor-panel__empty";
      empty.textContent = "当前没有足够证据生成提示。";
      list.append(empty);
      status.textContent = "0 条证据提示";
      return;
    }
    for (const hint of hints) list.append(renderHint(ownerDocument, hint, options));
    status.textContent = `${String(hints.length)} 条证据提示`;
  };

  const stopPolling = (): void => {
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
  };

  const cancelRemote = (): void => {
    requestGeneration += 1;
    startPending = false;
    stopPolling();
    const sessionId = activeSessionId;
    activeSessionId = null;
    activeFingerprint = null;
    remoteView.send.disabled = false;
    remoteView.cancel.hidden = true;
    if (sessionId !== null && options.remoteApi !== undefined) {
      void options.remoteApi.cancelAiMentor({ sessionId });
    }
  };

  const pollRemote = async (): Promise<void> => {
    if (
      destroyed ||
      options.remoteApi === undefined ||
      activeSessionId === null ||
      activeFingerprint === null
    ) {
      return;
    }
    const sessionId = activeSessionId;
    const fingerprint = activeFingerprint;
    try {
      const result = await options.remoteApi.readAiMentor({
        sessionId,
        afterSequence: nextSequence,
      });
      if (
        destroyed ||
        activeSessionId !== sessionId ||
        remoteContext?.sourceFingerprint !== fingerprint
      ) {
        return;
      }
      if (result.status === "failed") {
        remoteView.status.textContent = result.error.message;
        remoteView.status.dataset.state = "error";
        cancelRemote();
        return;
      }
      if (result.sourceFingerprint !== fingerprint) {
        remoteView.status.textContent = "源码已变化，旧回答已丢弃。";
        remoteView.status.dataset.state = "error";
        cancelRemote();
        return;
      }
      nextSequence = result.nextSequence;
      for (const event of result.events) {
        if (event.kind === "answer") remoteView.answer.textContent += event.text;
      }
      if (result.status === "running") {
        pollTimer = setTimeout(() => void pollRemote(), 180);
        return;
      }
      activeSessionId = null;
      activeFingerprint = null;
      remoteView.send.disabled = false;
      remoteView.cancel.hidden = true;
      remoteView.status.textContent =
        result.status === "completed" ? "回答完成 · 仅作建议" : "请求已取消";
      remoteView.status.dataset.state = "ready";
    } catch {
      if (!destroyed && activeSessionId === sessionId) {
        remoteView.status.textContent = "无法读取 AI 回答。";
        remoteView.status.dataset.state = "error";
        cancelRemote();
      }
    }
  };

  const refreshRemoteConfig = async (): Promise<void> => {
    if (options.remoteApi === undefined) return;
    remoteView.status.textContent = "正在读取 AI 配置…";
    try {
      const result = await options.remoteApi.getAiProviderConfig();
      if (destroyed) return;
      remoteConfig = result.status === "ready" ? result.config : null;
      const ready =
        remoteConfig?.state === "connected" &&
        remoteConfig.providerId !== null &&
        remoteConfig.model !== null &&
        remoteConfig.credentialUsable;
      remoteView.form.hidden = !ready;
      remoteView.missing.hidden = ready;
      remoteView.status.textContent =
        result.status === "failed"
          ? result.error.message
          : ready
            ? `${remoteConfig!.model} · 默认仅发送当前函数和证据`
            : "请先在 设置 → AI 助手 中连接模型。";
      remoteView.status.dataset.state = result.status === "failed" ? "error" : "ready";
    } catch {
      if (!destroyed) {
        remoteView.status.textContent = "无法读取 AI 配置。";
        remoteView.status.dataset.state = "error";
      }
    }
  };

  const showView = (view: "local" | "remote"): void => {
    const remote = view === "remote";
    localTab.setAttribute("aria-selected", String(!remote));
    remoteTab.setAttribute("aria-selected", String(remote));
    localView.hidden = remote;
    remoteView.root.hidden = !remote;
    if (remote) void refreshRemoteConfig();
  };

  localTab.addEventListener("click", () => showView("local"));
  remoteTab.addEventListener("click", () => showView("remote"));
  remoteView.cancel.addEventListener("click", cancelRemote);
  remoteView.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const remoteApi = options.remoteApi;
    if (
      remoteApi === undefined ||
      remoteConfig?.state !== "connected" ||
      remoteContext === null ||
      activeSessionId !== null ||
      startPending
    ) {
      return;
    }
    const prompt = remoteView.prompt.value.trim();
    if (prompt.length === 0) {
      remoteView.status.textContent = "请输入想讨论的问题。";
      remoteView.status.dataset.state = "error";
      return;
    }
    const contextMode =
      remoteView.contextMode.value === "full-source" ? "full-source" : "current-function";
    const fingerprint = remoteContext.sourceFingerprint;
    remoteView.answer.textContent = "";
    remoteView.status.textContent = "正在生成只读建议…";
    remoteView.status.dataset.state = "working";
    remoteView.send.disabled = true;
    remoteView.cancel.hidden = false;
    const currentGeneration = requestGeneration + 1;
    requestGeneration = currentGeneration;
    startPending = true;
    void remoteApi
      .startAiMentor({
        sourceFingerprint: fingerprint,
        sourceRevision: remoteContext.sourceRevision,
        providerRevision: remoteConfig.revision,
        contextMode,
        prompt,
        context: {
          currentFunction: remoteContext.currentFunction,
          diagnosticSummary: remoteContext.diagnosticSummary,
          controlFlowSummary: remoteContext.controlFlowSummary,
          runEvidence: remoteContext.runEvidence,
          ...(contextMode === "full-source" ? { fullSource: remoteContext.fullSource } : {}),
        },
      })
      .then((result) => {
        if (
          destroyed ||
          currentGeneration !== requestGeneration ||
          remoteContext?.sourceFingerprint !== fingerprint
        ) {
          if (result.status === "started") {
            void remoteApi.cancelAiMentor({ sessionId: result.sessionId });
          }
          return;
        }
        startPending = false;
        if (result.status === "failed") {
          remoteView.status.textContent = result.error.message;
          remoteView.status.dataset.state = "error";
          remoteView.send.disabled = false;
          remoteView.cancel.hidden = true;
          return;
        }
        if (result.sourceFingerprint !== fingerprint) {
          void remoteApi.cancelAiMentor({ sessionId: result.sessionId });
          remoteView.status.textContent = "源码已变化，旧请求已取消。";
          remoteView.status.dataset.state = "error";
          remoteView.send.disabled = false;
          remoteView.cancel.hidden = true;
          return;
        }
        activeSessionId = result.sessionId;
        activeFingerprint = result.sourceFingerprint;
        nextSequence = 0;
        void pollRemote();
      })
      .catch(() => {
        if (!destroyed && currentGeneration === requestGeneration) {
          startPending = false;
          remoteView.status.textContent = "无法启动 AI 请求。";
          remoteView.status.dataset.state = "error";
          remoteView.send.disabled = false;
          remoteView.cancel.hidden = true;
        }
      });
  });

  render(Object.freeze([]));

  return Object.freeze({
    element: root,
    setHints(hints: readonly MentorHint[]): void {
      assertAlive(destroyed);
      if (!Array.isArray(hints)) throw new TypeError("mentor hints 必须是数组");
      render(hints);
    },
    setStatus(message: string, state: "ready" | "working" | "error" = "ready"): void {
      assertAlive(destroyed);
      if (typeof message !== "string" || message.trim().length === 0) {
        throw new TypeError("mentor status 必须是非空文本");
      }
      root.dataset.state = state;
      status.textContent = message;
    },
    setRemoteContext(context: MentorRemoteContext | null): void {
      assertAlive(destroyed);
      const changed = context?.sourceFingerprint !== remoteContext?.sourceFingerprint;
      if (changed) {
        cancelRemote();
        remoteView.answer.textContent = "";
        remoteView.prompt.value = "";
      }
      remoteContext = context;
      remoteView.send.disabled = context === null || activeSessionId !== null || startPending;
      if (context === null) {
        remoteView.status.textContent = "等待当前源码的分析证据。";
      }
    },
    destroy(): void {
      if (destroyed) return;
      cancelRemote();
      destroyed = true;
      host.replaceChildren();
    },
  });
}

function createRemoteView(ownerDocument: Document) {
  const root = ownerDocument.createElement("section");
  root.className = "mentor-panel__view mentor-panel__remote";
  root.dataset.view = "remote";
  const status = ownerDocument.createElement("output");
  status.className = "mentor-panel__status";
  status.setAttribute("aria-live", "polite");
  const missing = ownerDocument.createElement("p");
  missing.className = "mentor-panel__empty";
  missing.textContent = "在设置中连接 API 密钥后可使用 AI 对话。";
  const form = ownerDocument.createElement("form");
  form.className = "mentor-panel__remote-form";
  form.hidden = true;
  const contextLabel = ownerDocument.createElement("label");
  contextLabel.textContent = "上下文 ";
  const contextMode = ownerDocument.createElement("select");
  const functionOption = ownerDocument.createElement("option");
  functionOption.value = "current-function";
  functionOption.textContent = "当前函数与证据（默认）";
  const fullSourceOption = ownerDocument.createElement("option");
  fullSourceOption.value = "full-source";
  fullSourceOption.textContent = "完整源码（显式发送）";
  contextMode.append(functionOption, fullSourceOption);
  contextLabel.append(contextMode);
  const prompt = ownerDocument.createElement("textarea");
  prompt.rows = 4;
  prompt.maxLength = 8 * 1024;
  prompt.placeholder = "例如：这个循环可以怎样优化？请说明证据和代价。";
  const actions = ownerDocument.createElement("div");
  actions.className = "mentor-panel__remote-actions";
  const send = textButton(ownerDocument, "发送", "submit");
  const cancel = textButton(ownerDocument, "取消", "button");
  cancel.hidden = true;
  actions.append(send, cancel);
  form.append(contextLabel, prompt, actions);
  const answer = ownerDocument.createElement("div");
  answer.className = "mentor-panel__answer";
  answer.setAttribute("aria-live", "polite");
  root.append(status, missing, form, answer);
  return { root, status, missing, form, contextMode, prompt, send, cancel, answer } as const;
}

function tabButton(ownerDocument: Document, label: string, selected: boolean): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "mentor-panel__tab";
  button.setAttribute("role", "tab");
  button.setAttribute("aria-selected", String(selected));
  button.textContent = label;
  return button;
}

function textButton(
  ownerDocument: Document,
  label: string,
  type: "button" | "submit",
): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = type;
  button.className = "mentor-panel__text-button";
  button.textContent = label;
  return button;
}

function renderHint(
  ownerDocument: Document,
  hint: MentorHint,
  options: MentorPanelOptions,
): HTMLElement {
  const item = ownerDocument.createElement("article");
  item.className = "mentor-hint";
  item.dataset.hintId = hint.id;
  item.dataset.confidence = hint.confidence;
  item.dataset.level = hint.level;
  item.setAttribute("role", "listitem");
  const action = ownerDocument.createElement("button");
  action.className = "mentor-hint__action";
  action.type = "button";
  action.disabled = hint.target === null;
  action.setAttribute(
    "aria-label",
    hint.target === null ? `${hint.title}，无源码定位` : `${hint.title}，定位源码`,
  );
  const title = ownerDocument.createElement("strong");
  title.className = "mentor-hint__title";
  title.textContent = hint.title;
  const meta = span(
    ownerDocument,
    "mentor-hint__meta",
    `${confidenceLabel(hint.confidence)} · ${levelLabel(hint.level)}`,
  );
  const summary = ownerDocument.createElement("span");
  summary.className = "mentor-hint__summary";
  summary.textContent = hint.summary;
  const next = span(ownerDocument, "mentor-hint__next", `下一步：${hint.nextStep}`);
  const evidenceLabels = [...new Set(hint.evidence.map((entry) => entry.label))].join(" / ");
  const evidence = span(
    ownerDocument,
    "mentor-hint__evidence",
    `${String(hint.evidence.length)} 项证据${evidenceLabels.length === 0 ? "" : ` · ${evidenceLabels}`} · 不会自动改码`,
  );
  action.append(title, meta, summary, next, evidence);
  const target = hint.target;
  if (target !== null) action.addEventListener("click", () => options.onLocate?.(target, hint));
  item.append(action);
  return item;
}

function span(
  document: Document,
  className: string,
  text: string,
  tag: "span" | "strong" = "span",
): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function confidenceLabel(value: MentorHint["confidence"]): string {
  const labels = { certain: "确定", likely: "可能", hint: "提示" } as const;
  return labels[value];
}

function levelLabel(value: MentorHint["level"]): string {
  const labels = {
    verification: "事实核对",
    elaboration: "原因说明",
    strategy: "策略提示",
  } as const;
  return labels[value];
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("MentorPanel 已销毁");
}
