import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, rm, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  AI_PROJECT_MAX_CONVERSATIONS,
  AI_PROJECT_MAX_MESSAGES_PER_CONVERSATION,
  AI_PROJECT_MAX_MESSAGES_TOTAL,
  AI_PROJECT_MESSAGE_MAX_BYTES,
  AI_PROJECT_SCHEMA_VERSION,
  AI_PROJECT_SOURCE_FINGERPRINT_MAX_LENGTH,
  AI_PROJECT_STORE_MAX_BYTES,
  aiProjectFailure,
  isConversationId,
  isWorkspaceId,
  normalizeAiConversationTitle,
  validateAppendAiConversationMessageRequest,
  validateCreateAiConversationRequest,
  validateDeleteAiConversationRequest,
  validateOpenAiProjectRequest,
  validateReadAiConversationRequest,
  validateRenameAiConversationRequest,
  validateSetAiConversationArchivedRequest,
  type AiConversationCreateResult,
  type AiConversationDeleteResult,
  type AiConversationMessage,
  type AiConversationMessageAppendResult,
  type AiConversationReadResult,
  type AiConversationSnapshot,
  type AiConversationState,
  type AiConversationUpdateResult,
  type AiProjectFailure,
  type AiProjectOpenResult,
  type AiProjectSnapshot,
  type AppendAiConversationMessageRequest,
  type CreateAiConversationRequest,
  type DeleteAiConversationRequest,
  type RenameAiConversationRequest,
  type SetAiConversationArchivedRequest,
} from "../../src/shared/ai-project.js";

const STORE_FILE_NAME = "ai-project.json";
const PROJECT_ID_PATTERN =
  /^ai-project-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const MESSAGE_ID_PATTERN =
  /^message-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KIND_DIRECTORIES = Object.freeze({
  project: "Projects",
  sandbox: "Sandboxes",
  test: "Tests",
} as const);
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

interface StoredAiConversation {
  readonly id: string;
  readonly title: string;
  readonly state: AiConversationState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messages: readonly AiConversationMessage[];
}

interface StoredAiProject {
  readonly schemaVersion: typeof AI_PROJECT_SCHEMA_VERSION;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly conversations: readonly StoredAiConversation[];
}

export interface AiProjectStore {
  open(request: unknown): Promise<AiProjectOpenResult>;
  createConversation(request: unknown): Promise<AiConversationCreateResult>;
  readConversation(request: unknown): Promise<AiConversationReadResult>;
  renameConversation(request: unknown): Promise<AiConversationUpdateResult>;
  setConversationArchived(request: unknown): Promise<AiConversationUpdateResult>;
  deleteConversation(request: unknown): Promise<AiConversationDeleteResult>;
  appendMessage(request: unknown): Promise<AiConversationMessageAppendResult>;
}

export function createAiProjectStore(rootPath: string): AiProjectStore {
  if (typeof rootPath !== "string" || !isAbsolute(rootPath) || rootPath.includes("\0")) {
    throw new TypeError("AI Project 工作区根目录必须是合法绝对路径");
  }
  const mutationQueues = new Map<string, Promise<void>>();

  const serialize = <T>(workspaceId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = mutationQueues.get(workspaceId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    mutationQueues.set(workspaceId, settled);
    void settled.finally(() => {
      if (mutationQueues.get(workspaceId) === settled) mutationQueues.delete(workspaceId);
    });
    return result;
  };

  return Object.freeze({
    async open(request: unknown): Promise<AiProjectOpenResult> {
      const validated = validateOpenAiProjectRequest(request);
      if (validated === null) return invalidRequest();
      return serialize(validated.workspaceId, async () => {
        const location = await resolveStoreLocation(rootPath, validated.workspaceId);
        if (location.status === "failed") return location;
        let stored: StoredAiProject | null;
        try {
          stored = await readStoredProject(location.path, validated.workspaceId);
        } catch (error: unknown) {
          return classifyReadFailure(error);
        }
        if (stored === null) {
          const now = new Date().toISOString();
          stored = freezeStoredProject({
            schemaVersion: AI_PROJECT_SCHEMA_VERSION,
            projectId: `ai-project-${randomUUID()}`,
            workspaceId: validated.workspaceId,
            revision: 0,
            createdAt: now,
            updatedAt: now,
            conversations: Object.freeze([]),
          });
          const saved = await writeProject(location.path, stored);
          if (saved !== null) return saved;
        }
        return Object.freeze({ status: "ready", project: toProjectSnapshot(stored) });
      });
    },

    async createConversation(request: unknown): Promise<AiConversationCreateResult> {
      const validated = validateCreateAiConversationRequest(request);
      if (validated === null) return invalidRequest();
      return serialize(validated.workspaceId, () =>
        mutateProject(rootPath, validated, (current, now) => {
          if (current.conversations.length >= AI_PROJECT_MAX_CONVERSATIONS) {
            return capacityFailure("每个 AI Project 最多保留 64 个对话；请删除不需要的旧对话。");
          }
          const conversation = freezeStoredConversation({
            id: `conversation-${randomUUID()}`,
            title: validated.title,
            state: "active",
            createdAt: now,
            updatedAt: now,
            messages: Object.freeze([]),
          });
          return {
            next: nextProject(current, now, [...current.conversations, conversation]),
            value: conversation,
          };
        }).then((result) => {
          if (result.status === "failed") return result;
          return Object.freeze({
            status: "created",
            project: toProjectSnapshot(result.project),
            conversation: toConversationSnapshot(result.value),
          });
        }),
      );
    },

    async readConversation(request: unknown): Promise<AiConversationReadResult> {
      const validated = validateReadAiConversationRequest(request);
      if (validated === null) return invalidRequest();
      const loaded = await loadExistingProject(rootPath, validated.workspaceId);
      if (loaded.status === "failed") return loaded;
      const conversation = loaded.project.conversations.find(
        (candidate) => candidate.id === validated.conversationId,
      );
      return conversation === undefined
        ? conversationNotFound()
        : Object.freeze({ status: "ready", conversation: toConversationSnapshot(conversation) });
    },

    async renameConversation(request: unknown): Promise<AiConversationUpdateResult> {
      const validated = validateRenameAiConversationRequest(request);
      if (validated === null) return invalidRequest();
      return serialize(validated.workspaceId, () =>
        updateConversation(rootPath, validated, (current, now) =>
          freezeStoredConversation({ ...current, title: validated.title, updatedAt: now }),
        ),
      );
    },

    async setConversationArchived(request: unknown): Promise<AiConversationUpdateResult> {
      const validated = validateSetAiConversationArchivedRequest(request);
      if (validated === null) return invalidRequest();
      return serialize(validated.workspaceId, () =>
        updateConversation(rootPath, validated, (current, now) =>
          freezeStoredConversation({
            ...current,
            state: validated.archived ? "archived" : "active",
            updatedAt: now,
          }),
        ),
      );
    },

    async deleteConversation(request: unknown): Promise<AiConversationDeleteResult> {
      const validated = validateDeleteAiConversationRequest(request);
      if (validated === null) return invalidRequest();
      return serialize(validated.workspaceId, () =>
        mutateProject(rootPath, validated, (current, now) => {
          const index = current.conversations.findIndex(
            (candidate) => candidate.id === validated.conversationId,
          );
          if (index < 0) return conversationNotFound();
          const conversations = current.conversations.filter(
            (_, candidateIndex) => candidateIndex !== index,
          );
          return {
            next: nextProject(current, now, conversations),
            value: validated.conversationId,
          };
        }).then((result) => {
          if (result.status === "failed") return result;
          return Object.freeze({
            status: "deleted",
            project: toProjectSnapshot(result.project),
            conversationId: result.value,
          });
        }),
      );
    },

    async appendMessage(request: unknown): Promise<AiConversationMessageAppendResult> {
      const validated = validateAppendAiConversationMessageRequest(request);
      if (validated === null) return invalidRequest();
      return serialize(validated.workspaceId, () => appendMessage(rootPath, validated));
    },
  });
}

async function appendMessage(
  rootPath: string,
  request: AppendAiConversationMessageRequest,
): Promise<AiConversationMessageAppendResult> {
  const mutation = await mutateProject(rootPath, request, (current, now) => {
    const index = current.conversations.findIndex(
      (candidate) => candidate.id === request.conversationId,
    );
    if (index < 0) return conversationNotFound();
    const conversation = current.conversations[index];
    if (conversation === undefined) return conversationNotFound();
    if (
      conversation.messages.length >= AI_PROJECT_MAX_MESSAGES_PER_CONVERSATION ||
      totalMessageCount(current) >= AI_PROJECT_MAX_MESSAGES_TOTAL
    ) {
      return capacityFailure("AI Project 对话历史已达到本地容量上限；请新建或删除对话。");
    }
    const message: AiConversationMessage = Object.freeze({
      id: `message-${randomUUID()}`,
      role: request.role,
      content: request.content,
      sourceFingerprint: request.sourceFingerprint,
      createdAt: now,
    });
    const updated = freezeStoredConversation({
      ...conversation,
      updatedAt: now,
      messages: Object.freeze([...conversation.messages, message]),
    });
    const conversations = replaceAt(current.conversations, index, updated);
    return {
      next: nextProject(current, now, conversations),
      value: { conversation: updated, message },
    };
  });
  if (mutation.status === "failed") return mutation;
  return Object.freeze({
    status: "appended",
    project: toProjectSnapshot(mutation.project),
    conversation: toConversationSnapshot(mutation.value.conversation),
    message: Object.freeze({ ...mutation.value.message }),
  });
}

async function updateConversation(
  rootPath: string,
  request: RenameAiConversationRequest | SetAiConversationArchivedRequest,
  update: (current: StoredAiConversation, now: string) => StoredAiConversation,
): Promise<AiConversationUpdateResult> {
  const mutation = await mutateProject(rootPath, request, (current, now) => {
    const index = current.conversations.findIndex(
      (candidate) => candidate.id === request.conversationId,
    );
    if (index < 0) return conversationNotFound();
    const conversation = current.conversations[index];
    if (conversation === undefined) return conversationNotFound();
    const updated = update(conversation, now);
    return {
      next: nextProject(current, now, replaceAt(current.conversations, index, updated)),
      value: updated,
    };
  });
  if (mutation.status === "failed") return mutation;
  return Object.freeze({
    status: "updated",
    project: toProjectSnapshot(mutation.project),
    conversation: toConversationSnapshot(mutation.value),
  });
}

type MutationPlan<T> = { readonly next: StoredAiProject; readonly value: T } | AiProjectFailure;

type MutationResult<T> =
  | { readonly status: "saved"; readonly project: StoredAiProject; readonly value: T }
  | AiProjectFailure;

function isMutationFailure<T>(plan: MutationPlan<T>): plan is AiProjectFailure {
  return "status" in plan && plan.status === "failed";
}

async function mutateProject<T>(
  rootPath: string,
  request: { readonly workspaceId: string; readonly expectedRevision: number },
  plan: (current: StoredAiProject, now: string) => MutationPlan<T>,
): Promise<MutationResult<T>> {
  const loaded = await loadExistingProject(rootPath, request.workspaceId);
  if (loaded.status === "failed") return loaded;
  if (loaded.project.revision !== request.expectedRevision) return conflictFailure();
  const planned = plan(loaded.project, new Date().toISOString());
  if (isMutationFailure(planned)) return planned;
  const writeFailure = await writeProject(loaded.path, planned.next);
  return (
    writeFailure ?? Object.freeze({ status: "saved", project: planned.next, value: planned.value })
  );
}

async function loadExistingProject(
  rootPath: string,
  workspaceId: string,
): Promise<
  | { readonly status: "ready"; readonly path: string; readonly project: StoredAiProject }
  | AiProjectFailure
> {
  const location = await resolveStoreLocation(rootPath, workspaceId);
  if (location.status === "failed") return location;
  try {
    const stored = await readStoredProject(location.path, workspaceId);
    return stored === null
      ? aiProjectFailure("AI_PROJECT_NOT_FOUND", "当前工作区还没有 AI Project；请先打开项目。")
      : Object.freeze({ status: "ready", path: location.path, project: stored });
  } catch (error: unknown) {
    return classifyReadFailure(error);
  }
}

async function resolveStoreLocation(
  rootPath: string,
  workspaceId: string,
): Promise<{ readonly status: "ready"; readonly path: string } | AiProjectFailure> {
  if (!isWorkspaceId(workspaceId)) return invalidRequest();
  if (!(await realDirectory(rootPath))) {
    return aiProjectFailure("AI_PROJECT_WORKSPACE_NOT_FOUND", "托管工作区不可用。");
  }
  const separator = workspaceId.indexOf("-");
  const kind = workspaceId.slice(0, separator) as keyof typeof KIND_DIRECTORIES;
  const kindPath = join(rootPath, KIND_DIRECTORIES[kind]);
  if (!(await realDirectory(kindPath))) {
    return aiProjectFailure("AI_PROJECT_WORKSPACE_NOT_FOUND", "工作区分类目录不存在。");
  }
  const entryPath = join(kindPath, workspaceId);
  if (!(await realDirectory(entryPath))) {
    return aiProjectFailure("AI_PROJECT_WORKSPACE_NOT_FOUND", "工作区条目不存在。");
  }
  return Object.freeze({ status: "ready", path: join(entryPath, STORE_FILE_NAME) });
}

async function realDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function readStoredProject(
  path: string,
  workspaceId: string,
): Promise<StoredAiProject | null> {
  let text: string;
  try {
    text = await readRegularUtf8(path, AI_PROJECT_STORE_MAX_BYTES);
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw storeReadError("corrupt");
  }
  if (!isStoredProject(value, workspaceId)) throw storeReadError("corrupt");
  return freezeStoredProject(value);
}

async function readRegularUtf8(path: string, maxBytes: number): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) throw storeReadError("corrupt");
    if (stat.size > maxBytes) throw storeReadError("too-large");
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const result = await handle.read(buffer, offset, buffer.byteLength - offset, null);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    if (offset > maxBytes) throw storeReadError("too-large");
    return utf8Decoder.decode(buffer.subarray(0, offset));
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function writeProject(
  path: string,
  project: StoredAiProject,
): Promise<AiProjectFailure | null> {
  const serialized = `${JSON.stringify(project, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > AI_PROJECT_STORE_MAX_BYTES) {
    return aiProjectFailure("AI_PROJECT_TOO_LARGE", "AI Project 已达到 4 MiB 本地存储上限。");
  }
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
    return null;
  } catch {
    return aiProjectFailure("AI_PROJECT_WRITE_FAILED", "无法原子保存 AI Project 对话。");
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function isStoredProject(value: unknown, workspaceId: string): value is StoredAiProject {
  if (
    !isExactObject(value, [
      "conversations",
      "createdAt",
      "projectId",
      "revision",
      "schemaVersion",
      "updatedAt",
      "workspaceId",
    ])
  ) {
    return false;
  }
  const project = value as Record<string, unknown>;
  if (
    project.schemaVersion !== AI_PROJECT_SCHEMA_VERSION ||
    typeof project.projectId !== "string" ||
    !PROJECT_ID_PATTERN.test(project.projectId) ||
    project.workspaceId !== workspaceId ||
    !Number.isSafeInteger(project.revision) ||
    (project.revision as number) < 0 ||
    !validTimestamp(project.createdAt) ||
    !validTimestamp(project.updatedAt) ||
    !Array.isArray(project.conversations) ||
    project.conversations.length > AI_PROJECT_MAX_CONVERSATIONS ||
    !project.conversations.every(isStoredConversation)
  ) {
    return false;
  }
  const conversations = project.conversations as StoredAiConversation[];
  if (new Set(conversations.map((conversation) => conversation.id)).size !== conversations.length) {
    return false;
  }
  return (
    conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0) <=
    AI_PROJECT_MAX_MESSAGES_TOTAL
  );
}

function isStoredConversation(value: unknown): value is StoredAiConversation {
  if (!isExactObject(value, ["createdAt", "id", "messages", "state", "title", "updatedAt"])) {
    return false;
  }
  const conversation = value as Record<string, unknown>;
  if (
    !isConversationId(conversation.id) ||
    normalizeAiConversationTitle(conversation.title) !== conversation.title ||
    (conversation.state !== "active" && conversation.state !== "archived") ||
    !validTimestamp(conversation.createdAt) ||
    !validTimestamp(conversation.updatedAt) ||
    !Array.isArray(conversation.messages) ||
    conversation.messages.length > AI_PROJECT_MAX_MESSAGES_PER_CONVERSATION ||
    !conversation.messages.every(isStoredMessage)
  ) {
    return false;
  }
  const messages = conversation.messages as AiConversationMessage[];
  return new Set(messages.map((message) => message.id)).size === messages.length;
}

function isStoredMessage(value: unknown): value is AiConversationMessage {
  if (!isExactObject(value, ["content", "createdAt", "id", "role", "sourceFingerprint"])) {
    return false;
  }
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    MESSAGE_ID_PATTERN.test(message.id) &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.trim().length > 0 &&
    !message.content.includes("\0") &&
    Buffer.byteLength(message.content, "utf8") <= AI_PROJECT_MESSAGE_MAX_BYTES &&
    (message.sourceFingerprint === null ||
      (typeof message.sourceFingerprint === "string" &&
        message.sourceFingerprint.length > 0 &&
        message.sourceFingerprint.length <= AI_PROJECT_SOURCE_FINGERPRINT_MAX_LENGTH &&
        !message.sourceFingerprint.includes("\0"))) &&
    validTimestamp(message.createdAt)
  );
}

function nextProject(
  current: StoredAiProject,
  now: string,
  conversations: readonly StoredAiConversation[],
): StoredAiProject {
  return freezeStoredProject({
    ...current,
    revision: current.revision + 1,
    updatedAt: now,
    conversations: Object.freeze([...conversations]),
  });
}

function freezeStoredProject(project: StoredAiProject): StoredAiProject {
  return Object.freeze({
    ...project,
    conversations: Object.freeze(project.conversations.map(freezeStoredConversation)),
  });
}

function freezeStoredConversation(conversation: StoredAiConversation): StoredAiConversation {
  return Object.freeze({
    ...conversation,
    messages: Object.freeze(conversation.messages.map((message) => Object.freeze({ ...message }))),
  });
}

function toProjectSnapshot(project: StoredAiProject): AiProjectSnapshot {
  return Object.freeze({
    schemaVersion: project.schemaVersion,
    projectId: project.projectId,
    workspaceId: project.workspaceId,
    revision: project.revision,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    conversations: Object.freeze(
      [...project.conversations]
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
        .map((conversation) =>
          Object.freeze({
            id: conversation.id,
            title: conversation.title,
            state: conversation.state,
            messageCount: conversation.messages.length,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
          }),
        ),
    ),
  });
}

function toConversationSnapshot(conversation: StoredAiConversation): AiConversationSnapshot {
  return Object.freeze({
    id: conversation.id,
    title: conversation.title,
    state: conversation.state,
    messageCount: conversation.messages.length,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: Object.freeze(conversation.messages.map((message) => Object.freeze({ ...message }))),
  });
}

function totalMessageCount(project: Pick<StoredAiProject, "conversations">): number {
  return project.conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0);
}

function replaceAt<T>(values: readonly T[], index: number, value: T): readonly T[] {
  return Object.freeze(
    values.map((candidate, candidateIndex) => (candidateIndex === index ? value : candidate)),
  );
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isExactObject(value: unknown, expectedKeys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function invalidRequest(): AiProjectFailure {
  return aiProjectFailure("AI_PROJECT_INVALID_REQUEST", "AI Project 请求格式无效。");
}

function conflictFailure(): AiProjectFailure {
  return aiProjectFailure("AI_PROJECT_CONFLICT", "AI Project 已更新；请重新载入后再操作。");
}

function conversationNotFound(): AiProjectFailure {
  return aiProjectFailure("AI_PROJECT_CONVERSATION_NOT_FOUND", "找不到指定 AI 对话。");
}

function capacityFailure(message: string): AiProjectFailure {
  return aiProjectFailure("AI_PROJECT_CAPACITY_EXCEEDED", message);
}

function classifyReadFailure(error: unknown): AiProjectFailure {
  if (isStoreReadError(error, "too-large")) {
    return aiProjectFailure("AI_PROJECT_TOO_LARGE", "AI Project 文件超过本地存储上限。");
  }
  if (isStoreReadError(error, "corrupt") || isNodeError(error, "ELOOP")) {
    return aiProjectFailure(
      "AI_PROJECT_CORRUPT_STORE",
      "AI Project 文件损坏或版本不受支持；原文件保持不变。",
    );
  }
  return aiProjectFailure("AI_PROJECT_READ_FAILED", "无法读取 AI Project 对话。");
}

function storeReadError(kind: "corrupt" | "too-large"): Error & { readonly kind: string } {
  return Object.assign(new Error(`ai-project-${kind}`), { kind });
}

function isStoreReadError(error: unknown, kind: string): boolean {
  return error instanceof Error && "kind" in error && error.kind === kind;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
