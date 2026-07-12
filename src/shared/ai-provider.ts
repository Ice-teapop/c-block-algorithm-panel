export const AI_PROVIDER_CONFIG_SCHEMA_VERSION = 2 as const;
export const AI_PROVIDER_CONFIG_MAX_BYTES = 64 * 1024;
export const AI_PROVIDER_API_KEY_MAX_LENGTH = 16 * 1024;
export const AI_PROVIDER_MODEL_MAX_LENGTH = 256;
export const AI_MENTOR_PROMPT_MAX_LENGTH = 8 * 1024;
export const AI_MENTOR_CONTEXT_MAX_LENGTH = 768 * 1024;

export const AI_PROVIDER_IDS = Object.freeze([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
  "deepseek",
  "glm",
  "kimi-cn",
  "kimi-global",
] as const);

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];
export type KimiRegion = "cn" | "global";
export type AiMentorContextMode = "current-function" | "full-source";

export const AI_PROVIDER_IPC_CHANNELS = Object.freeze({
  getConfig: "ai-provider:get-config",
  connect: "ai-provider:connect",
  listModels: "ai-provider:list-models",
  selectModel: "ai-provider:select-model",
  disconnect: "ai-provider:disconnect",
  startMentor: "ai-provider:mentor-start",
  readMentor: "ai-provider:mentor-read",
  cancelMentor: "ai-provider:mentor-cancel",
});

export const AI_PROVIDER_LABELS: Readonly<Record<AiProviderId, string>> = Object.freeze({
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  glm: "智谱 GLM",
  "kimi-cn": "Kimi 中国区",
  "kimi-global": "Kimi 国际区",
});

export interface AiProviderPublicConfig {
  readonly schemaVersion: typeof AI_PROVIDER_CONFIG_SCHEMA_VERSION;
  readonly revision: number;
  readonly providerId: AiProviderId | null;
  readonly region: KimiRegion | null;
  readonly model: string | null;
  readonly state: "connected" | "reconnect-required";
  readonly hasCredential: boolean;
  /** False when ciphertext exists but OS-backed encryption is unavailable or migration is unsafe. */
  readonly credentialUsable: boolean;
  readonly credentialUpdatedAtMs: number | null;
}

export interface ConnectAiProviderRequest {
  readonly expectedRevision: number | null;
  readonly providerId: AiProviderId;
  readonly apiKey: string;
}

export interface ListAiProviderModelsRequest {
  readonly expectedRevision: number;
}

export interface SelectAiProviderModelRequest {
  readonly expectedRevision: number;
  readonly model: string;
}

export interface DisconnectAiProviderRequest {
  readonly expectedRevision: number;
}

export interface AiProviderModel {
  readonly id: string;
  readonly label: string;
}

export interface AiMentorEvidenceContext {
  /** Exact current function only. Empty when static analysis has no complete function. */
  readonly currentFunction: string;
  readonly diagnosticSummary: readonly string[];
  readonly controlFlowSummary: string;
  readonly runEvidence: readonly string[];
  /** Present only after the user explicitly selects full-source context. */
  readonly fullSource?: string | undefined;
}

export interface StartAiMentorRequest {
  readonly sourceFingerprint: string;
  readonly sourceRevision: number;
  readonly providerRevision: number;
  readonly contextMode: AiMentorContextMode;
  readonly prompt: string;
  readonly context: AiMentorEvidenceContext;
}

export interface ReadAiMentorRequest {
  readonly sessionId: string;
  readonly afterSequence: number;
}

export interface CancelAiMentorRequest {
  readonly sessionId: string;
}

export interface AiMentorEvent {
  readonly sequence: number;
  readonly kind: "answer" | "notice";
  readonly text: string;
}

export type AiProviderErrorCode =
  | "AI_PROVIDER_INVALID_REQUEST"
  | "AI_PROVIDER_CONFLICT"
  | "AI_PROVIDER_ENCRYPTION_UNAVAILABLE"
  | "AI_PROVIDER_CONTEXT_CLOSED"
  | "AI_PROVIDER_CORRUPT_STORE"
  | "AI_PROVIDER_NOT_REGULAR_FILE"
  | "AI_PROVIDER_TOO_LARGE"
  | "AI_PROVIDER_READ_FAILED"
  | "AI_PROVIDER_WRITE_FAILED"
  | "AI_PROVIDER_NOT_CONNECTED"
  | "AI_PROVIDER_CREDENTIAL_REJECTED"
  | "AI_PROVIDER_NETWORK_FAILED"
  | "AI_PROVIDER_TIMEOUT"
  | "AI_PROVIDER_RESPONSE_TOO_LARGE"
  | "AI_PROVIDER_INVALID_RESPONSE"
  | "AI_PROVIDER_MODEL_UNAVAILABLE"
  | "AI_PROVIDER_BUSY"
  | "AI_PROVIDER_SESSION_NOT_FOUND"
  | "AI_PROVIDER_SOURCE_STALE";

export interface AiProviderError {
  readonly code: AiProviderErrorCode;
  readonly message: string;
}

export interface AiProviderFailure {
  readonly status: "failed";
  readonly error: AiProviderError;
}

export type AiProviderReadResult =
  | { readonly status: "missing"; readonly encryptionAvailable: boolean }
  | {
      readonly status: "ready";
      readonly encryptionAvailable: boolean;
      readonly config: AiProviderPublicConfig;
    }
  | AiProviderFailure;

export type AiProviderConnectResult =
  | {
      readonly status: "connected";
      readonly config: AiProviderPublicConfig;
      readonly models: readonly AiProviderModel[];
    }
  | AiProviderFailure;

export type AiProviderModelsResult =
  | {
      readonly status: "ready";
      readonly providerId: AiProviderId;
      readonly models: readonly AiProviderModel[];
    }
  | AiProviderFailure;

export type AiProviderModelSelectResult =
  { readonly status: "selected"; readonly config: AiProviderPublicConfig } | AiProviderFailure;

export type AiProviderDisconnectResult =
  { readonly status: "missing" } | { readonly status: "disconnected" } | AiProviderFailure;

export type AiMentorStartResult =
  | {
      readonly status: "started";
      readonly sessionId: string;
      readonly sourceFingerprint: string;
    }
  | AiProviderFailure;

export type AiMentorReadResult =
  | {
      readonly status: "running" | "completed" | "cancelled";
      readonly sessionId: string;
      readonly sourceFingerprint: string;
      readonly events: readonly AiMentorEvent[];
      readonly nextSequence: number;
    }
  | AiProviderFailure;

export type AiMentorCancelResult =
  | { readonly status: "cancelled" | "already-terminal"; readonly sessionId: string }
  | AiProviderFailure;

export type AiCredentialParseResult =
  | {
      readonly status: "identified";
      readonly providerId: AiProviderId;
      readonly apiKey: string;
    }
  | {
      readonly status: "ambiguous";
      readonly candidates: readonly AiProviderId[];
      readonly apiKey: string;
    }
  | { readonly status: "invalid"; readonly message: string };

export function aiProviderFailure(code: AiProviderErrorCode, message: string): AiProviderFailure {
  return Object.freeze({
    status: "failed",
    error: Object.freeze({ code, message }),
  });
}

export function providerRegion(providerId: AiProviderId): KimiRegion | null {
  return providerId === "kimi-cn" ? "cn" : providerId === "kimi-global" ? "global" : null;
}

export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === "string" && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

export function parseAiCredentialInput(value: string): AiCredentialParseResult {
  if (typeof value !== "string") return invalidCredential("请输入 API 密钥。");
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > AI_PROVIDER_API_KEY_MAX_LENGTH) {
    return invalidCredential("API 密钥为空或过长。");
  }

  const assignment = /^([A-Z][A-Z0-9_]*)\s*=\s*(?:["']([^"']+)["']|([^\s]+))$/u.exec(trimmed);
  const name = assignment?.[1] ?? null;
  const apiKey = assignment === null ? trimmed : (assignment[2] ?? assignment[3] ?? "");
  if (!validApiKey(apiKey)) return invalidCredential("API 密钥包含不可接受的字符。");

  const assignments: Readonly<Record<string, AiProviderId | readonly AiProviderId[]>> =
    Object.freeze({
      OPENAI_API_KEY: "openai",
      ANTHROPIC_API_KEY: "anthropic",
      GEMINI_API_KEY: "gemini",
      GOOGLE_API_KEY: "gemini",
      OPENROUTER_API_KEY: "openrouter",
      DEEPSEEK_API_KEY: "deepseek",
      ZAI_API_KEY: "glm",
      ZHIPUAI_API_KEY: "glm",
      MOONSHOT_API_KEY: Object.freeze(["kimi-cn", "kimi-global"] as const),
    });
  if (name !== null) {
    const match = assignments[name];
    if (match === undefined) return invalidCredential("无法识别这个环境变量名称。");
    return Array.isArray(match)
      ? ambiguousCredential(match, apiKey)
      : identifiedCredential(match as AiProviderId, apiKey);
  }
  if (apiKey.startsWith("sk-ant-")) return identifiedCredential("anthropic", apiKey);
  if (apiKey.startsWith("sk-or-")) return identifiedCredential("openrouter", apiKey);
  return ambiguousCredential(AI_PROVIDER_IDS, apiKey);
}

export function validateConnectAiProviderRequest(value: unknown): ConnectAiProviderRequest | null {
  if (!isExactObject(value, ["expectedRevision", "providerId", "apiKey"])) return null;
  const input = value as Record<string, unknown>;
  if (
    !validExpectedRevision(input.expectedRevision) ||
    !isAiProviderId(input.providerId) ||
    !validApiKey(input.apiKey)
  ) {
    return null;
  }
  return Object.freeze({
    expectedRevision: input.expectedRevision as number | null,
    providerId: input.providerId,
    apiKey: input.apiKey as string,
  });
}

export function validateListAiProviderModelsRequest(
  value: unknown,
): ListAiProviderModelsRequest | null {
  if (!isExactObject(value, ["expectedRevision"])) return null;
  const revision = (value as Record<string, unknown>).expectedRevision;
  return validRevision(revision) ? Object.freeze({ expectedRevision: revision }) : null;
}

export function validateSelectAiProviderModelRequest(
  value: unknown,
): SelectAiProviderModelRequest | null {
  if (!isExactObject(value, ["expectedRevision", "model"])) return null;
  const input = value as Record<string, unknown>;
  return validRevision(input.expectedRevision) && validModel(input.model)
    ? Object.freeze({ expectedRevision: input.expectedRevision, model: input.model })
    : null;
}

export function validateDisconnectAiProviderRequest(
  value: unknown,
): DisconnectAiProviderRequest | null {
  if (!isExactObject(value, ["expectedRevision"])) return null;
  const revision = (value as Record<string, unknown>).expectedRevision;
  return validRevision(revision) ? Object.freeze({ expectedRevision: revision }) : null;
}

export function validateStartAiMentorRequest(value: unknown): StartAiMentorRequest | null {
  if (
    !isExactObject(value, [
      "sourceFingerprint",
      "sourceRevision",
      "providerRevision",
      "contextMode",
      "prompt",
      "context",
    ])
  ) {
    return null;
  }
  const input = value as Record<string, unknown>;
  const context = validateMentorContext(input.context, input.contextMode);
  if (
    !validFingerprint(input.sourceFingerprint) ||
    !validRevision(input.sourceRevision) ||
    !validRevision(input.providerRevision) ||
    (input.contextMode !== "current-function" && input.contextMode !== "full-source") ||
    !validBoundedText(input.prompt, 1, AI_MENTOR_PROMPT_MAX_LENGTH) ||
    context === null
  ) {
    return null;
  }
  return Object.freeze({
    sourceFingerprint: input.sourceFingerprint,
    sourceRevision: input.sourceRevision,
    providerRevision: input.providerRevision,
    contextMode: input.contextMode,
    prompt: input.prompt,
    context,
  }) as StartAiMentorRequest;
}

export function validateReadAiMentorRequest(value: unknown): ReadAiMentorRequest | null {
  if (!isExactObject(value, ["sessionId", "afterSequence"])) return null;
  const input = value as Record<string, unknown>;
  return validSessionId(input.sessionId) && validRevision(input.afterSequence)
    ? Object.freeze({ sessionId: input.sessionId, afterSequence: input.afterSequence })
    : null;
}

export function validateCancelAiMentorRequest(value: unknown): CancelAiMentorRequest | null {
  if (!isExactObject(value, ["sessionId"])) return null;
  const sessionId = (value as Record<string, unknown>).sessionId;
  return validSessionId(sessionId) ? Object.freeze({ sessionId }) : null;
}

export function validAiProviderModel(value: unknown): value is string {
  return validModel(value);
}

function validateMentorContext(
  value: unknown,
  mode: unknown,
): Readonly<AiMentorEvidenceContext> | null {
  const expected =
    mode === "full-source"
      ? ["currentFunction", "diagnosticSummary", "controlFlowSummary", "runEvidence", "fullSource"]
      : ["currentFunction", "diagnosticSummary", "controlFlowSummary", "runEvidence"];
  if (!isExactObject(value, expected)) return null;
  const input = value as Record<string, unknown>;
  if (
    !validBoundedText(input.currentFunction, 0, AI_MENTOR_CONTEXT_MAX_LENGTH) ||
    !validStringList(input.diagnosticSummary, 128, 2_048) ||
    !validBoundedText(input.controlFlowSummary, 0, 16 * 1024) ||
    !validStringList(input.runEvidence, 128, 2_048)
  ) {
    return null;
  }
  if (
    mode === "full-source" &&
    !validBoundedText(input.fullSource, 1, AI_MENTOR_CONTEXT_MAX_LENGTH)
  ) {
    return null;
  }
  const total = JSON.stringify(value).length;
  if (total > AI_MENTOR_CONTEXT_MAX_LENGTH) return null;
  return Object.freeze({
    currentFunction: input.currentFunction as string,
    diagnosticSummary: Object.freeze([...(input.diagnosticSummary as string[])]),
    controlFlowSummary: input.controlFlowSummary as string,
    runEvidence: Object.freeze([...(input.runEvidence as string[])]),
    ...(mode === "full-source" ? { fullSource: input.fullSource as string } : {}),
  });
}

function validStringList(
  value: unknown,
  maxItems: number,
  maxItemLength: number,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => validBoundedText(item, 0, maxItemLength))
  );
}

function validModel(value: unknown): value is string {
  return (
    validBoundedText(value, 1, AI_PROVIDER_MODEL_MAX_LENGTH) && !containsControlCharacter(value)
  );
}

function validApiKey(value: unknown): value is string {
  return (
    validBoundedText(value, 1, AI_PROVIDER_API_KEY_MAX_LENGTH) &&
    value.trim() === value &&
    !containsControlCharacter(value)
  );
}

function validFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9:_-]{1,256}$/u.test(value);
}

function validSessionId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/u.test(value);
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validExpectedRevision(value: unknown): value is number | null {
  return value === null || validRevision(value);
}

function validBoundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function containsControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value);
}

function isExactObject(value: unknown, expectedKeys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function identifiedCredential(providerId: AiProviderId, apiKey: string): AiCredentialParseResult {
  return Object.freeze({ status: "identified", providerId, apiKey });
}

function ambiguousCredential(
  candidates: readonly AiProviderId[],
  apiKey: string,
): AiCredentialParseResult {
  return Object.freeze({ status: "ambiguous", candidates: Object.freeze([...candidates]), apiKey });
}

function invalidCredential(message: string): AiCredentialParseResult {
  return Object.freeze({ status: "invalid", message });
}
