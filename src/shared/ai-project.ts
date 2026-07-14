export const AI_PROJECT_SCHEMA_VERSION = 1 as const;
export const AI_PROJECT_STORE_MAX_BYTES = 4 * 1024 * 1024;
export const AI_PROJECT_MAX_CONVERSATIONS = 64;
export const AI_PROJECT_MAX_MESSAGES_PER_CONVERSATION = 256;
export const AI_PROJECT_MAX_MESSAGES_TOTAL = 2_048;
export const AI_PROJECT_MESSAGE_MAX_BYTES = 64 * 1024;
export const AI_PROJECT_TITLE_MAX_CODE_POINTS = 80;
export const AI_PROJECT_SOURCE_FINGERPRINT_MAX_LENGTH = 128;

export const AI_PROJECT_IPC_CHANNELS = Object.freeze({
  open: "ai-project:open",
  createConversation: "ai-project:conversation-create",
  readConversation: "ai-project:conversation-read",
  renameConversation: "ai-project:conversation-rename",
  setConversationArchived: "ai-project:conversation-set-archived",
  deleteConversation: "ai-project:conversation-delete",
  appendMessage: "ai-project:message-append",
});

export type AiConversationState = "active" | "archived";
export type AiConversationMessageRole = "user" | "assistant";

export type AiProjectErrorCode =
  | "AI_PROJECT_CAPACITY_EXCEEDED"
  | "AI_PROJECT_CONFLICT"
  | "AI_PROJECT_CONTEXT_CLOSED"
  | "AI_PROJECT_CONVERSATION_NOT_FOUND"
  | "AI_PROJECT_CORRUPT_STORE"
  | "AI_PROJECT_INVALID_REQUEST"
  | "AI_PROJECT_NOT_FOUND"
  | "AI_PROJECT_READ_FAILED"
  | "AI_PROJECT_TOO_LARGE"
  | "AI_PROJECT_WORKSPACE_NOT_FOUND"
  | "AI_PROJECT_WRITE_FAILED";

export interface AiProjectError {
  readonly code: AiProjectErrorCode;
  readonly message: string;
}

export interface AiConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly state: AiConversationState;
  readonly messageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AiProjectSnapshot {
  readonly schemaVersion: typeof AI_PROJECT_SCHEMA_VERSION;
  readonly projectId: string;
  /** Opaque managed-workspace ID. An absolute filesystem path never crosses this boundary. */
  readonly workspaceId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly conversations: readonly AiConversationSummary[];
}

export interface AiConversationMessage {
  readonly id: string;
  readonly role: AiConversationMessageRole;
  readonly content: string;
  /** Evidence binding only; null means that the turn was not bound to a source snapshot. */
  readonly sourceFingerprint: string | null;
  readonly createdAt: string;
}

export interface AiConversationSnapshot extends AiConversationSummary {
  readonly messages: readonly AiConversationMessage[];
}

export interface OpenAiProjectRequest {
  readonly workspaceId: string;
}

export interface CreateAiConversationRequest extends OpenAiProjectRequest {
  readonly expectedRevision: number;
  readonly title: string;
}

export interface ReadAiConversationRequest extends OpenAiProjectRequest {
  readonly conversationId: string;
}

export interface RenameAiConversationRequest extends ReadAiConversationRequest {
  readonly expectedRevision: number;
  readonly title: string;
}

export interface SetAiConversationArchivedRequest extends ReadAiConversationRequest {
  readonly expectedRevision: number;
  readonly archived: boolean;
}

export interface DeleteAiConversationRequest extends ReadAiConversationRequest {
  readonly expectedRevision: number;
}

export interface AppendAiConversationMessageRequest extends ReadAiConversationRequest {
  readonly expectedRevision: number;
  readonly role: AiConversationMessageRole;
  readonly content: string;
  readonly sourceFingerprint: string | null;
}

export type AiProjectFailure = { readonly status: "failed"; readonly error: AiProjectError };

export type AiProjectOpenResult =
  { readonly status: "ready"; readonly project: AiProjectSnapshot } | AiProjectFailure;

export type AiConversationCreateResult =
  | {
      readonly status: "created";
      readonly project: AiProjectSnapshot;
      readonly conversation: AiConversationSnapshot;
    }
  | AiProjectFailure;

export type AiConversationReadResult =
  { readonly status: "ready"; readonly conversation: AiConversationSnapshot } | AiProjectFailure;

export type AiConversationUpdateResult =
  | {
      readonly status: "updated";
      readonly project: AiProjectSnapshot;
      readonly conversation: AiConversationSnapshot;
    }
  | AiProjectFailure;

export type AiConversationDeleteResult =
  | {
      readonly status: "deleted";
      readonly project: AiProjectSnapshot;
      readonly conversationId: string;
    }
  | AiProjectFailure;

export type AiConversationMessageAppendResult =
  | {
      readonly status: "appended";
      readonly project: AiProjectSnapshot;
      readonly conversation: AiConversationSnapshot;
      readonly message: AiConversationMessage;
    }
  | AiProjectFailure;

const WORKSPACE_ID_PATTERN =
  /^(project|sandbox|test)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const CONVERSATION_ID_PATTERN =
  /^conversation-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function aiProjectFailure(code: AiProjectErrorCode, message: string): AiProjectFailure {
  return Object.freeze({ status: "failed", error: Object.freeze({ code, message }) });
}

export function validateOpenAiProjectRequest(value: unknown): OpenAiProjectRequest | null {
  if (!isExactObject(value, ["workspaceId"])) return null;
  const workspaceId = (value as Record<string, unknown>).workspaceId;
  return isWorkspaceId(workspaceId) ? Object.freeze({ workspaceId }) : null;
}

export function validateCreateAiConversationRequest(
  value: unknown,
): CreateAiConversationRequest | null {
  if (!isExactObject(value, ["expectedRevision", "title", "workspaceId"])) return null;
  const request = value as Record<string, unknown>;
  const title = normalizeAiConversationTitle(request.title);
  return isWorkspaceId(request.workspaceId) &&
    isRevision(request.expectedRevision) &&
    title !== null
    ? Object.freeze({
        workspaceId: request.workspaceId,
        expectedRevision: request.expectedRevision,
        title,
      })
    : null;
}

export function validateReadAiConversationRequest(
  value: unknown,
): ReadAiConversationRequest | null {
  if (!isExactObject(value, ["conversationId", "workspaceId"])) return null;
  const request = value as Record<string, unknown>;
  return isWorkspaceId(request.workspaceId) && isConversationId(request.conversationId)
    ? Object.freeze({
        workspaceId: request.workspaceId,
        conversationId: request.conversationId,
      })
    : null;
}

export function validateRenameAiConversationRequest(
  value: unknown,
): RenameAiConversationRequest | null {
  if (!isExactObject(value, ["conversationId", "expectedRevision", "title", "workspaceId"])) {
    return null;
  }
  const request = value as Record<string, unknown>;
  const title = normalizeAiConversationTitle(request.title);
  return isWorkspaceId(request.workspaceId) &&
    isConversationId(request.conversationId) &&
    isRevision(request.expectedRevision) &&
    title !== null
    ? Object.freeze({
        workspaceId: request.workspaceId,
        conversationId: request.conversationId,
        expectedRevision: request.expectedRevision,
        title,
      })
    : null;
}

export function validateSetAiConversationArchivedRequest(
  value: unknown,
): SetAiConversationArchivedRequest | null {
  if (!isExactObject(value, ["archived", "conversationId", "expectedRevision", "workspaceId"])) {
    return null;
  }
  const request = value as Record<string, unknown>;
  return isWorkspaceId(request.workspaceId) &&
    isConversationId(request.conversationId) &&
    isRevision(request.expectedRevision) &&
    typeof request.archived === "boolean"
    ? Object.freeze({
        workspaceId: request.workspaceId,
        conversationId: request.conversationId,
        expectedRevision: request.expectedRevision,
        archived: request.archived,
      })
    : null;
}

export function validateDeleteAiConversationRequest(
  value: unknown,
): DeleteAiConversationRequest | null {
  if (!isExactObject(value, ["conversationId", "expectedRevision", "workspaceId"])) return null;
  const request = value as Record<string, unknown>;
  return isWorkspaceId(request.workspaceId) &&
    isConversationId(request.conversationId) &&
    isRevision(request.expectedRevision)
    ? Object.freeze({
        workspaceId: request.workspaceId,
        conversationId: request.conversationId,
        expectedRevision: request.expectedRevision,
      })
    : null;
}

export function validateAppendAiConversationMessageRequest(
  value: unknown,
): AppendAiConversationMessageRequest | null {
  if (
    !isExactObject(value, [
      "content",
      "conversationId",
      "expectedRevision",
      "role",
      "sourceFingerprint",
      "workspaceId",
    ])
  ) {
    return null;
  }
  const request = value as Record<string, unknown>;
  if (
    !isWorkspaceId(request.workspaceId) ||
    !isConversationId(request.conversationId) ||
    !isRevision(request.expectedRevision) ||
    (request.role !== "user" && request.role !== "assistant") ||
    !validMessageContent(request.content) ||
    !validSourceFingerprint(request.sourceFingerprint)
  ) {
    return null;
  }
  return Object.freeze({
    workspaceId: request.workspaceId,
    conversationId: request.conversationId,
    expectedRevision: request.expectedRevision,
    role: request.role,
    content: request.content,
    sourceFingerprint: request.sourceFingerprint,
  });
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_ID_PATTERN.test(value);
}

export function isConversationId(value: unknown): value is string {
  return typeof value === "string" && CONVERSATION_ID_PATTERN.test(value);
}

export function normalizeAiConversationTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim().normalize("NFC");
  return title.length > 0 &&
    [...title].length <= AI_PROJECT_TITLE_MAX_CODE_POINTS &&
    !/\p{Cc}/u.test(title)
    ? title
    : null;
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validMessageContent(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.includes("\0") &&
    new TextEncoder().encode(value).byteLength <= AI_PROJECT_MESSAGE_MAX_BYTES
  );
}

function validSourceFingerprint(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= AI_PROJECT_SOURCE_FINGERPRINT_MAX_LENGTH &&
      !value.includes("\0"))
  );
}

function isExactObject(value: unknown, expectedKeys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
