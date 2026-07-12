import { describe, expect, it } from "vitest";
import {
  AI_PROVIDER_IDS,
  parseAiCredentialInput,
  validateConnectAiProviderRequest,
  validateStartAiMentorRequest,
} from "../../src/shared/ai-provider.js";

describe("AI Provider shared boundary v2", () => {
  it("identifies explicit environment assignments without sending a key anywhere", () => {
    expect(parseAiCredentialInput("OPENAI_API_KEY=sk-test")).toMatchObject({
      status: "identified",
      providerId: "openai",
      apiKey: "sk-test",
    });
    expect(parseAiCredentialInput("ZAI_API_KEY='glm-secret'")).toMatchObject({
      status: "identified",
      providerId: "glm",
      apiKey: "glm-secret",
    });
    expect(parseAiCredentialInput("MOONSHOT_API_KEY=moonshot-secret")).toEqual({
      status: "ambiguous",
      candidates: ["kimi-cn", "kimi-global"],
      apiKey: "moonshot-secret",
    });
  });

  it("uses only strong prefixes and keeps generic raw keys ambiguous", () => {
    expect(parseAiCredentialInput("sk-ant-api03-test")).toMatchObject({
      status: "identified",
      providerId: "anthropic",
    });
    expect(parseAiCredentialInput("sk-or-v1-test")).toMatchObject({
      status: "identified",
      providerId: "openrouter",
    });
    expect(parseAiCredentialInput("sk-generic-shared-prefix")).toEqual({
      status: "ambiguous",
      candidates: [...AI_PROVIDER_IDS],
      apiKey: "sk-generic-shared-prefix",
    });
  });

  it("accepts only registered providers and exact connect request fields", () => {
    expect(
      validateConnectAiProviderRequest({
        expectedRevision: null,
        providerId: "deepseek",
        apiKey: "secret",
      }),
    ).toEqual({ expectedRevision: null, providerId: "deepseek", apiKey: "secret" });
    expect(
      validateConnectAiProviderRequest({
        expectedRevision: null,
        providerId: "custom",
        apiKey: "secret",
      }),
    ).toBeNull();
    expect(
      validateConnectAiProviderRequest({
        expectedRevision: null,
        providerId: "openai",
        apiKey: "secret",
        endpoint: "https://attacker.example",
      }),
    ).toBeNull();
  });

  it("rejects every C0 control character and DEL in API keys", () => {
    for (const code of [...Array.from({ length: 0x20 }, (_, index) => index), 0x7f]) {
      expect(
        validateConnectAiProviderRequest({
          expectedRevision: null,
          providerId: "openai",
          apiKey: `left${String.fromCharCode(code)}right`,
        }),
      ).toBeNull();
    }
  });

  it("makes full-source context explicit and rejects unrelated renderer fields", () => {
    const base = {
      sourceFingerprint: "fnv64:abc",
      sourceRevision: 3,
      providerRevision: 1,
      prompt: "Explain this loop",
      context: {
        currentFunction: "int main(void){return 0;}",
        diagnosticSummary: ["no findings"],
        controlFlowSummary: "1 function",
        runEvidence: ["duration=1ms"],
      },
    };
    expect(
      validateStartAiMentorRequest({ ...base, contextMode: "current-function" }),
    ).not.toBeNull();
    expect(
      validateStartAiMentorRequest({
        ...base,
        contextMode: "current-function",
        context: { ...base.context, fullSource: "secret full source" },
      }),
    ).toBeNull();
    expect(
      validateStartAiMentorRequest({
        ...base,
        contextMode: "full-source",
        context: { ...base.context, fullSource: "int main(void){return 0;}" },
      }),
    ).not.toBeNull();
    expect(
      validateStartAiMentorRequest({
        ...base,
        contextMode: "current-function",
        context: { ...base.context, stdin: "must not cross" },
      }),
    ).toBeNull();
  });
});
