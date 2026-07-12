import {
  aiProviderFailure,
  type AiMentorEvidenceContext,
  type AiProviderFailure,
  type AiProviderId,
  type AiProviderModel,
  type AiProviderModelsResult,
} from "../../src/shared/ai-provider.js";
import {
  assertRegisteredAiProviderUrl,
  getAiProviderRegistration,
  type RegisteredAiProvider,
} from "./ai-provider-registry.js";

const MODEL_TIMEOUT_MS = 10_000;
const MENTOR_TIMEOUT_MS = 90_000;
const MODEL_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const MENTOR_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;
const MAX_MODELS = 4_096;
const MAX_ANSWER_LENGTH = 2 * 1024 * 1024;

export interface AiProviderNetworkRequest {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
  readonly signal?: AbortSignal | undefined;
}

export interface AiProviderNetworkResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: Uint8Array;
}

export interface AiProviderNetworkAdapter {
  request(request: AiProviderNetworkRequest): Promise<AiProviderNetworkResponse>;
}

export interface AiProviderClient {
  listModels(providerId: AiProviderId, credential: string): Promise<AiProviderModelsResult>;
  requestMentor(
    providerId: AiProviderId,
    credential: string,
    model: string,
    prompt: string,
    context: AiMentorEvidenceContext,
    signal: AbortSignal,
  ): Promise<{ readonly status: "completed"; readonly text: string } | AiProviderFailure>;
}

export function createAiProviderClient(
  network: AiProviderNetworkAdapter = createFetchAiProviderNetworkAdapter(),
): AiProviderClient {
  return Object.freeze({
    async listModels(
      providerId: AiProviderId,
      credential: string,
    ): Promise<AiProviderModelsResult> {
      const registration = getAiProviderRegistration(providerId);
      if (registration.modelListUrl === null) {
        return Object.freeze({
          status: "ready",
          providerId,
          models: registration.staticModels,
        });
      }
      try {
        if (registration.validationUrl !== null) {
          const validation = await network.request({
            url: assertRegisteredAiProviderUrl(providerId, registration.validationUrl).href,
            method: "GET",
            headers: providerHeaders(providerId, credential, false),
            body: null,
            timeoutMs: MODEL_TIMEOUT_MS,
            maxResponseBytes: MODEL_RESPONSE_MAX_BYTES,
          });
          const validationFailure = responseFailure(validation);
          if (validationFailure !== null) return validationFailure;
          parseJsonObject(validation);
        }
        const response = await network.request({
          url: assertRegisteredAiProviderUrl(providerId, registration.modelListUrl).href,
          method: "GET",
          headers: providerHeaders(providerId, credential, false),
          body: null,
          timeoutMs: MODEL_TIMEOUT_MS,
          maxResponseBytes: MODEL_RESPONSE_MAX_BYTES,
        });
        const failure = responseFailure(response);
        if (failure !== null) return failure;
        const parsed = parseJsonObject(response);
        const models = parseModels(providerId, parsed);
        if (models.length === 0) {
          return aiProviderFailure(
            "AI_PROVIDER_INVALID_RESPONSE",
            "官方模型目录未返回可用于对话的模型。",
          );
        }
        return Object.freeze({ status: "ready", providerId, models });
      } catch (error: unknown) {
        return networkFailure(error);
      }
    },

    async requestMentor(
      providerId: AiProviderId,
      credential: string,
      model: string,
      prompt: string,
      context: AiMentorEvidenceContext,
      signal: AbortSignal,
    ): Promise<{ readonly status: "completed"; readonly text: string } | AiProviderFailure> {
      const registration = getAiProviderRegistration(providerId);
      try {
        const url = assertRegisteredAiProviderUrl(providerId, registration.mentorUrl(model));
        const response = await network.request({
          url: url.href,
          method: "POST",
          headers: providerHeaders(providerId, credential, true),
          body: mentorBody(registration, model, prompt, context),
          timeoutMs: MENTOR_TIMEOUT_MS,
          maxResponseBytes: MENTOR_RESPONSE_MAX_BYTES,
          signal,
        });
        const failure = responseFailure(response);
        if (failure !== null) return failure;
        const parsed = parseJsonObject(response);
        const text = parseMentorText(registration, parsed);
        if (text.length === 0 || text.length > MAX_ANSWER_LENGTH) {
          return aiProviderFailure("AI_PROVIDER_INVALID_RESPONSE", "AI 返回了无效或过长的回答。");
        }
        return Object.freeze({ status: "completed", text });
      } catch (error: unknown) {
        return networkFailure(error);
      }
    },
  });
}

export function createFetchAiProviderNetworkAdapter(): AiProviderNetworkAdapter {
  return Object.freeze({
    async request(request: AiProviderNetworkRequest): Promise<AiProviderNetworkResponse> {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort("timeout"), request.timeoutMs);
      const combined = combineSignals(timeout.signal, request.signal);
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          ...(request.body === null ? {} : { body: request.body }),
          redirect: "error",
          signal: combined.signal,
        });
        const lengthHeader = response.headers.get("content-length");
        if (
          lengthHeader !== null &&
          /^\d+$/u.test(lengthHeader) &&
          Number(lengthHeader) > request.maxResponseBytes
        ) {
          throw networkError("too-large");
        }
        const body = await readCappedBody(response.body, request.maxResponseBytes);
        return Object.freeze({
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          body,
        });
      } catch (error: unknown) {
        if (timeout.signal.aborted) throw networkError("timeout");
        if (request.signal?.aborted === true) throw networkError("cancelled");
        throw error;
      } finally {
        clearTimeout(timer);
        combined.dispose();
      }
    },
  });
}

async function readCappedBody(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<Uint8Array> {
  if (stream === null) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw networkError("too-large");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function providerHeaders(
  providerId: AiProviderId,
  credential: string,
  jsonBody: boolean,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (jsonBody) headers["Content-Type"] = "application/json";
  if (providerId === "anthropic") {
    headers["x-api-key"] = credential;
    headers["anthropic-version"] = "2023-06-01";
  } else if (providerId === "gemini") {
    headers["x-goog-api-key"] = credential;
  } else {
    headers.Authorization = `Bearer ${credential}`;
  }
  return Object.freeze(headers);
}

function mentorBody(
  registration: RegisteredAiProvider,
  model: string,
  prompt: string,
  context: AiMentorEvidenceContext,
): string {
  const system =
    "你是 C 算法学习工作台的只读导师。只依据给定代码与证据回答；区分事实、推断和建议；不得声称已修改源码；不要索取 API 密钥、路径、stdin 或个人信息。";
  const user = `${prompt}\n\n工作台证据（可能为空）：\n${JSON.stringify(context)}`;
  if (registration.protocol === "anthropic-messages") {
    return JSON.stringify({
      model,
      max_tokens: 2_048,
      system,
      messages: [{ role: "user", content: user }],
    });
  }
  if (registration.protocol === "gemini-content") {
    return JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 2_048 },
    });
  }
  return JSON.stringify({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    stream: false,
  });
}

function parseModels(providerId: AiProviderId, value: Record<string, unknown>): readonly AiProviderModel[] {
  const source = providerId === "gemini" ? value.models : value.data;
  if (!Array.isArray(source) || source.length > MAX_MODELS * 2) throw invalidResponseError();
  const models = new Map<string, AiProviderModel>();
  for (const raw of source) {
    if (!isRecord(raw)) continue;
    const id = providerId === "gemini" ? raw.name : raw.id;
    if (typeof id !== "string" || id.length < 1 || id.length > 256) continue;
    if (providerId === "gemini") {
      const actions = raw.supportedGenerationMethods ?? raw.supportedActions;
      if (Array.isArray(actions) && !actions.includes("generateContent")) continue;
    }
    const label =
      typeof raw.displayName === "string" && raw.displayName.length <= 256 ? raw.displayName : id;
    models.set(id, Object.freeze({ id, label }));
    if (models.size >= MAX_MODELS) break;
  }
  return Object.freeze([...models.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

function parseMentorText(
  registration: RegisteredAiProvider,
  value: Record<string, unknown>,
): string {
  if (registration.protocol === "anthropic-messages") {
    if (!Array.isArray(value.content)) throw invalidResponseError();
    return value.content
      .filter((item): item is Record<string, unknown> => isRecord(item) && item.type === "text")
      .map((item) => (typeof item.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }
  if (registration.protocol === "gemini-content") {
    const candidates = value.candidates;
    if (!Array.isArray(candidates) || !isRecord(candidates[0])) throw invalidResponseError();
    const content = candidates[0].content;
    if (!isRecord(content) || !Array.isArray(content.parts)) throw invalidResponseError();
    return content.parts
      .filter(isRecord)
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }
  const choices = value.choices;
  if (!Array.isArray(choices) || !isRecord(choices[0]) || !isRecord(choices[0].message)) {
    throw invalidResponseError();
  }
  const content = choices[0].message.content;
  if (typeof content !== "string") throw invalidResponseError();
  return content.trim();
}

function parseJsonObject(response: AiProviderNetworkResponse): Record<string, unknown> {
  if (!/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/iu.test(response.contentType)) {
    throw invalidResponseError();
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(response.body);
  } catch {
    throw invalidResponseError();
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw invalidResponseError();
  }
  if (!isRecord(value)) throw invalidResponseError();
  return value;
}

function responseFailure(response: AiProviderNetworkResponse): AiProviderFailure | null {
  if (response.status >= 200 && response.status < 300) return null;
  if (response.status === 401 || response.status === 403) {
    return aiProviderFailure(
      "AI_PROVIDER_CREDENTIAL_REJECTED",
      "官方服务拒绝了这个 API 密钥，请检查密钥与区域。",
    );
  }
  if (response.status === 404) {
    return aiProviderFailure(
      "AI_PROVIDER_MODEL_UNAVAILABLE",
      "所选模型或官方接口当前不可用。",
    );
  }
  return aiProviderFailure(
    "AI_PROVIDER_NETWORK_FAILED",
    `官方服务返回 HTTP ${String(response.status)}。`,
  );
}

function networkFailure(error: unknown): AiProviderFailure {
  const reason = errorReason(error);
  if (reason === "timeout") {
    return aiProviderFailure("AI_PROVIDER_TIMEOUT", "AI 请求超时，未自动重试或切换厂商。");
  }
  if (reason === "too-large") {
    return aiProviderFailure("AI_PROVIDER_RESPONSE_TOO_LARGE", "AI 响应超过本地安全上限。");
  }
  if (reason === "invalid-response") {
    return aiProviderFailure("AI_PROVIDER_INVALID_RESPONSE", "AI 返回了无法安全解析的响应。");
  }
  if (reason === "cancelled") {
    return aiProviderFailure("AI_PROVIDER_SOURCE_STALE", "请求已取消，结果不会用于当前源码。");
  }
  return aiProviderFailure("AI_PROVIDER_NETWORK_FAILED", "无法连接所选厂商的官方服务。");
}

function invalidResponseError(): Error {
  return networkError("invalid-response");
}

function networkError(reason: "timeout" | "too-large" | "invalid-response" | "cancelled"): Error {
  return Object.assign(new Error("ai-provider-network-failure"), { reason });
}

function errorReason(error: unknown): unknown {
  return error instanceof Error && "reason" in error
    ? (error as { readonly reason?: unknown }).reason
    : undefined;
}

function combineSignals(
  primary: AbortSignal,
  secondary: AbortSignal | undefined,
): { readonly signal: AbortSignal; dispose(): void } {
  if (secondary === undefined) return { signal: primary, dispose() {} };
  const controller = new AbortController();
  const abortPrimary = () => controller.abort(primary.reason);
  const abortSecondary = () => controller.abort(secondary.reason);
  if (primary.aborted) abortPrimary();
  else primary.addEventListener("abort", abortPrimary, { once: true });
  if (secondary.aborted) abortSecondary();
  else secondary.addEventListener("abort", abortSecondary, { once: true });
  return {
    signal: controller.signal,
    dispose(): void {
      primary.removeEventListener("abort", abortPrimary);
      secondary.removeEventListener("abort", abortSecondary);
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
