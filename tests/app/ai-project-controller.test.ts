import { describe, expect, it, vi } from "vitest";

import { createAiProjectController } from "../../src/app/ai-project-controller.js";
import type { PanelApi } from "../../src/shared/api.js";
import type { AiConversationSnapshot, AiProjectSnapshot } from "../../src/shared/ai-project.js";

describe("AI project renderer controller", () => {
  it("opens one stable project and creates only one initial conversation", async () => {
    let project = snapshot("project-a", "project-a-id", 0, []);
    const conversation = conversationSnapshot("conversation-a", "新对话", []);
    const openAiProject = vi.fn(async () => ({ status: "ready" as const, project }));
    const createAiConversation = vi.fn(async () => {
      project = snapshot("project-a", "project-a-id", 1, [conversation]);
      return { status: "created" as const, project, conversation };
    });
    const controller = createAiProjectController({
      api: fakeApi({ openAiProject, createAiConversation }),
      defaultConversationTitle: () => "新对话",
      onState: vi.fn(),
    });

    await controller.setWorkspace("project-a", "算法 A");
    await controller.setWorkspace("project-a", "算法 A");

    expect(openAiProject).toHaveBeenCalledTimes(1);
    expect(createAiConversation).toHaveBeenCalledTimes(1);
    expect(controller.state.project?.projectId).toBe("project-a-id");
    expect(controller.state.activeConversation?.id).toBe("conversation-a");
  });

  it("drops a late project result after the workspace changes", async () => {
    let resolveA!: (value: ReturnType<typeof readyProject>) => void;
    const pendingA = new Promise<ReturnType<typeof readyProject>>((resolve) => {
      resolveA = resolve;
    });
    const openAiProject = vi.fn((request: { workspaceId: string }) =>
      request.workspaceId === "project-a"
        ? pendingA
        : Promise.resolve(
            readyProject(
              snapshot("project-b", "project-b-id", 1, [
                conversationSnapshot("conversation-b", "B", []),
              ]),
            ),
          ),
    );
    const controller = createAiProjectController({
      api: fakeApi({ openAiProject }),
      defaultConversationTitle: () => "New conversation",
      onState: vi.fn(),
    });

    const first = controller.setWorkspace("project-a", "A");
    await controller.setWorkspace("project-b", "B");
    resolveA(readyProject(snapshot("project-a", "project-a-id", 0, [])));
    await first;

    expect(controller.state.workspaceId).toBe("project-b");
    expect(controller.state.project?.projectId).toBe("project-b-id");
  });

  it("appends a message with the current optimistic revision", async () => {
    const conversation = conversationSnapshot("conversation-a", "Debug", []);
    let project = snapshot("project-a", "project-a-id", 2, [conversation]);
    const appended = conversationSnapshot("conversation-a", "Debug", [
      Object.freeze({
        id: "message-a",
        role: "user" as const,
        content: "检查边界",
        sourceFingerprint: "8:abc:def",
        createdAt: "2026-07-14T00:00:01.000Z",
      }),
    ]);
    const appendAiConversationMessage = vi.fn(async () => {
      project = snapshot("project-a", "project-a-id", 3, [appended]);
      return {
        status: "appended" as const,
        project,
        conversation: appended,
        message: appended.messages[0]!,
      };
    });
    const controller = createAiProjectController({
      api: fakeApi({
        openAiProject: async () => readyProject(project),
        readAiConversation: async () => ({ status: "ready" as const, conversation }),
        appendAiConversationMessage,
      }),
      defaultConversationTitle: () => "New conversation",
      onState: vi.fn(),
    });

    await controller.setWorkspace("project-a", "A");
    await controller.appendMessage("user", "检查边界", "8:abc:def");

    expect(appendAiConversationMessage).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 2, conversationId: "conversation-a" }),
    );
    expect(controller.state.project?.revision).toBe(3);
    expect(controller.state.activeConversation?.messages).toHaveLength(1);
  });
});

function fakeApi(overrides: Record<string, unknown>): PanelApi {
  const failed = async () => ({
    status: "failed" as const,
    error: { code: "AI_PROJECT_INVALID_REQUEST" as const, message: "unexpected" },
  });
  return {
    openAiProject: failed,
    createAiConversation: failed,
    readAiConversation: failed,
    renameAiConversation: failed,
    setAiConversationArchived: failed,
    deleteAiConversation: failed,
    appendAiConversationMessage: failed,
    ...overrides,
  } as unknown as PanelApi;
}

function readyProject(project: AiProjectSnapshot) {
  return { status: "ready" as const, project };
}

function snapshot(
  workspaceId: string,
  projectId: string,
  revision: number,
  conversations: readonly AiConversationSnapshot[],
): AiProjectSnapshot {
  return Object.freeze({
    schemaVersion: 1,
    workspaceId,
    projectId,
    revision,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    conversations: Object.freeze(
      conversations.map(({ messages: _messages, ...summary }) => Object.freeze(summary)),
    ),
  });
}

function conversationSnapshot(
  id: string,
  title: string,
  messages: AiConversationSnapshot["messages"],
): AiConversationSnapshot {
  return Object.freeze({
    id,
    title,
    state: "active",
    messageCount: messages.length,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    messages: Object.freeze([...messages]),
  });
}
