import { randomUUID } from "node:crypto";
import {
  aiProviderFailure,
  type AiMentorCancelResult,
  type AiMentorEvent,
  type AiMentorReadResult,
  type AiMentorStartResult,
  type AiProviderFailure,
  type AiProviderId,
  type StartAiMentorRequest,
} from "../../src/shared/ai-provider.js";
import type { AiProviderClient } from "./ai-provider-client.js";

const MAX_TERMINAL_SESSIONS = 32;

export interface AiMentorController {
  start(
    owner: object,
    providerId: AiProviderId,
    credential: string,
    model: string,
    request: StartAiMentorRequest,
  ): AiMentorStartResult;
  read(owner: object, sessionId: string, afterSequence: number): AiMentorReadResult;
  cancel(owner: object, sessionId: string): AiMentorCancelResult;
  cancelOwner(owner: object): void;
}

interface MentorSession {
  readonly id: string;
  readonly owner: object;
  readonly sourceFingerprint: string;
  readonly abortController: AbortController;
  readonly createdAt: number;
  status: "running" | "completed" | "cancelled";
  events: readonly AiMentorEvent[];
  failure: AiProviderFailure | null;
}

export function createAiMentorController(client: AiProviderClient): AiMentorController {
  const sessions = new Map<string, MentorSession>();
  const activeByOwner = new WeakMap<object, MentorSession>();

  const prune = (): void => {
    const terminal = [...sessions.values()]
      .filter((session) => session.status !== "running")
      .sort((left, right) => left.createdAt - right.createdAt);
    for (const session of terminal.slice(0, Math.max(0, terminal.length - MAX_TERMINAL_SESSIONS))) {
      sessions.delete(session.id);
    }
  };

  const cancelSession = (session: MentorSession): void => {
    if (session.status !== "running") return;
    session.status = "cancelled";
    session.abortController.abort("cancelled");
    if (activeByOwner.get(session.owner) === session) activeByOwner.delete(session.owner);
  };

  return Object.freeze({
    start(
      owner: object,
      providerId: AiProviderId,
      credential: string,
      model: string,
      request: StartAiMentorRequest,
    ): AiMentorStartResult {
      const active = activeByOwner.get(owner);
      if (active?.status === "running") {
        return aiProviderFailure("AI_PROVIDER_BUSY", "当前窗口已有一个 AI 请求正在运行。");
      }
      prune();
      const session: MentorSession = {
        id: `mentor:${randomUUID()}`,
        owner,
        sourceFingerprint: request.sourceFingerprint,
        abortController: new AbortController(),
        createdAt: Date.now(),
        status: "running",
        events: Object.freeze([]),
        failure: null,
      };
      sessions.set(session.id, session);
      activeByOwner.set(owner, session);
      void client
        .requestMentor(
          providerId,
          credential,
          model,
          request.prompt,
          request.context,
          session.abortController.signal,
        )
        .then((result) => {
          if (session.status !== "running") return;
          if (result.status === "failed") {
            session.failure = result;
          } else {
            session.events = Object.freeze([
              Object.freeze({ sequence: 1, kind: "answer" as const, text: result.text }),
            ]);
          }
          session.status = "completed";
        })
        .catch(() => {
          if (session.status !== "running") return;
          session.failure = aiProviderFailure(
            "AI_PROVIDER_NETWORK_FAILED",
            "AI 请求异常终止，未自动重试。",
          );
          session.status = "completed";
        })
        .finally(() => {
          if (activeByOwner.get(owner) === session) activeByOwner.delete(owner);
        });
      return Object.freeze({
        status: "started",
        sessionId: session.id,
        sourceFingerprint: session.sourceFingerprint,
      });
    },

    read(owner: object, sessionId: string, afterSequence: number): AiMentorReadResult {
      const session = sessions.get(sessionId);
      if (session === undefined || session.owner !== owner) return missingSession();
      if (session.failure !== null) return session.failure;
      const events = Object.freeze(
        session.events.filter((event) => event.sequence > afterSequence).map((event) => event),
      );
      const nextSequence = session.events.at(-1)?.sequence ?? afterSequence;
      return Object.freeze({
        status: session.status,
        sessionId,
        sourceFingerprint: session.sourceFingerprint,
        events,
        nextSequence,
      });
    },

    cancel(owner: object, sessionId: string): AiMentorCancelResult {
      const session = sessions.get(sessionId);
      if (session === undefined || session.owner !== owner) return missingSession();
      if (session.status !== "running") {
        return Object.freeze({ status: "already-terminal", sessionId });
      }
      cancelSession(session);
      return Object.freeze({ status: "cancelled", sessionId });
    },

    cancelOwner(owner: object): void {
      const active = activeByOwner.get(owner);
      if (active !== undefined) cancelSession(active);
    },
  });
}

function missingSession(): AiProviderFailure {
  return aiProviderFailure("AI_PROVIDER_SESSION_NOT_FOUND", "AI 会话不存在或不属于当前窗口。");
}
