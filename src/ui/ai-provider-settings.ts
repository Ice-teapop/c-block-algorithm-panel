import type { PanelApi } from "../shared/api.js";
import {
  AI_PROVIDER_LABELS,
  parseAiCredentialInput,
  type AiProviderId,
  type AiProviderModel,
  type AiProviderPublicConfig,
} from "../shared/ai-provider.js";

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
    boundary: "密钥只会发往你最终选择的官方域名，并由系统加密存储。",
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
  }),
  en: Object.freeze({
    boundary: "The key is sent only to the official provider you select and stored with OS encryption.",
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
  }),
});

export function createAiProviderSettings(
  host: HTMLElement,
  api: AiSettingsApi,
): AiProviderSettings {
  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "ai-provider-settings";

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
  root.append(boundary, connectForm, candidates, connected, status);
  host.replaceChildren(root);

  let current: AiProviderPublicConfig | null = null;
  let models: readonly AiProviderModel[] = Object.freeze([]);
  let pendingCredential = "";
  let encryptionAvailable = false;
  let busy = false;
  let replacing = false;
  let destroyed = false;

  const locale = (): keyof typeof COPY =>
    ownerDocument.documentElement.dataset.locale === "en" ? "en" : "zh-CN";

  const renderModels = (): void => {
    modelList.replaceChildren(
      ...models.map((model) => {
        const option = ownerDocument.createElement("option");
        option.value = model.id;
        option.label = model.label;
        return option;
      }),
    );
  };

  const render = (): void => {
    const copy = COPY[locale()];
    boundary.textContent = copy.boundary;
    keyLabelText.textContent = copy.keyLabel;
    keyInput.placeholder = copy.keyPlaceholder;
    connect.textContent = copy.connect;
    modelLabelText.textContent = copy.model;
    replace.textContent = copy.replace;
    clear.textContent = copy.clear;
    const active = current;
    const usable =
      active?.state === "connected" &&
      active.providerId !== null &&
      active.hasCredential &&
      active.credentialUsable;
    connectForm.hidden = usable && !replacing;
    connected.hidden = !usable;
    if (usable && active !== null && active.providerId !== null) {
      identity.textContent = `${AI_PROVIDER_LABELS[active.providerId]} · ${copy.connected}`;
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
    } else if (current?.state === "reconnect-required" && !busy) {
      status.textContent = copy.reconnect;
      status.dataset.state = "warning";
    } else if (current === null && !busy) {
      status.textContent = copy.disconnected;
      status.dataset.state = "ready";
    }
  };

  const setModels = (next: readonly AiProviderModel[]): void => {
    models = Object.freeze([...next]);
    renderModels();
  };

  const connectProvider = async (providerId: AiProviderId, apiKey: string): Promise<void> => {
    if (busy || !encryptionAvailable) return;
    busy = true;
    candidates.hidden = true;
    pendingCredential = "";
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
        status.textContent = result.error.message;
        status.dataset.state = "error";
        return;
      }
      current = result.config;
      replacing = false;
      setModels(result.models);
      status.textContent = `${AI_PROVIDER_LABELS[providerId]} · ${COPY[locale()].connected}`;
      status.dataset.state = "ready";
    } catch {
      if (!destroyed) {
        status.textContent = "无法完成 AI 厂商连接。";
        status.dataset.state = "error";
      }
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  const showCandidates = (providerIds: readonly AiProviderId[], apiKey: string): void => {
    pendingCredential = apiKey;
    const lead = ownerDocument.createElement("span");
    lead.textContent = COPY[locale()].choose;
    const buttons = providerIds.map((providerId) => {
      const button = textButton(ownerDocument, AI_PROVIDER_LABELS[providerId], "button");
      button.dataset.providerId = providerId;
      return button;
    });
    candidates.replaceChildren(lead, ...buttons);
    candidates.hidden = false;
  };

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (busy) return;
    const parsed = parseAiCredentialInput(keyInput.value);
    keyInput.value = "";
    if (parsed.status === "invalid") {
      status.textContent = parsed.message;
      status.dataset.state = "error";
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
    render();
    keyInput.focus();
  };

  const onClear = async (): Promise<void> => {
    if (busy || current === null) return;
    busy = true;
    render();
    try {
      const result = await api.disconnectAiProvider({ expectedRevision: current.revision });
      if (destroyed) return;
      if (result.status === "failed") {
        status.textContent = result.error.message;
        status.dataset.state = "error";
        return;
      }
      current = null;
      replacing = false;
      setModels(Object.freeze([]));
      status.textContent = COPY[locale()].disconnected;
      status.dataset.state = "ready";
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
        status.textContent = result.error.message;
        status.dataset.state = "error";
        return;
      }
      current = result.config;
      status.textContent = COPY[locale()].modelSelected;
      status.dataset.state = "ready";
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  const refresh = async (): Promise<void> => {
    busy = true;
    render();
    try {
      const result = await api.getAiProviderConfig();
      if (destroyed) return;
      if (result.status === "failed") {
        status.textContent = result.error.message;
        status.dataset.state = "error";
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
          status.textContent = catalog.error.message;
          status.dataset.state = "error";
        }
      }
    } finally {
      busy = false;
      if (!destroyed) render();
    }
  };

  connectForm.addEventListener("submit", onSubmit);
  candidates.addEventListener("click", onCandidateClick);
  replace.addEventListener("click", onReplace);
  clear.addEventListener("click", () => void onClear());
  modelInput.addEventListener("change", () => void onModelChange());
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
      keyInput.value = "";
      localeObserver.disconnect();
      connectForm.removeEventListener("submit", onSubmit);
      candidates.removeEventListener("click", onCandidateClick);
      replace.removeEventListener("click", onReplace);
      root.remove();
    },
  });
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
