import type { PanelApi } from "../shared/api.js";
import type {
  AiConversationMessage,
  AiConversationSnapshot,
  AiConversationSummary,
  AiProjectSnapshot,
} from "../shared/ai-project.js";

type AiProjectApi = Pick<
  PanelApi,
  | "openAiProject"
  | "createAiConversation"
  | "readAiConversation"
  | "renameAiConversation"
  | "setAiConversationArchived"
  | "deleteAiConversation"
  | "appendAiConversationMessage"
>;

export type AiProjectControllerStatus = "idle" | "loading" | "ready" | "error";

export interface AiProjectControllerState {
  readonly status: AiProjectControllerStatus;
  readonly workspaceId: string | null;
  readonly workspaceTitle: string;
  readonly project: AiProjectSnapshot | null;
  readonly conversations: readonly AiConversationSummary[];
  readonly activeConversation: AiConversationSnapshot | null;
  readonly busy: boolean;
  readonly error: string | null;
}

export interface AiProjectControllerOptions {
  readonly api: AiProjectApi;
  readonly defaultConversationTitle: () => string;
  readonly onState: (state: AiProjectControllerState) => void;
}

export interface AiProjectController {
  readonly state: AiProjectControllerState;
  setWorkspace(workspaceId: string | null, title?: string): Promise<void>;
  createConversation(title?: string): Promise<void>;
  selectConversation(conversationId: string): Promise<void>;
  renameConversation(conversationId: string, title: string): Promise<void>;
  setConversationArchived(conversationId: string, archived: boolean): Promise<void>;
  deleteConversation(conversationId: string): Promise<void>;
  appendMessage(
    role: "user" | "assistant",
    content: string,
    sourceFingerprint: string | null,
  ): Promise<AiConversationMessage | null>;
  clearError(): void;
  destroy(): void;
}

const EMPTY_CONVERSATIONS = Object.freeze([]) as readonly AiConversationSummary[];

export function createAiProjectController(
  options: AiProjectControllerOptions,
): AiProjectController {
  let destroyed = false;
  let generation = 0;
  let state = freezeState({
    status: "idle",
    workspaceId: null,
    workspaceTitle: "",
    project: null,
    conversations: EMPTY_CONVERSATIONS,
    activeConversation: null,
    busy: false,
    error: null,
  });

  const publish = (patch: Partial<AiProjectControllerState>): void => {
    if (destroyed) return;
    state = freezeState({ ...state, ...patch });
    options.onState(state);
  };

  const fail = (message: string): void => {
    publish({ status: state.project === null ? "error" : "ready", busy: false, error: message });
  };

  const activeRequest = (): { workspaceId: string; revision: number } | null => {
    if (state.workspaceId === null || state.project === null) {
      fail("请先打开一个本地项目。");
      return null;
    }
    return Object.freeze({ workspaceId: state.workspaceId, revision: state.project.revision });
  };

  const adoptProject = (project: AiProjectSnapshot): void => {
    publish({
      project,
      conversations: project.conversations,
      status: "ready",
      busy: false,
      error: null,
    });
  };

  const reloadAfterConflict = async (requestGeneration: number, message: string): Promise<void> => {
    const workspaceId = state.workspaceId;
    if (workspaceId === null) return;
    const result = await options.api.openAiProject({ workspaceId });
    if (destroyed || requestGeneration !== generation) return;
    if (result.status === "ready") {
      adoptProject(result.project);
      publish({ error: message });
    } else {
      fail(result.error.message);
    }
  };

  const handleFailure = async (
    requestGeneration: number,
    failure: { readonly error: { readonly code: string; readonly message: string } },
  ): Promise<void> => {
    if (failure.error.code === "AI_PROJECT_CONFLICT") {
      await reloadAfterConflict(
        requestGeneration,
        "对话已在其他操作中更新，已重新载入；请重试刚才的操作。",
      );
      return;
    }
    fail(failure.error.message);
  };

  const selectConversation = async (conversationId: string): Promise<void> => {
    const workspaceId = state.workspaceId;
    if (destroyed || workspaceId === null) return;
    const requestGeneration = generation;
    publish({ busy: true, error: null });
    const result = await options.api.readAiConversation({ workspaceId, conversationId });
    if (destroyed || requestGeneration !== generation) return;
    if (result.status === "failed") {
      fail(result.error.message);
      return;
    }
    publish({ activeConversation: result.conversation, busy: false, status: "ready", error: null });
  };

  const createConversation = async (title?: string): Promise<void> => {
    const active = activeRequest();
    if (destroyed || active === null) return;
    const requestGeneration = generation;
    publish({ busy: true, error: null });
    const result = await options.api.createAiConversation({
      workspaceId: active.workspaceId,
      expectedRevision: active.revision,
      title: title?.trim() || options.defaultConversationTitle(),
    });
    if (destroyed || requestGeneration !== generation) return;
    if (result.status === "failed") {
      await handleFailure(requestGeneration, result);
      return;
    }
    adoptProject(result.project);
    publish({ activeConversation: result.conversation });
  };

  const chooseInitialConversation = async (
    project: AiProjectSnapshot,
    requestGeneration: number,
  ): Promise<void> => {
    if (project.conversations.length === 0) {
      await createConversation();
      return;
    }
    const initial =
      [...project.conversations]
        .filter((conversation) => conversation.state === "active")
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
      [...project.conversations].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )[0];
    if (initial !== undefined && requestGeneration === generation) {
      await selectConversation(initial.id);
    }
  };

  const mutateConversation = async (
    operation: (
      workspaceId: string,
      revision: number,
    ) => ReturnType<AiProjectApi["renameAiConversation"]>,
  ): Promise<void> => {
    const active = activeRequest();
    if (destroyed || active === null) return;
    const requestGeneration = generation;
    publish({ busy: true, error: null });
    const result = await operation(active.workspaceId, active.revision);
    if (destroyed || requestGeneration !== generation) return;
    if (result.status === "failed") {
      await handleFailure(requestGeneration, result);
      return;
    }
    adoptProject(result.project);
    if (state.activeConversation?.id === result.conversation.id) {
      publish({ activeConversation: result.conversation });
    }
  };

  const controller: AiProjectController = {
    get state(): AiProjectControllerState {
      return state;
    },
    async setWorkspace(workspaceId: string | null, title = ""): Promise<void> {
      if (destroyed) return;
      if (workspaceId === state.workspaceId && state.project !== null) {
        if (title !== state.workspaceTitle) publish({ workspaceTitle: title });
        return;
      }
      const requestGeneration = ++generation;
      if (workspaceId === null) {
        publish({
          status: "idle",
          workspaceId: null,
          workspaceTitle: "",
          project: null,
          conversations: EMPTY_CONVERSATIONS,
          activeConversation: null,
          busy: false,
          error: null,
        });
        return;
      }
      publish({
        status: "loading",
        workspaceId,
        workspaceTitle: title,
        project: null,
        conversations: EMPTY_CONVERSATIONS,
        activeConversation: null,
        busy: true,
        error: null,
      });
      const result = await options.api.openAiProject({ workspaceId });
      if (destroyed || requestGeneration !== generation) return;
      if (result.status === "failed") {
        fail(result.error.message);
        return;
      }
      adoptProject(result.project);
      await chooseInitialConversation(result.project, requestGeneration);
    },
    createConversation,
    selectConversation,
    async renameConversation(conversationId: string, title: string): Promise<void> {
      await mutateConversation((workspaceId, expectedRevision) =>
        options.api.renameAiConversation({
          workspaceId,
          conversationId,
          expectedRevision,
          title,
        }),
      );
    },
    async setConversationArchived(conversationId: string, archived: boolean): Promise<void> {
      await mutateConversation((workspaceId, expectedRevision) =>
        options.api.setAiConversationArchived({
          workspaceId,
          conversationId,
          expectedRevision,
          archived,
        }),
      );
    },
    async deleteConversation(conversationId: string): Promise<void> {
      const active = activeRequest();
      if (destroyed || active === null) return;
      const requestGeneration = generation;
      publish({ busy: true, error: null });
      const result = await options.api.deleteAiConversation({
        workspaceId: active.workspaceId,
        conversationId,
        expectedRevision: active.revision,
      });
      if (destroyed || requestGeneration !== generation) return;
      if (result.status === "failed") {
        await handleFailure(requestGeneration, result);
        return;
      }
      adoptProject(result.project);
      if (state.activeConversation?.id === conversationId) {
        publish({ activeConversation: null });
        await chooseInitialConversation(result.project, requestGeneration);
      }
    },
    async appendMessage(role, content, sourceFingerprint): Promise<AiConversationMessage | null> {
      const active = activeRequest();
      const conversationId = state.activeConversation?.id ?? null;
      if (destroyed || active === null || conversationId === null) return null;
      const requestGeneration = generation;
      publish({ busy: true, error: null });
      const result = await options.api.appendAiConversationMessage({
        workspaceId: active.workspaceId,
        conversationId,
        expectedRevision: active.revision,
        role,
        content,
        sourceFingerprint,
      });
      if (destroyed || requestGeneration !== generation) return null;
      if (result.status === "failed") {
        await handleFailure(requestGeneration, result);
        return null;
      }
      adoptProject(result.project);
      publish({ activeConversation: result.conversation });
      return result.message;
    },
    clearError(): void {
      if (!destroyed && state.error !== null) publish({ error: null });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
    },
  };
  options.onState(state);
  return Object.freeze(controller);
}

function freezeState(value: AiProjectControllerState): AiProjectControllerState {
  return Object.freeze({
    ...value,
    conversations: Object.freeze([...value.conversations]),
  });
}
