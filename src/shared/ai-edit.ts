export const AI_SOURCE_EDIT_SCHEMA_VERSION = 1 as const;
export const AI_SOURCE_EDIT_MAX_REPLACEMENTS = 32;
export const AI_SOURCE_EDIT_SUMMARY_MAX_LENGTH = 4 * 1024;
export const AI_SOURCE_EDIT_ANSWER_MAX_LENGTH = 512 * 1024;
export const AI_SOURCE_EDIT_EXPECTED_MAX_LENGTH = 256 * 1024;
export const AI_SOURCE_EDIT_NEW_TEXT_MAX_LENGTH = 512 * 1024;
export const AI_SOURCE_EDIT_TOTAL_TEXT_MAX_LENGTH = 768 * 1024;

export const AI_EDIT_PERMISSIONS = Object.freeze(["read-only", "review", "agent"] as const);

export type AiEditPermission = (typeof AI_EDIT_PERMISSIONS)[number];

/**
 * One source-only replacement proposed by an untrusted model.
 *
 * Offsets, paths and commands are deliberately absent. The renderer must find
 * exactly one occurrence of expectedText in its bound main.c snapshot before
 * it may create a TextPatch.
 */
export interface AiSourceEditReplacement {
  readonly expectedText: string;
  readonly newText: string;
}

/** The only write-shaped object accepted from a remote AI provider. */
export interface AiSourceEditProposal {
  readonly schemaVersion: typeof AI_SOURCE_EDIT_SCHEMA_VERSION;
  readonly summary: string;
  readonly replacements: readonly AiSourceEditReplacement[];
}

/** Strict response envelope for propose-edit mentor requests. */
export interface AiMentorEditEnvelope {
  readonly schemaVersion: typeof AI_SOURCE_EDIT_SCHEMA_VERSION;
  readonly answer: string;
  readonly proposal: AiSourceEditProposal | null;
}

export function isAiEditPermission(value: unknown): value is AiEditPermission {
  return typeof value === "string" && (AI_EDIT_PERMISSIONS as readonly string[]).includes(value);
}

export function validateAiSourceEditProposal(value: unknown): AiSourceEditProposal | null {
  if (!isExactObject(value, ["schemaVersion", "summary", "replacements"])) return null;
  const input = value as Record<string, unknown>;
  if (
    input.schemaVersion !== AI_SOURCE_EDIT_SCHEMA_VERSION ||
    !validText(input.summary, 1, AI_SOURCE_EDIT_SUMMARY_MAX_LENGTH) ||
    !Array.isArray(input.replacements) ||
    input.replacements.length < 1 ||
    input.replacements.length > AI_SOURCE_EDIT_MAX_REPLACEMENTS
  ) {
    return null;
  }

  const replacements: AiSourceEditReplacement[] = [];
  let totalLength = 0;
  for (const value of input.replacements) {
    if (!isExactObject(value, ["expectedText", "newText"])) return null;
    const replacement = value as Record<string, unknown>;
    if (
      !validText(replacement.expectedText, 1, AI_SOURCE_EDIT_EXPECTED_MAX_LENGTH) ||
      !validText(replacement.newText, 0, AI_SOURCE_EDIT_NEW_TEXT_MAX_LENGTH) ||
      replacement.expectedText === replacement.newText
    ) {
      return null;
    }
    totalLength += replacement.expectedText.length + replacement.newText.length;
    if (totalLength > AI_SOURCE_EDIT_TOTAL_TEXT_MAX_LENGTH) return null;
    replacements.push(
      Object.freeze({
        expectedText: replacement.expectedText,
        newText: replacement.newText,
      }),
    );
  }

  return Object.freeze({
    schemaVersion: AI_SOURCE_EDIT_SCHEMA_VERSION,
    summary: input.summary,
    replacements: Object.freeze(replacements),
  }) as AiSourceEditProposal;
}

export function validateAiMentorEditEnvelope(value: unknown): AiMentorEditEnvelope | null {
  if (!isExactObject(value, ["schemaVersion", "answer", "proposal"])) return null;
  const input = value as Record<string, unknown>;
  if (
    input.schemaVersion !== AI_SOURCE_EDIT_SCHEMA_VERSION ||
    !validText(input.answer, 1, AI_SOURCE_EDIT_ANSWER_MAX_LENGTH)
  ) {
    return null;
  }
  const proposal = input.proposal === null ? null : validateAiSourceEditProposal(input.proposal);
  if (input.proposal !== null && proposal === null) return null;
  return Object.freeze({
    schemaVersion: AI_SOURCE_EDIT_SCHEMA_VERSION,
    answer: input.answer,
    proposal,
  }) as AiMentorEditEnvelope;
}

/** Parses model text as one bare JSON object. Markdown fences and trailing text fail closed. */
export function parseAiMentorEditEnvelopeJson(text: string): AiMentorEditEnvelope | null {
  if (
    typeof text !== "string" ||
    text.length < 2 ||
    text.length > AI_SOURCE_EDIT_TOTAL_TEXT_MAX_LENGTH
  ) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  return validateAiMentorEditEnvelope(value);
}

function validText(value: unknown, minimum: number, maximum: number): value is string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) return false;
  if (value.includes("\0")) return false;
  try {
    new TextEncoder().encode(value);
    return !hasUnpairedSurrogate(value);
  } catch {
    return false;
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isExactObject(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}
