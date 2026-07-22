import { foaText, type FoaLocalizedText } from "./foa-contracts.js";
import type { FoaSceneProfile } from "./foa-scene-profile.js";

export interface FoaRuntimeEvidenceToken {
  readonly id: string;
  readonly label: FoaLocalizedText;
  readonly value: FoaLocalizedText;
}

export interface FoaRuntimeEvidenceStackFrame {
  readonly id: string;
  readonly label: FoaLocalizedText;
  readonly value: FoaLocalizedText;
}

export interface FoaRuntimeEvidenceMemoryLink {
  readonly id: string;
  readonly from: FoaLocalizedText;
  readonly to: FoaLocalizedText;
  readonly label: FoaLocalizedText;
}

/**
 * One immutable teaching-runtime snapshot. Values are short state facts, not prose instructions.
 * The snapshot is computed from the selected case and is deliberately separate from learner
 * completion evidence.
 */
export interface FoaRuntimeEvidenceSnapshot {
  readonly stateValues: Readonly<Record<string, FoaLocalizedText>>;
  readonly branchOutcome: boolean | null;
  readonly iteration: number | null;
  readonly tokens: readonly FoaRuntimeEvidenceToken[];
  readonly activeTokenIds: readonly string[];
  readonly stackFrames: readonly FoaRuntimeEvidenceStackFrame[];
  readonly activeStackFrameId: string | null;
  readonly memoryLinks: readonly FoaRuntimeEvidenceMemoryLink[];
  readonly activeMemoryLinkId: string | null;
}

export interface FoaCourseRuntimeEvidence {
  readonly order: number;
  readonly frames: readonly FoaRuntimeEvidenceSnapshot[];
}

export interface FoaRuntimeEvidenceSnapshotInput {
  readonly stateValues: Readonly<Record<string, FoaLocalizedText | string | number | boolean>>;
  readonly branchOutcome?: boolean | null;
  readonly iteration?: number | null;
  readonly tokens?: readonly FoaRuntimeEvidenceToken[];
  readonly activeTokenIds?: readonly string[];
  readonly stackFrames?: readonly FoaRuntimeEvidenceStackFrame[];
  readonly activeStackFrameId?: string | null;
  readonly memoryLinks?: readonly FoaRuntimeEvidenceMemoryLink[];
  readonly activeMemoryLinkId?: string | null;
}

export function defineFoaCourseRuntimeEvidence(
  profile: FoaSceneProfile,
  inputs: readonly FoaRuntimeEvidenceSnapshotInput[],
): FoaCourseRuntimeEvidence {
  if (inputs.length !== profile.slots.length) {
    throw new RangeError(
      `FOA runtime evidence ${String(profile.order)} requires one snapshot per semantic slot`,
    );
  }
  const expectedFieldIds = new Set(profile.stateShape.map(({ id }) => id));
  const frames = inputs.map((input, frameIndex) => {
    const actualFieldIds = Object.keys(input.stateValues);
    if (
      actualFieldIds.length !== expectedFieldIds.size ||
      actualFieldIds.some((id) => !expectedFieldIds.has(id))
    ) {
      throw new RangeError(
        `FOA runtime evidence ${String(profile.order)} frame ${String(frameIndex + 1)} must define every state field exactly once`,
      );
    }
    const stateValues = Object.freeze(
      Object.fromEntries(
        actualFieldIds.map((id) => [id, normalizeValue(input.stateValues[id]!, id)] as const),
      ),
    );
    const tokens = Object.freeze([...(input.tokens ?? [])].map(freezeToken));
    const tokenIds = new Set(tokens.map(({ id }) => id));
    const activeTokenIds = Object.freeze([...(input.activeTokenIds ?? [])]);
    if (activeTokenIds.some((id) => !tokenIds.has(id))) {
      throw new RangeError("FOA runtime evidence activates an unknown token");
    }
    const stackFrames = Object.freeze([...(input.stackFrames ?? [])].map(freezeStackFrame));
    const activeStackFrameId = input.activeStackFrameId ?? null;
    if (activeStackFrameId !== null && !stackFrames.some(({ id }) => id === activeStackFrameId)) {
      throw new RangeError("FOA runtime evidence activates an unknown stack frame");
    }
    const memoryLinks = Object.freeze([...(input.memoryLinks ?? [])].map(freezeMemoryLink));
    const activeMemoryLinkId = input.activeMemoryLinkId ?? null;
    if (activeMemoryLinkId !== null && !memoryLinks.some(({ id }) => id === activeMemoryLinkId)) {
      throw new RangeError("FOA runtime evidence activates an unknown memory link");
    }
    return Object.freeze({
      stateValues,
      branchOutcome: input.branchOutcome ?? null,
      iteration: input.iteration ?? null,
      tokens,
      activeTokenIds,
      stackFrames,
      activeStackFrameId,
      memoryLinks,
      activeMemoryLinkId,
    });
  });
  return Object.freeze({ order: profile.order, frames: Object.freeze(frames) });
}

export function runtimeText(zh: string, en = zh): FoaLocalizedText {
  return foaText(zh, en);
}

export function runtimeToken(
  id: string,
  label: string,
  value: string | number,
  englishLabel = label,
): FoaRuntimeEvidenceToken {
  return Object.freeze({
    id,
    label: foaText(label, englishLabel),
    value: runtimeText(String(value)),
  });
}

export function runtimeStackFrame(
  id: string,
  label: string,
  value: string | number,
  englishLabel = label,
): FoaRuntimeEvidenceStackFrame {
  return Object.freeze({
    id,
    label: foaText(label, englishLabel),
    value: runtimeText(String(value)),
  });
}

export function runtimeMemoryLink(
  id: string,
  from: string,
  to: string,
  label: string,
  englishLabel = label,
): FoaRuntimeEvidenceMemoryLink {
  return Object.freeze({
    id,
    from: runtimeText(from),
    to: runtimeText(to),
    label: foaText(label, englishLabel),
  });
}

function normalizeValue(
  value: FoaLocalizedText | string | number | boolean,
  fieldId: string,
): FoaLocalizedText {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return runtimeText(String(value));
  }
  if (
    value === null ||
    typeof value !== "object" ||
    typeof value.zh !== "string" ||
    typeof value.en !== "string" ||
    value.zh.trim().length === 0 ||
    value.en.trim().length === 0
  ) {
    throw new TypeError(`FOA runtime state ${fieldId} requires non-empty bilingual text`);
  }
  return foaText(value.zh, value.en);
}

function freezeToken(value: FoaRuntimeEvidenceToken): FoaRuntimeEvidenceToken {
  return Object.freeze({
    id: value.id,
    label: normalizeValue(value.label, `${value.id}.label`),
    value: normalizeValue(value.value, `${value.id}.value`),
  });
}

function freezeStackFrame(value: FoaRuntimeEvidenceStackFrame): FoaRuntimeEvidenceStackFrame {
  return Object.freeze({
    id: value.id,
    label: normalizeValue(value.label, `${value.id}.label`),
    value: normalizeValue(value.value, `${value.id}.value`),
  });
}

function freezeMemoryLink(value: FoaRuntimeEvidenceMemoryLink): FoaRuntimeEvidenceMemoryLink {
  return Object.freeze({
    id: value.id,
    from: normalizeValue(value.from, `${value.id}.from`),
    to: normalizeValue(value.to, `${value.id}.to`),
    label: normalizeValue(value.label, `${value.id}.label`),
  });
}
