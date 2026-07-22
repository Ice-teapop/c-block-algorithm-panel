import type {
  FoaLessonDefinition,
  FoaSemanticEvent,
  FoaSemanticEventType,
} from "../tutorials/foa-contracts.js";

/** Immutable coordinates for one authored semantic event in generated C source. */
export interface FoaSourceBlockDescriptor {
  readonly eventId: string;
  readonly eventType: FoaSemanticEventType;
  readonly sourceLine: number;
  readonly sourceColumnStart: number;
  readonly sourceColumnEnd: number;
  readonly sourceStartOffset: number;
  readonly sourceEndOffset: number;
  readonly sourceText: string;
}

/**
 * Resolves authored single-line anchors to exact ranges in generated C source. This is structural
 * matching, not C parsing: missing or repeated anchors fail closed instead of being guessed.
 */
export function buildFoaSourceBlockDescriptors(
  lesson: Pick<FoaLessonDefinition, "code" | "semanticEvents">,
): readonly FoaSourceBlockDescriptor[] {
  return Object.freeze(
    lesson.semanticEvents.map((event) => {
      const sourceRange = resolveEventSourceRange(lesson.code.text, event);
      return Object.freeze({
        eventId: event.id,
        eventType: event.type,
        ...sourceRange,
      });
    }),
  );
}

function resolveEventSourceRange(
  source: string,
  event: FoaSemanticEvent,
): Omit<FoaSourceBlockDescriptor, "eventId" | "eventType"> {
  const exact = event.sourceAnchor?.exact;
  if (exact === undefined) {
    throw new TypeError(`FOA event ${event.id} has no explicit source anchor`);
  }
  if (exact.trim().length === 0 || exact.includes("\n")) {
    throw new TypeError(`FOA event ${event.id} must use a non-empty single-line source anchor`);
  }

  const sourceStartOffset = source.indexOf(exact);
  if (sourceStartOffset < 0) {
    throw new RangeError(`FOA event ${event.id} source anchor is missing from generated C source`);
  }
  if (source.indexOf(exact, sourceStartOffset + 1) >= 0) {
    throw new RangeError(`FOA event ${event.id} source anchor is ambiguous in generated C source`);
  }

  const lineStartOffset = source.lastIndexOf("\n", sourceStartOffset - 1) + 1;
  const sourceLine = countLineBreaks(source, sourceStartOffset) + 1;
  const sourceColumnStart = sourceStartOffset - lineStartOffset + 1;
  const sourceEndOffset = sourceStartOffset + exact.length;
  return Object.freeze({
    sourceLine,
    sourceColumnStart,
    sourceColumnEnd: sourceColumnStart + exact.length,
    sourceStartOffset,
    sourceEndOffset,
    sourceText: exact,
  });
}

function countLineBreaks(source: string, endOffset: number): number {
  let count = 0;
  for (let index = 0; index < endOffset; index += 1) {
    if (source[index] === "\n") count += 1;
  }
  return count;
}
