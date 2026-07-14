import { describe, expect, it, vi } from "vitest";
import {
  createAiProviderClient,
  type AiProviderNetworkAdapter,
  type AiProviderNetworkRequest,
  type AiProviderNetworkResponse,
} from "../../electron/main/ai-provider-client.js";

describe("official AI Provider transport", () => {
  it("uses exactly the selected official host and provider-specific auth header", async () => {
    const requests: AiProviderNetworkRequest[] = [];
    const client = createAiProviderClient(
      network(async (request) => {
        requests.push(request);
        return jsonResponse({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] });
      }),
    );
    const result = await client.listModels("deepseek", "private-key");
    expect(result).toMatchObject({
      status: "ready",
      providerId: "deepseek",
      models: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }],
    });
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!.url).origin).toBe("https://api.deepseek.com");
    expect(requests[0]!.headers.Authorization).toBe("Bearer private-key");
    expect(JSON.stringify(result)).not.toContain("private-key");
  });

  it("keeps GLM model discovery local and makes no validation charge", async () => {
    const adapter = network(vi.fn());
    const client = createAiProviderClient(adapter);
    const result = await client.listModels("glm", "zai-secret");
    expect(result.status).toBe("ready");
    if (result.status === "ready") expect(result.models.length).toBeGreaterThan(3);
    expect(adapter.request).not.toHaveBeenCalled();
  });

  it("parses Gemini model capability and sends the key only in x-goog-api-key", async () => {
    const requests: AiProviderNetworkRequest[] = [];
    const client = createAiProviderClient(
      network(async (request) => {
        requests.push(request);
        return jsonResponse({
          models: [
            {
              name: "models/gemini-test",
              displayName: "Gemini Test",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embed-test",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
        });
      }),
    );
    const result = await client.listModels("gemini", "gemini-secret");
    expect(result).toMatchObject({
      status: "ready",
      models: [{ id: "models/gemini-test", label: "Gemini Test" }],
    });
    expect(requests[0]!.headers["x-goog-api-key"]).toBe("gemini-secret");
    expect(requests[0]!.url).not.toContain("gemini-secret");
  });

  it("rejects non-JSON, malformed and oversized responses without echoing secrets", async () => {
    const invalid = createAiProviderClient(
      network(async () => ({ status: 200, contentType: "text/html", body: bytes("<html>") })),
    );
    await expect(invalid.listModels("openai", "do-not-echo")).resolves.toMatchObject({
      status: "failed",
      error: { code: "AI_PROVIDER_INVALID_RESPONSE" },
    });

    const oversized = createAiProviderClient(
      network(async () => {
        throw Object.assign(new Error("network"), { reason: "too-large" });
      }),
    );
    const result = await oversized.listModels("openrouter", "do-not-echo");
    expect(result).toMatchObject({ error: { code: "AI_PROVIDER_RESPONSE_TOO_LARGE" } });
    expect(JSON.stringify(result)).not.toContain("do-not-echo");
  });

  it("uses native Anthropic message payload and returns plain answer text", async () => {
    let captured: AiProviderNetworkRequest | null = null;
    const client = createAiProviderClient(
      network(async (request) => {
        captured = request;
        return jsonResponse({ content: [{ type: "text", text: "Evidence-based answer" }] });
      }),
    );
    const result = await client.requestMentor(
      "anthropic",
      "anthropic-secret",
      "claude-test",
      "Explain",
      [
        { role: "user", content: "What does it return?" },
        { role: "assistant", content: "It returns zero." },
      ],
      {
        currentFunction: "int main(void){return 0;}",
        diagnosticSummary: [],
        controlFlowSummary: "one function",
        runEvidence: [],
      },
      new AbortController().signal,
      "chat",
      "en",
    );
    expect(result).toEqual({ status: "completed", text: "Evidence-based answer" });
    expect(captured).not.toBeNull();
    const request = captured as unknown as AiProviderNetworkRequest;
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("anthropic-secret");
    expect(request.body).toContain('"system"');
    expect(request.body).toContain("What does it return?");
    expect(request.body).toContain("It returns zero.");
    expect(request.body).toContain("Reply in English.");
    expect(request.body).toContain("Workbench evidence (may be empty):");
    expect(request.body).not.toContain("工作台证据");
    expect(request.body).not.toContain("anthropic-secret");
  });

  it("accepts a strict edit envelope but never treats free-form model text as a proposal", async () => {
    const envelope = {
      schemaVersion: 1,
      answer: "建议修正返回值。",
      proposal: {
        schemaVersion: 1,
        summary: "修正返回值",
        replacements: [{ expectedText: "return 0;", newText: "return 1;" }],
      },
    };
    let captured: AiProviderNetworkRequest | null = null;
    const client = createAiProviderClient(
      network(async (request) => {
        captured = request;
        return jsonResponse({ choices: [{ message: { content: JSON.stringify(envelope) } }] });
      }),
    );
    const result = await client.requestMentor(
      "openai",
      "private-key",
      "gpt-test",
      "Fix it",
      [],
      {
        currentFunction: "int main(void){return 0;}",
        diagnosticSummary: [],
        controlFlowSummary: "complete",
        runEvidence: [],
      },
      new AbortController().signal,
      "propose-edit",
      "en",
    );
    expect(result).toEqual({
      status: "completed",
      text: "建议修正返回值。",
      proposal: envelope.proposal,
    });
    expect((captured as unknown as AiProviderNetworkRequest).body).toContain(
      "You may propose only text replacements inside the current main.c",
    );
    expect((captured as unknown as AiProviderNetworkRequest).body).not.toMatch(/[\p{Script=Han}]/u);

    const malformed = createAiProviderClient(
      network(async () =>
        jsonResponse({ choices: [{ message: { content: "```json\\n{}\\n```" } }] }),
      ),
    );
    await expect(
      malformed.requestMentor(
        "openai",
        "private-key",
        "gpt-test",
        "Fix it",
        [],
        {
          currentFunction: "int main(void){return 0;}",
          diagnosticSummary: [],
          controlFlowSummary: "complete",
          runEvidence: [],
        },
        new AbortController().signal,
        "propose-edit",
        "en",
      ),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "AI_PROVIDER_INVALID_RESPONSE" },
    });
  });
});

function network(
  implementation: (request: AiProviderNetworkRequest) => Promise<AiProviderNetworkResponse>,
): AiProviderNetworkAdapter {
  return { request: vi.fn(implementation) };
}

function jsonResponse(value: unknown): AiProviderNetworkResponse {
  return {
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: bytes(JSON.stringify(value)),
  };
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
