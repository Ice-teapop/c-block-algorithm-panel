import type { AiProviderId, AiProviderModel } from "../../src/shared/ai-provider.js";

export type AiProviderProtocol = "openai-chat" | "anthropic-messages" | "gemini-content";
export const GLM_MODEL_CATALOG_VERSION = "2026-07-12" as const;

export interface RegisteredAiProvider {
  readonly id: AiProviderId;
  readonly origin: string;
  readonly modelListUrl: string | null;
  readonly validationUrl: string | null;
  readonly protocol: AiProviderProtocol;
  readonly staticModels: readonly AiProviderModel[];
  mentorUrl(model: string): string;
}

const GLM_MODELS = models([
  "glm-4.5",
  "glm-4.5-air",
  "glm-4.5-airx",
  "glm-4.5-flash",
  "glm-4-plus",
  "glm-4-air-250414",
  "glm-4-flash-250414",
]);

const registry: Readonly<Record<AiProviderId, RegisteredAiProvider>> = Object.freeze({
  openai: provider({
    id: "openai",
    origin: "https://api.openai.com",
    modelListUrl: "https://api.openai.com/v1/models",
    validationUrl: null,
    protocol: "openai-chat",
    mentorUrl: () => "https://api.openai.com/v1/chat/completions",
  }),
  anthropic: provider({
    id: "anthropic",
    origin: "https://api.anthropic.com",
    modelListUrl: "https://api.anthropic.com/v1/models",
    validationUrl: null,
    protocol: "anthropic-messages",
    mentorUrl: () => "https://api.anthropic.com/v1/messages",
  }),
  gemini: provider({
    id: "gemini",
    origin: "https://generativelanguage.googleapis.com",
    modelListUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    validationUrl: null,
    protocol: "gemini-content",
    mentorUrl: (model) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(stripGeminiPrefix(model))}:generateContent`,
  }),
  openrouter: provider({
    id: "openrouter",
    origin: "https://openrouter.ai",
    modelListUrl: "https://openrouter.ai/api/v1/models",
    validationUrl: "https://openrouter.ai/api/v1/auth/key",
    protocol: "openai-chat",
    mentorUrl: () => "https://openrouter.ai/api/v1/chat/completions",
  }),
  deepseek: provider({
    id: "deepseek",
    origin: "https://api.deepseek.com",
    modelListUrl: "https://api.deepseek.com/models",
    validationUrl: null,
    protocol: "openai-chat",
    mentorUrl: () => "https://api.deepseek.com/chat/completions",
  }),
  glm: provider({
    id: "glm",
    origin: "https://open.bigmodel.cn",
    modelListUrl: null,
    validationUrl: null,
    protocol: "openai-chat",
    staticModels: GLM_MODELS,
    mentorUrl: () => "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  }),
  "kimi-cn": provider({
    id: "kimi-cn",
    origin: "https://api.moonshot.cn",
    modelListUrl: "https://api.moonshot.cn/v1/models",
    validationUrl: null,
    protocol: "openai-chat",
    mentorUrl: () => "https://api.moonshot.cn/v1/chat/completions",
  }),
  "kimi-global": provider({
    id: "kimi-global",
    origin: "https://api.moonshot.ai",
    modelListUrl: "https://api.moonshot.ai/v1/models",
    validationUrl: null,
    protocol: "openai-chat",
    mentorUrl: () => "https://api.moonshot.ai/v1/chat/completions",
  }),
});

export function getAiProviderRegistration(providerId: AiProviderId): RegisteredAiProvider {
  return registry[providerId];
}

export function providerIdForLegacyEndpoint(endpoint: string): AiProviderId | null {
  let normalized: URL;
  try {
    normalized = new URL(endpoint);
  } catch {
    return null;
  }
  if (
    normalized.protocol !== "https:" ||
    normalized.username.length > 0 ||
    normalized.password.length > 0 ||
    normalized.search.length > 0 ||
    normalized.hash.length > 0
  ) {
    return null;
  }
  const canonical = normalized.href.replace(/\/$/u, "");
  for (const providerId of Object.keys(registry) as AiProviderId[]) {
    const item = registry[providerId];
    const accepted = legacyEndpoints(item).map((candidate) => candidate.replace(/\/$/u, ""));
    if (accepted.includes(canonical)) return providerId;
  }
  return null;
}

export function assertRegisteredAiProviderUrl(providerId: AiProviderId, candidate: string): URL {
  const registration = getAiProviderRegistration(providerId);
  const url = new URL(candidate);
  const origin = new URL(registration.origin);
  if (
    url.protocol !== "https:" ||
    url.origin !== origin.origin ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error("AI Provider 请求目标不在官方主机白名单内");
  }
  return url;
}

function provider(
  input: Omit<RegisteredAiProvider, "staticModels"> & {
    readonly staticModels?: readonly AiProviderModel[];
  },
): RegisteredAiProvider {
  return Object.freeze({
    ...input,
    staticModels: input.staticModels ?? Object.freeze([]),
  });
}

function models(ids: readonly string[]): readonly AiProviderModel[] {
  return Object.freeze(ids.map((id) => Object.freeze({ id, label: id })));
}

function stripGeminiPrefix(model: string): string {
  return model.startsWith("models/") ? model.slice("models/".length) : model;
}

function legacyEndpoints(provider: RegisteredAiProvider): readonly string[] {
  switch (provider.id) {
    case "openai":
      return Object.freeze(["https://api.openai.com/v1"]);
    case "anthropic":
      return Object.freeze(["https://api.anthropic.com/v1"]);
    case "gemini":
      return Object.freeze([
        "https://generativelanguage.googleapis.com/v1beta",
        "https://generativelanguage.googleapis.com/v1beta/openai",
      ]);
    case "openrouter":
      return Object.freeze(["https://openrouter.ai/api/v1"]);
    case "deepseek":
      return Object.freeze(["https://api.deepseek.com", "https://api.deepseek.com/v1"]);
    case "glm":
      return Object.freeze(["https://open.bigmodel.cn/api/paas/v4"]);
    case "kimi-cn":
      return Object.freeze(["https://api.moonshot.cn/v1"]);
    case "kimi-global":
      return Object.freeze(["https://api.moonshot.ai/v1"]);
  }
}
