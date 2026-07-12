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
        async (_provider, _credential, _model, _prompt, _context, signal: AbortSignal) =>
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
});

function mentorRequest() {
  return {
    sourceFingerprint: "fnv64:abc",
    sourceRevision: 2,
    providerRevision: 0,
    contextMode: "current-function" as const,
    prompt: "Explain",
    context: {
      currentFunction: "int main(void){return 0;}",
      diagnosticSummary: [],
      controlFlowSummary: "one function",
      runEvidence: [],
    },
  };
}
