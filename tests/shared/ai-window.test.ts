import { describe, expect, it } from "vitest";
import {
  validateAiWindowIntent,
  validateAiWindowStateEnvelope,
  type AiWindowStateEnvelope,
} from "../../src/shared/ai-window.js";

const projectId = "ai-project-12345678-1234-4123-8123-123456789abc";
const conversationId = "conversation-12345678-1234-4123-8123-123456789abc";

describe("AI native window shared boundary", () => {
  it("accepts a bounded exact presentation snapshot", () => {
    const envelope = stateEnvelope();
    expect(validateAiWindowStateEnvelope(envelope)).toEqual(envelope);
    const { theme: _theme, ...withoutTheme } = envelope;
    expect(validateAiWindowStateEnvelope(withoutTheme)).toBeNull();
    expect(
      validateAiWindowStateEnvelope({ ...envelope, theme: "dark", background: "paper" }),
    ).toMatchObject({
      theme: "dark",
      background: "paper",
    });
    expect(validateAiWindowStateEnvelope({ ...envelope, credential: "secret" })).toBeNull();
    expect(
      validateAiWindowStateEnvelope({
        ...envelope,
        state: { ...envelope.state, messages: new Array(257).fill(envelope.state.messages[0]) },
      }),
    ).toBeNull();
  });

  it("rejects malformed IDs, unknown fields, and unsafe controls", () => {
    expect(
      validateAiWindowIntent({
        type: "send",
        prompt: "  Explain this loop  ",
        projectId,
        conversationId,
        mode: "read-only",
      }),
    ).toEqual({
      type: "send",
      prompt: "Explain this loop",
      projectId,
      conversationId,
      mode: "read-only",
    });
    expect(
      validateAiWindowIntent({
        type: "send",
        prompt: "Explain\u0000",
        projectId,
        conversationId,
        mode: "read-only",
      }),
    ).toBeNull();
    expect(
      validateAiWindowIntent({
        type: "send",
        prompt: "Explain",
        projectId: "ai-project-------------------------------------",
        conversationId,
        mode: "read-only",
      }),
    ).toBeNull();
    expect(validateAiWindowIntent({ type: "cancel", extra: true })).toBeNull();
  });

  it("allows only the declared intent union", () => {
    expect(validateAiWindowIntent({ type: "cancel" })).toEqual({ type: "cancel" });
    expect(validateAiWindowIntent({ type: "open-model-settings" })).toEqual({
      type: "open-model-settings",
    });
    expect(
      validateAiWindowIntent({ type: "review-decision", reviewId: "review-1", accepted: true }),
    ).toEqual({ type: "review-decision", reviewId: "review-1", accepted: true });
    expect(validateAiWindowIntent({ type: "read-file", path: "/tmp/main.c" })).toBeNull();
  });
});

function stateEnvelope(): AiWindowStateEnvelope {
  return {
    sequence: 4,
    locale: "en",
    background: "white",
    theme: "light",
    state: {
      projects: [
        {
          id: projectId,
          name: "Maximum scan",
          conversations: [{ id: conversationId, title: "Edge cases", updatedLabel: "10:30" }],
        },
      ],
      activeProjectId: projectId,
      activeConversationId: conversationId,
      messages: [
        {
          id: "message-12345678-1234-4123-8123-123456789abc",
          role: "assistant",
          content: "Check an all-negative input.",
          state: "complete",
        },
      ],
      mode: "read-only",
      availableModes: ["read-only", "review"],
      modelLabel: "DeepSeek · deepseek-chat",
      suggestedQuestions: ["Explain the current algorithm"],
      isResponding: false,
      pendingReview: null,
    },
  };
}
