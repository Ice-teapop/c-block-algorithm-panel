import { describe, expect, it } from "vitest";
import {
  AI_PROJECT_MESSAGE_MAX_BYTES,
  aiProjectFailure,
  validateAppendAiConversationMessageRequest,
  validateCreateAiConversationRequest,
  validateOpenAiProjectRequest,
  validateRenameAiConversationRequest,
} from "../../src/shared/ai-project.js";

const workspaceId = "project-12345678-1234-4123-8123-123456789abc";
const conversationId = "conversation-12345678-1234-4123-8123-123456789abc";

describe("AI Project shared contract", () => {
  it("accepts only opaque workspace IDs and exact request shapes", () => {
    expect(validateOpenAiProjectRequest({ workspaceId })).toEqual({ workspaceId });
    expect(validateOpenAiProjectRequest({ workspaceId, path: "/tmp/project" })).toBeNull();
    expect(validateOpenAiProjectRequest({ workspaceId: "../../outside" })).toBeNull();

    expect(
      validateCreateAiConversationRequest({ workspaceId, expectedRevision: 0, title: "  Debug  " }),
    ).toEqual({ workspaceId, expectedRevision: 0, title: "Debug" });
    expect(
      validateRenameAiConversationRequest({
        workspaceId,
        conversationId,
        expectedRevision: 1,
        title: "\u0000hidden",
      }),
    ).toBeNull();
  });

  it("bounds persisted messages and keeps source binding explicit", () => {
    const valid = {
      workspaceId,
      conversationId,
      expectedRevision: 2,
      role: "assistant" as const,
      content: "Use a loop invariant.",
      sourceFingerprint: "fnv64:abc",
    };
    expect(validateAppendAiConversationMessageRequest(valid)).toEqual(valid);
    expect(
      validateAppendAiConversationMessageRequest({ ...valid, sourceFingerprint: undefined }),
    ).toBeNull();
    expect(
      validateAppendAiConversationMessageRequest({
        ...valid,
        content: "x".repeat(AI_PROJECT_MESSAGE_MAX_BYTES + 1),
      }),
    ).toBeNull();
  });

  it("returns discriminated failures without implementation details", () => {
    expect(aiProjectFailure("AI_PROJECT_CONFLICT", "reload")).toEqual({
      status: "failed",
      error: { code: "AI_PROJECT_CONFLICT", message: "reload" },
    });
  });
});
