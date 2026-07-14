import type { PanelApi } from "../shared/api.js";
import {
  AI_PROVIDER_LABELS,
  parseAiCredentialInput,
  type AiProviderError,
  type AiProviderId,
  type AiProviderModel,
  type AiProviderPublicConfig,
} from "../shared/ai-provider.js";
import { dispatchAiProviderConfigChange } from "./ai-provider-events.js";
import { readAiEditPermission, writeAiEditPermission } from "./ai-edit-permission.js";
import type { AiEditPermission } from "../shared/ai-edit.js";

export interface AiProviderSettings {
  destroy(): void;
}

type AiSettingsApi = Pick<
  PanelApi,
  | "getAiProviderConfig"
  | "connectAiProvider"
  | "listAiProviderModels"
  | "selectAiProviderModel"
  | "disconnectAiProvider"
>;

const COPY = Object.freeze({
  "zh-CN": Object.freeze({
    purpose:
      "用你的模型识别并解释算法、查找可疑逻辑和边界缺口、比较设计与优化方案，并结合运行证据提出下一步实验。",
    boundary: "密钥只会发往你最终选择的官方域名，并由系统加密存储。",
    nextStep: "连接后，单击顶部“AI”打开对话窗口；“分析”页可复核当前证据。",
    keyLabel: "API 密钥",
    keyPlaceholder: "粘贴密钥或 OPENAI_API_KEY=…",
    connect: "连接",
    replace: "更换密钥",
    clear: "清除",
    model: "模型",
    disconnected: "尚未连接 AI 厂商。",
    connecting: "正在连接所选厂商…",
    connected: "已连接",
    choose: "无法只凭这个密钥确定厂商，请单击选择：",
    encryption: "系统加密存储不可用，禁止明文降级。",
    modelLoading: "正在读取官方模型目录…",
    modelSelected: "模型已切换。",
    reconnect: "旧配置不在官方注册表内，请重新连接。",
    permissionTitle: "代码权限",
    permissionReadOnly: "只读（默认）",
    permissionReview: "审阅后应用",
    permissionAgent: "受控执行",
    permissionBoundary:
      "受控执行也只能提交当前 main.c 的候选差异；解析、CFG、源码版本或锚点验证失败时不会写入。",
    invalidCredential: "无法识别这个 API 密钥，请检查输入格式。",
    connectionFailed: "无法完成 AI 厂商连接。",
  }),
  en: Object.freeze({
    purpose:
      "Use your model to identify and explain algorithms, find suspicious logic and boundary gaps, compare designs and optimizations, and propose the next evidence-based experiment.",
    boundary:
      "The key is sent only to the official provider you select and stored with OS encryption.",
    nextStep:
      "After connecting, select AI in the top bar to open chat. Analysis can review the current evidence.",
    keyLabel: "API key",
    keyPlaceholder: "Paste a key or OPENAI_API_KEY=…",
    connect: "Connect",
    replace: "Replace key",
    clear: "Clear",
    model: "Model",
    disconnected: "No AI provider connected.",
    connecting: "Connecting to the selected provider…",
    connected: "connected",
    choose: "This key is ambiguous. Select its provider:",
    encryption: "OS encryption is unavailable; plaintext fallback is disabled.",
    modelLoading: "Loading the official model catalog…",
    modelSelected: "Model changed.",
    reconnect: "The legacy endpoint is not in the official registry. Reconnect to continue.",
    permissionTitle: "Code permission",
    permissionReadOnly: "Read only (default)",
    permissionReview: "Review before apply",
    permissionAgent: "Controlled execution",
    permissionBoundary:
      "Controlled execution can only submit candidate diffs to the current main.c. Failed source, anchor, parse, or CFG checks never write.",
    invalidCredential: "The API key format could not be recognized.",
    connectionFailed: "The AI provider connection could not be completed.",
  }),
});

export function createAiProviderSettings(
  host: HTMLElement,
  api: AiSettingsApi,
): AiProviderSettings {
  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "ai-provider-settings";

  const purpose = ownerDocument.createElement("p");
  purpose.className = "ai-provider-settings__purpose";
  const boundary = ownerDocument.createElement("p");
  boundary.className = "ai-provider-settings__boundary";

  const connectForm = ownerDocument.createElement("form");
  connectForm.className = "ai-provider-settings__connect";
  connectForm.noValidate = true;
  const keyLabel = ownerDocument.createElement("label");
  keyLabel.className = "ai-provider-settings__key";
  const keyLabelText = ownerDocument.createElement("span");
  const keyInput = ownerDocument.createElement("input");
  keyInput.type = "password";
  keyInput.autocomplete = "off";
  keyInput.spellcheck = false;
  keyInput.maxLength = 16 * 1024;
  keyLabel.append(keyLabelText, keyInput);
  const connect = textButton(ownerDocument, "", "submit");
  connectForm.append(keyLabel, connect);

  const candidates = ownerDocument.createElement("div");
  candidates.className = "ai-provider-settings__candidates";
  candidates.hidden = true;

  const connected = ownerDocument.createElement("div");
  connected.className = "ai-provider-settings__connected";
  connected.hidden = true;
  const identity = ownerDocument.createElement("strong");
  const modelLabel = ownerDocument.createElement("label");
  modelLabel.className = "ai-provider-settings__model";
  const modelLabelText = ownerDocument.createElement("span");
  const modelInput = ownerDocument.createElement("input");
  const modelList = ownerDocument.createElement("datalist");
  modelList.id = `ai-provider-models-${Math.random().toString(36).slice(2)}`;
  modelInput.setAttribute("list", modelList.id);
  modelInput.autocomplete = "off";
  modelInput.spellcheck = false;
  modelLabel.append(modelLabelText, modelInput, modelList);
  const connectedActions = ownerDocument.createElement("div");
  connectedActions.className = "ai-provider-settings__actions";
  const replace = textButton(ownerDocument, "", "button");
  const clear = textButton(ownerDocument, "", "button");
  connectedActions.append(replace, clear);
  connected.append(identity, modelLabel, connectedActions);

  const status = ownerDocument.createElement("output");
  status.className = "ai-provider-settings__status";
  status.setAttribute("aria-live", "polite");
  const nextStep = ownerDocument.createElement("p");
  nextStep.className = "ai-provider-settings__next-step";
  const permission = ownerDocument.createElement("section");
  permission.className = "ai-provider-settings__permission";
  const permissionLabel = ownerDocument.createElement("label");
  const permissionLabelText = ownerDocument.createElement("span");
  const permissionSelect = ownerDocument.createElement("select");
  permissionSelect.append(
    permissionOption(ownerDocument, "read-only"),
    permissionOption(ownerDocument, "review"),
    permissionOption(ownerDocument, "agent"),
  );
  permissionLabel.append(permissionLabelText, permissionSelect);
  const permissionBoundary = ownerDocument.createElement("p");
  permission.append(permissionLabel, permissionBoundary);
  root.append(purpose, boundary, connectForm, candidates, connected, status, permission, nextStep);
  host.replaceChildren(root);

  let current: AiProviderPublicConfig | null = null;
  let models: readonly AiProviderModel[] = Object.freeze([]);
  let pendingCredential = "";
  let pendingCandidates: readonly AiProviderId[] = Object.freeze([]);
  let encryptionAvailable = false;
  let busy = false;
  let replacing = false;
  let destroyed = false;
  let editPermission = readAiEditPermission();
  let visibleFailure:
    | { readonly kind: "provider"; readonly error: AiProviderError }
    | { readonly kind: "credential" | "connection" }
    | null = null;

  const locale = (): keyof typeof COPY =>
    ownerDocument.documentElement.dataset.locale === "en" ? "en" : "zh-CN";

  const renderModels = (): void => {
    modelList.replaceChildren(
      ...models.map((model) => {
        const option = ownerDocument.createElement("option");
        option.value = model.id;
        option.label =
          locale() === "en" && /[\p{Script=Han}]/u.test(model.label) ? model.id : model.label;
        return option;
      }),
    );
  };

  const renderCandidates = (): void => {
    if (pendingCandidates.length === 0) return;
    const lead = ownerDocument.createElement("span");
    lead.textContent = COPY[locale()].choose;
    const buttons = pendingCandidates.map((providerId) => {
      const button = textButton(
        ownerDocument,
        providerDisplayLabel(providerId, locale()),
        "button",
      );
      button.dataset.providerId = providerId;
      return button;
    });
    candidates.replaceChildren(lead, ...buttons);
  };

  const render = (): void => {
    const copy = COPY[locale()];
    renderModels();
    renderCandidates();
    purpose.textContent = copy.purpose;
    boundary.textContent = copy.boundary;
    nextStep.textContent = copy.nextStep;
    keyLabelText.textContent = copy.keyLabel;
    keyInput.placeholder = copy.keyPlaceholder;
    connect.textContent = copy.connect;
    modelLabelText.textContent = copy.model;
    replace.textContent = copy.replace;
    clear.textContent = copy.clear;
    permissionLabelText.textContent = copy.permissionTitle;
    permissionSelect.options[0]!.textContent = copy.permissionReadOnly;
    permissionSelect.options[1]!.textContent = copy.permissionReview;
    permissionSelect.options[2]!.textContent = copy.permissionAgent;
    permissionSelect.value = editPermission;
    permissionBoundary.textContent = copy.permissionBoundary;
    const active = current;
    const usable =
      active?.state === "connected" &&
      active.providerId !== null &&
      active.hasCredential &&
      active.credentialUsable;
    connectForm.hidden = usable && !replacing;
    connected.hidden = !usable;
    if (usable && active !== null && active.providerId !== null) {
      identity.textContent = `${providerDisplayLabel(active.providerId, locale())} · ${copy.connected}`;
      if (ownerDocument.activeElement !== modelInput) modelInput.value = active.model ?? "";
    }
    connect.disabled = busy || !encryptionAvailable;
    keyInput.disabled = busy || !encryptionAvailable;
    modelInput.disabled = busy;
    replace.disabled = busy;
    clear.disabled = busy;
    if (!encryptionAvailable) {
      status.textContent = copy.encryption;
      status.dataset.state = "error";
    } else if (visibleFailure !== null) {
      status.textContent =
        visibleFailure.kind === "provider"
          ? aiProviderSettingsErrorMessage(visibleFailure.error, locale())
          : visibleFailure.kind === "credential"
            ? copy.invalidCredential
            : copy.connectionFailed;
      status.dataset.state = "error";
    } else if (current?.state === "reconnect-required" && !busy) {
      status.textContent = copy.reconnect;
      status.dataset.state = "warning";
    } else if (!usable && !busy) {
      status.textContent = copy.disconnected;
      status.dataset.state = "idle";
    }
  };

  const setModels = (next: readonly AiProviderModel[]): void => {
    models = Object.freeze([...next]);
    renderModels();
  };

  const connectProvider = async (providerId: AiProviderId, apiKey: string): Promise<void> => {
    if (busy || !encryptionAvailable) return;
    busy = true;
    visibleFailure = null;
    candidates.hidden = true;
    pendingCredential = "";
    pendingCandidates = Object.freeze([]);
    keyInput.value = "";
    status.textContent = COPY[locale()].connecting;
    status.dataset.state = "working";
    render();
    try {
      const result = await api.connectAiProvider({
        expectedRevision: current?.revision ?? null,
        providerId,
        apiKey,
      });
      if (destroyed) return;
      if (result.status === "failed") {
        visibleFailure = Object.freeze({ kind: "provider", error: result.error });
        return;
      }
      current = result.config;
      visibleFailure = null;
      replacing = false;
      setModels(result.models);
      status.textContent = `${providerDisplayLabel(providerId, locale())} · ${COPY[locale()].connected}`;
      status.dataset.state = "ready";
      dispatchAiProviderConfigChange(ownerDocument);
    } catch {
      if (!destroyed) {
        visibleFailure = Object.freeze({ kind: "connection" });
      }
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  const showCandidates = (providerIds: readonly AiProviderId[], apiKey: string): void => {
    pendingCredential = apiKey;
    pendingCandidates = Object.freeze([...providerIds]);
    renderCandidates();
    candidates.hidden = false;
  };

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (busy) return;
    const parsed = parseAiCredentialInput(keyInput.value);
    keyInput.value = "";
    if (parsed.status === "invalid") {
      visibleFailure = Object.freeze({ kind: "credential" });
      render();
      return;
    }
    if (parsed.status === "ambiguous") {
      showCandidates(parsed.candidates, parsed.apiKey);
      return;
    }
    void connectProvider(parsed.providerId, parsed.apiKey);
  };

  const onCandidateClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || pendingCredential.length === 0) return;
    const providerId = target.dataset.providerId as AiProviderId | undefined;
    if (providerId === undefined) return;
    const credential = pendingCredential;
    pendingCredential = "";
    void connectProvider(providerId, credential);
  };

  const onReplace = (): void => {
    replacing = true;
    candidates.hidden = true;
    pendingCredential = "";
    pendingCandidates = Object.freeze([]);
    render();
    keyInput.focus();
  };

  const onClear = async (): Promise<void> => {
    if (busy || current === null) return;
    busy = true;
    visibleFailure = null;
    render();
    try {
      const result = await api.disconnectAiProvider({ expectedRevision: current.revision });
      if (destroyed) return;
      if (result.status === "failed") {
        visibleFailure = Object.freeze({ kind: "provider", error: result.error });
        return;
      }
      current = null;
      visibleFailure = null;
      replacing = false;
      setModels(Object.freeze([]));
      status.textContent = COPY[locale()].disconnected;
      status.dataset.state = "idle";
      dispatchAiProviderConfigChange(ownerDocument);
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  const onModelChange = async (): Promise<void> => {
    if (busy || current === null || modelInput.value === current.model) return;
    const selected = models.find((model) => model.id === modelInput.value);
    if (selected === undefined) return;
    busy = true;
    visibleFailure = null;
    status.textContent = COPY[locale()].modelLoading;
    status.dataset.state = "working";
    render();
    try {
      const result = await api.selectAiProviderModel({
        expectedRevision: current.revision,
        model: selected.id,
      });
      if (destroyed) return;
      if (result.status === "failed") {
        visibleFailure = Object.freeze({ kind: "provider", error: result.error });
        return;
      }
      current = result.config;
      visibleFailure = null;
      status.textContent = COPY[locale()].modelSelected;
      status.dataset.state = "ready";
      dispatchAiProviderConfigChange(ownerDocument);
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  const refresh = async (): Promise<void> => {
    busy = true;
    visibleFailure = null;
    render();
    try {
      const result = await api.getAiProviderConfig();
      if (destroyed) return;
      if (result.status === "failed") {
        visibleFailure = Object.freeze({ kind: "provider", error: result.error });
        return;
      }
      encryptionAvailable = result.encryptionAvailable;
      current = result.status === "ready" ? result.config : null;
      if (current?.state === "connected" && current.providerId !== null) {
        status.textContent = COPY[locale()].modelLoading;
        const catalog = await api.listAiProviderModels({ expectedRevision: current.revision });
        if (destroyed) return;
        if (catalog.status === "ready") setModels(catalog.models);
        else {
          visibleFailure = Object.freeze({ kind: "provider", error: catalog.error });
        }
      }
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  const onPermissionChange = (): void => {
    const next = permissionSelect.value as AiEditPermission;
    editPermission = next;
    writeAiEditPermission(next, ownerDocument);
    render();
  };

  connectForm.addEventListener("submit", onSubmit);
  candidates.addEventListener("click", onCandidateClick);
  replace.addEventListener("click", onReplace);
  clear.addEventListener("click", () => void onClear());
  modelInput.addEventListener("change", () => void onModelChange());
  permissionSelect.addEventListener("change", onPermissionChange);
  const localeObserver = new MutationObserver(render);
  localeObserver.observe(ownerDocument.documentElement, {
    attributes: true,
    attributeFilter: ["data-locale"],
  });
  render();
  void refresh();

  return Object.freeze({
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      pendingCredential = "";
      pendingCandidates = Object.freeze([]);
      keyInput.value = "";
      localeObserver.disconnect();
      connectForm.removeEventListener("submit", onSubmit);
      candidates.removeEventListener("click", onCandidateClick);
      replace.removeEventListener("click", onReplace);
      permissionSelect.removeEventListener("change", onPermissionChange);
      root.remove();
    },
  });
}

function permissionOption(ownerDocument: Document, value: AiEditPermission): HTMLOptionElement {
  const option = ownerDocument.createElement("option");
  option.value = value;
  return option;
}

function textButton(
  ownerDocument: Document,
  label: string,
  type: "button" | "submit",
): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.className = "ai-provider-settings__text-button";
  button.type = type;
  button.textContent = label;
  return button;
}

export function aiProviderSettingsErrorMessage(
  error: AiProviderError,
  locale: "zh-CN" | "en",
): string {
  if (locale !== "en") return error.message;
  const messages: Record<AiProviderError["code"], string> = {
    AI_PROVIDER_INVALID_REQUEST: "The AI provider request is invalid.",
    AI_PROVIDER_CONFLICT: "AI settings changed. Reload and try again.",
    AI_PROVIDER_ENCRYPTION_UNAVAILABLE: "Secure credential storage is unavailable.",
    AI_PROVIDER_CONTEXT_CLOSED: "The settings context was closed.",
    AI_PROVIDER_CORRUPT_STORE: "AI settings could not be read safely.",
    AI_PROVIDER_NOT_REGULAR_FILE: "The AI settings file is invalid.",
    AI_PROVIDER_TOO_LARGE: "AI settings exceed the safety limit.",
    AI_PROVIDER_READ_FAILED: "AI settings could not be read.",
    AI_PROVIDER_WRITE_FAILED: "AI settings could not be saved.",
    AI_PROVIDER_NOT_CONNECTED: "Connect an AI provider first.",
    AI_PROVIDER_CREDENTIAL_REJECTED: "The provider rejected the API key.",
    AI_PROVIDER_NETWORK_FAILED: "The official provider service could not be reached.",
    AI_PROVIDER_TIMEOUT: "The provider request timed out.",
    AI_PROVIDER_RESPONSE_TOO_LARGE: "The provider response exceeds the safety limit.",
    AI_PROVIDER_INVALID_RESPONSE: "The provider returned an invalid response.",
    AI_PROVIDER_MODEL_UNAVAILABLE: "The selected model is unavailable.",
    AI_PROVIDER_BUSY: "Another provider request is already running.",
    AI_PROVIDER_SESSION_NOT_FOUND: "The provider session is no longer available.",
    AI_PROVIDER_SOURCE_STALE: "The source changed, so the old request was discarded.",
  };
  return messages[error.code];
}

export function providerDisplayLabel(providerId: AiProviderId, locale: "zh-CN" | "en"): string {
  if (locale !== "en") return AI_PROVIDER_LABELS[providerId];
  if (providerId === "glm") return "GLM";
  if (providerId === "kimi-cn") return "Kimi (China)";
  if (providerId === "kimi-global") return "Kimi (Global)";
  return AI_PROVIDER_LABELS[providerId];
}
