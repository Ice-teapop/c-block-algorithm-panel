import { describe, expect, it, vi } from "vitest";
import { createAiMentorController } from "../../electron/main/ai-mentor-controller.js";
import type { AiProviderClient } from "../../electron/main/ai-provider-client.js";
import type { AiProviderFailure } from "../../src/shared/ai-provider.js";

describe("AI mentor session controller", () => {
  it("allows one request per window, scopes reads, and returns only completed text", async () => {
    let resolveRequest!: (value: { status: "completed"; text: string }) => void;
    const client: AiProviderClient = {
      listModels: vi.fn(),
      requestMentor: vi.fn(
        () =>
          new Promise<{ status: "completed"; text: string }>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    };
    const controller = createAiMentorController(client);
    const owner = {};
    const request = mentorRequest();
    const started = controller.start(owner, "openai", "secret", "model-a", request);
    expect(started.status).toBe("started");
    expect(client.requestMentor).toHaveBeenCalledWith(
      "openai",
      "secret",
      "model-a",
      "Explain",
      [],
      request.context,
      expect.any(AbortSignal),
      "chat",
      "en",
    );
    expect(controller.start(owner, "openai", "secret", "model-a", request)).toMatchObject({
      error: { code: "AI_PROVIDER_BUSY" },
    });
    if (started.status !== "started") throw new Error("start failed");
    expect(controller.read({}, started.sessionId, 0)).toMatchObject({
      error: { code: "AI_PROVIDER_SESSION_NOT_FOUND" },
    });
    resolveRequest({ status: "completed", text: "plain answer" });
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.read(owner, started.sessionId, 0)).toMatchObject({
      status: "completed",
      sourceFingerprint: "fnv64:abc",
      events: [{ sequence: 1, kind: "answer", text: "plain answer" }],
      nextSequence: 1,
    });
    expect(controller.read(owner, started.sessionId, 1)).toMatchObject({ events: [] });
  });

  it("cancels by owner and never publishes a late result", async () => {
    const client: AiProviderClient = {
      listModels: vi.fn(),
      requestMentor: vi.fn(
        async (_provider, _credential, _model, _prompt, _history, _context, signal: AbortSignal) =>
          await new Promise<AiProviderFailure>((resolve) => {
            signal.addEventListener("abort", () =>
              resolve({
                status: "failed" as const,
                error: { code: "AI_PROVIDER_SOURCE_STALE" as const, message: "cancelled" },
              }),
            );
          }),
      ),
    };
    const controller = createAiMentorController(client);
    const owner = {};
    const started = controller.start(owner, "deepseek", "secret", "deepseek-chat", mentorRequest());
    if (started.status !== "started") throw new Error("start failed");
    controller.cancelOwner(owner);
    expect(controller.read(owner, started.sessionId, 0)).toMatchObject({
      status: "cancelled",
      events: [],
    });
    await Promise.resolve();
    expect(controller.read(owner, started.sessionId, 0)).toMatchObject({ status: "cancelled" });
  });

  it("publishes a separately typed proposal event only for validated edit results", async () => {
    const proposal = {
      schemaVersion: 1 as const,
      summary: "修正返回值",
      replacements: [{ expectedText: "return 0;", newText: "return 1;" }],
    };
    const client: AiProviderClient = {
      listModels: vi.fn(),
      requestMentor: vi.fn(async () => ({
        status: "completed" as const,
        text: "建议修改一处。",
        proposal,
      })),
    };
    const controller = createAiMentorController(client);
    const owner = {};
    const started = controller.start(owner, "openai", "secret", "model-a", {
      ...mentorRequest(),
      intent: "propose-edit",
    });
    if (started.status !== "started") throw new Error("start failed");
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.read(owner, started.sessionId, 0)).toMatchObject({
      status: "completed",
      events: [
        { sequence: 1, kind: "answer", text: "建议修改一处。" },
        { sequence: 2, kind: "proposal", text: "修正返回值", proposal },
      ],
      nextSequence: 2,
    });
  });
});

function mentorRequest() {
  return {
    sourceFingerprint: "fnv64:abc",
    sourceRevision: 2,
    providerRevision: 0,
    contextMode: "current-function" as const,
    locale: "en" as const,
    prompt: "Explain",
    history: [],
    context: {
      currentFunction: "int main(void){return 0;}",
      diagnosticSummary: [],
      controlFlowSummary: "one function",
      runEvidence: [],
    },
  };
}
