import { AI_MENTOR_TURN_MAX_LENGTH } from "./ai-provider.js";
import { AI_PROJECT_MESSAGE_MAX_BYTES } from "./ai-project.js";
import { isInterfaceLocale, type InterfaceLocale } from "./interface-locale.js";

export const AI_WINDOW_IPC_CHANNELS = Object.freeze({
  open: "ai-window:open",
  toggle: "ai-window:toggle",
  publishState: "ai-window:state-publish",
  state: "ai-window:state",
  intent: "ai-window:intent",
  ready: "ai-window:ready",
  closed: "ai-window:closed",
});

export const AI_WINDOW_STATE_MAX_BYTES = 5 * 1024 * 1024;
export type AiWindowPermissionMode = "read-only" | "review" | "agent";
export type AiWindowMessageState = "complete" | "streaming" | "error" | "stopped";
export type AiWindowBackground = "white" | "paper" | "cool";
export type AiWindowTheme = "light" | "dark";

export interface AiWindowConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedLabel?: string | undefined;
}

export interface AiWindowProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly conversations: readonly AiWindowConversationSummary[];
}

export interface AiWindowMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly state?: AiWindowMessageState | undefined;
  readonly changeSummary?: string | undefined;
}

export interface AiWindowPendingReview {
  readonly id: string;
  readonly summary: string;
  readonly diffSummary: string;
}

export interface AiWindowViewState {
  readonly projects: readonly AiWindowProjectSummary[];
  readonly activeProjectId: string | null;
  readonly activeConversationId: string | null;
  readonly messages: readonly AiWindowMessage[];
  readonly mode: AiWindowPermissionMode;
  readonly availableModes: readonly AiWindowPermissionMode[];
  readonly modelLabel: string;
  readonly suggestedQuestions?: readonly string[] | undefined;
  readonly isResponding?: boolean | undefined;
  readonly pendingReview?: AiWindowPendingReview | null | undefined;
}

export interface AiWindowStateEnvelope {
  readonly sequence: number;
  readonly locale: InterfaceLocale;
  readonly background: AiWindowBackground;
  readonly theme: AiWindowTheme;
  readonly state: AiWindowViewState;
}

export type AiWindowIntent =
  | {
      readonly type: "send";
      readonly prompt: string;
      readonly projectId: string;
      readonly conversationId: string | null;
      readonly mode: AiWindowPermissionMode;
    }
  | { readonly type: "cancel" }
  | { readonly type: "select-project"; readonly projectId: string }
  | {
      readonly type: "select-conversation";
      readonly projectId: string;
      readonly conversationId: string;
    }
  | { readonly type: "new-conversation"; readonly projectId: string }
  | { readonly type: "mode-change"; readonly mode: AiWindowPermissionMode }
  | { readonly type: "open-model-settings" }
  | { readonly type: "review-decision"; readonly reviewId: string; readonly accepted: boolean }
  | { readonly type: "close" };

export type AiWindowCommandResult =
  | { readonly status: "ok" }
  | {
      readonly status: "failed";
      readonly code: "INVALID_CONTEXT" | "INVALID_PAYLOAD" | "WINDOW_UNAVAILABLE";
    };

export interface AiWindowHostApi {
  openAiWindow(): Promise<AiWindowCommandResult>;
  toggleAiWindow(): Promise<AiWindowCommandResult>;
  publishAiWindowState(state: AiWindowStateEnvelope): Promise<AiWindowCommandResult>;
  onAiWindowIntent(handler: (intent: AiWindowIntent) => void): () => void;
  onAiWindowClosed(handler: () => void): () => void;
}

export interface AiWindowClientApi {
  ready(): Promise<AiWindowCommandResult>;
  sendIntent(intent: AiWindowIntent): Promise<AiWindowCommandResult>;
  onState(handler: (state: AiWindowStateEnvelope) => void): () => void;
}

const MODE_ORDER: readonly AiWindowPermissionMode[] = Object.freeze([
  "read-only",
  "review",
  "agent",
]);
const UUID_V4_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const PROJECT_ID_PATTERN = new RegExp(`^ai-project-${UUID_V4_PATTERN}$`, "u");
const CONVERSATION_ID_PATTERN = new RegExp(`^conversation-${UUID_V4_PATTERN}$`, "u");
const MESSAGE_ID_PATTERN = new RegExp(
  `^(?:message-${UUID_V4_PATTERN}|ai-(?:error|pending):[0-9]+)$`,
  "u",
);

export function validateAiWindowStateEnvelope(value: unknown): AiWindowStateEnvelope | null {
  if (!isExactObject(value, ["background", "locale", "sequence", "state", "theme"])) return null;
  const envelope = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(envelope.sequence) ||
    (envelope.sequence as number) < 0 ||
    !isInterfaceLocale(envelope.locale) ||
    !isBackground(envelope.background) ||
    !isTheme(envelope.theme)
  ) {
    return null;
  }
  const state = validateViewState(envelope.state);
  if (state === null) return null;
  const result = Object.freeze({
    sequence: envelope.sequence as number,
    locale: envelope.locale,
    background: envelope.background,
    theme: envelope.theme,
    state,
  });
  return encodedLength(result) <= AI_WINDOW_STATE_MAX_BYTES ? result : null;
}

export function validateAiWindowIntent(value: unknown): AiWindowIntent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "cancel" || value.type === "open-model-settings" || value.type === "close") {
    return isExactObject(value, ["type"])
      ? (Object.freeze({ type: value.type }) as AiWindowIntent)
      : null;
  }
  if (value.type === "mode-change") {
    return isExactObject(value, ["mode", "type"]) && isMode(value.mode)
      ? Object.freeze({ type: value.type, mode: value.mode })
      : null;
  }
  if (value.type === "select-project" || value.type === "new-conversation") {
    return isExactObject(value, ["projectId", "type"]) && isProjectId(value.projectId)
      ? Object.freeze({ type: value.type, projectId: value.projectId })
      : null;
  }
  if (value.type === "select-conversation") {
    return isExactObject(value, ["conversationId", "projectId", "type"]) &&
      isProjectId(value.projectId) &&
      isConversationId(value.conversationId)
      ? Object.freeze({
          type: value.type,
          projectId: value.projectId,
          conversationId: value.conversationId,
        })
      : null;
  }
  if (value.type === "review-decision") {
    return isExactObject(value, ["accepted", "reviewId", "type"]) &&
      validText(value.reviewId, 1, 160) &&
      typeof value.accepted === "boolean"
      ? Object.freeze({ type: value.type, reviewId: value.reviewId, accepted: value.accepted })
      : null;
  }
  if (value.type === "send") {
    const prompt = normalizeText(value.prompt);
    return isExactObject(value, ["conversationId", "mode", "projectId", "prompt", "type"]) &&
      prompt !== null &&
      [...prompt].length <= AI_MENTOR_TURN_MAX_LENGTH &&
      isProjectId(value.projectId) &&
      (value.conversationId === null || isConversationId(value.conversationId)) &&
      isMode(value.mode)
      ? Object.freeze({
          type: value.type,
          prompt,
          projectId: value.projectId,
          conversationId: value.conversationId,
          mode: value.mode,
        })
      : null;
  }
  return null;
}

function validateViewState(value: unknown): AiWindowViewState | null {
  if (
    !isExactObject(
      value,
      [
        "activeConversationId",
        "activeProjectId",
        "availableModes",
        "isResponding",
        "messages",
        "mode",
        "modelLabel",
        "pendingReview",
        "projects",
        "suggestedQuestions",
      ],
      ["isResponding", "pendingReview", "suggestedQuestions"],
    )
  ) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    !Array.isArray(record.projects) ||
    record.projects.length > 16 ||
    !Array.isArray(record.messages) ||
    record.messages.length > 256 ||
    !Array.isArray(record.availableModes) ||
    record.availableModes.length < 1 ||
    record.availableModes.length > MODE_ORDER.length ||
    !isMode(record.mode) ||
    !validText(record.modelLabel, 1, 256) ||
    (record.isResponding !== undefined && typeof record.isResponding !== "boolean")
  ) {
    return null;
  }
  const projects = record.projects.map(validateProject);
  const messages = record.messages.map(validateMessage);
  const modes = record.availableModes.filter(isMode);
  if (
    projects.some((item) => item === null) ||
    messages.some((item) => item === null) ||
    modes.length !== record.availableModes.length ||
    new Set(modes).size !== modes.length ||
    !modes.includes(record.mode)
  ) {
    return null;
  }
  if (
    record.activeProjectId !== null &&
    (!isProjectId(record.activeProjectId) ||
      !projects.some((project) => project?.id === record.activeProjectId))
  ) {
    return null;
  }
  if (
    record.activeConversationId !== null &&
    (!isConversationId(record.activeConversationId) ||
      !projects.some((project) =>
        project?.conversations.some(
          (conversation) => conversation.id === record.activeConversationId,
        ),
      ))
  ) {
    return null;
  }
  const questions = validateQuestions(record.suggestedQuestions);
  const pendingReview = validatePendingReview(record.pendingReview);
  if (questions === null || pendingReview === undefined) return null;
  return Object.freeze({
    projects: Object.freeze(projects as AiWindowProjectSummary[]),
    activeProjectId: record.activeProjectId as string | null,
    activeConversationId: record.activeConversationId as string | null,
    messages: Object.freeze(messages as AiWindowMessage[]),
    mode: record.mode,
    availableModes: Object.freeze(modes),
    modelLabel: record.modelLabel,
    ...(questions === undefined ? {} : { suggestedQuestions: questions }),
    ...(record.isResponding === undefined ? {} : { isResponding: record.isResponding }),
    ...(pendingReview === null
      ? { pendingReview: null }
      : pendingReview === false
        ? {}
        : { pendingReview }),
  });
}

function validateProject(value: unknown): AiWindowProjectSummary | null {
  if (!isExactObject(value, ["conversations", "id", "name"])) return null;
  const record = value as Record<string, unknown>;
  if (
    !isProjectId(record.id) ||
    !validText(record.name, 1, 200) ||
    !Array.isArray(record.conversations) ||
    record.conversations.length > 64
  )
    return null;
  const conversations = record.conversations.map(validateConversation);
  return conversations.some((item) => item === null)
    ? null
    : Object.freeze({
        id: record.id,
        name: record.name,
        conversations: Object.freeze(conversations as AiWindowConversationSummary[]),
      });
}

function validateConversation(value: unknown): AiWindowConversationSummary | null {
  if (!isExactObject(value, ["id", "title", "updatedLabel"], ["updatedLabel"])) return null;
  const record = value as Record<string, unknown>;
  return isConversationId(record.id) &&
    validText(record.title, 1, 160) &&
    (record.updatedLabel === undefined || validText(record.updatedLabel, 1, 80))
    ? Object.freeze({
        id: record.id,
        title: record.title,
        ...(record.updatedLabel === undefined ? {} : { updatedLabel: record.updatedLabel }),
      })
    : null;
}

function validateMessage(value: unknown): AiWindowMessage | null {
  if (
    !isExactObject(
      value,
      ["changeSummary", "content", "id", "role", "state"],
      ["changeSummary", "state"],
    )
  )
    return null;
  const record = value as Record<string, unknown>;
  if (
    !validText(record.id, 1, 160) ||
    (typeof record.id === "string" && !MESSAGE_ID_PATTERN.test(record.id)) ||
    (record.role !== "user" && record.role !== "assistant") ||
    !validText(record.content, 0, AI_PROJECT_MESSAGE_MAX_BYTES) ||
    (record.state !== undefined &&
      !["complete", "streaming", "error", "stopped"].includes(String(record.state))) ||
    (record.changeSummary !== undefined && !validText(record.changeSummary, 1, 2_048))
  )
    return null;
  return Object.freeze({
    id: record.id,
    role: record.role,
    content: record.content,
    ...(record.state === undefined ? {} : { state: record.state as AiWindowMessageState }),
    ...(record.changeSummary === undefined ? {} : { changeSummary: record.changeSummary }),
  });
}

function validateQuestions(value: unknown): readonly string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 4 || !value.every((item) => validText(item, 1, 512)))
    return null;
  return Object.freeze([...value]);
}

function validatePendingReview(value: unknown): AiWindowPendingReview | null | false | undefined {
  if (value === undefined) return false;
  if (value === null) return null;
  if (!isExactObject(value, ["diffSummary", "id", "summary"])) return undefined;
  const record = value as Record<string, unknown>;
  return validText(record.id, 1, 160) &&
    validText(record.summary, 1, 2_048) &&
    validText(record.diffSummary, 1, 2_048)
    ? Object.freeze({ id: record.id, summary: record.summary, diffSummary: record.diffSummary })
    : undefined;
}

function isMode(value: unknown): value is AiWindowPermissionMode {
  return typeof value === "string" && MODE_ORDER.includes(value as AiWindowPermissionMode);
}
function isBackground(value: unknown): value is AiWindowBackground {
  return value === "white" || value === "paper" || value === "cool";
}
function isTheme(value: unknown): value is AiWindowTheme {
  return value === "light" || value === "dark";
}
function isProjectId(value: unknown): value is string {
  return typeof value === "string" && PROJECT_ID_PATTERN.test(value);
}
function isConversationId(value: unknown): value is string {
  return typeof value === "string" && CONVERSATION_ID_PATTERN.test(value);
}
function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().normalize("NFC");
  return text.length > 0 && !hasUnsafeControls(text) ? text : null;
}
function validText(value: unknown, minimum: number, maximum: number): value is string {
  return (
    typeof value === "string" &&
    [...value].length >= minimum &&
    [...value].length <= maximum &&
    !hasUnsafeControls(value)
  );
}
function hasUnsafeControls(value: string): boolean {
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isExactObject(
  value: unknown,
  keys: readonly string[],
  optional: readonly string[] = [],
): boolean {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const allowed = new Set(keys);
  if (actual.some((key) => !allowed.has(key))) return false;
  const optionalSet = new Set(optional);
  return keys.every((key) => optionalSet.has(key) || Object.hasOwn(value, key));
}
function encodedLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
