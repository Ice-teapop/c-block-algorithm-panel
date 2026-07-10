export interface SourceOffsetMap {
  readonly sourceLength: number;
  readonly editorLength: number;
  readonly crlfSourceStarts: readonly number[];
  readonly crlfEditorStarts: readonly number[];
}

/**
 * Builds the position map used when CodeMirror represents each CRLF as one
 * logical line-break code unit. Every other UTF-16 code unit keeps its width.
 */
export function createSourceOffsetMap(source: string): SourceOffsetMap {
  const crlfSourceStarts: number[] = [];
  const crlfEditorStarts: number[] = [];
  let sourceOffset = 0;

  while (sourceOffset < source.length) {
    if (source.charCodeAt(sourceOffset) === 0x0d && source.charCodeAt(sourceOffset + 1) === 0x0a) {
      crlfSourceStarts.push(sourceOffset);
      crlfEditorStarts.push(sourceOffset - crlfSourceStarts.length + 1);
      sourceOffset += 2;
    } else {
      sourceOffset += 1;
    }
  }

  return Object.freeze({
    sourceLength: source.length,
    editorLength: source.length - crlfSourceStarts.length,
    crlfSourceStarts: Object.freeze(crlfSourceStarts),
    crlfEditorStarts: Object.freeze(crlfEditorStarts),
  });
}

/**
 * Converts a source UTF-16 boundary to a CodeMirror document boundary.
 * A boundary between CR and LF maps to the left side of the logical newline.
 */
export function sourceToEditor(map: SourceOffsetMap, sourceOffset: number): number {
  assertBoundary("source", sourceOffset, map.sourceLength);
  return sourceOffset - lowerBound(map.crlfSourceStarts, sourceOffset);
}

/**
 * Converts a CodeMirror document boundary back to the original source.
 * The boundary after a logical newline skips both source CRLF code units.
 */
export function editorToSource(map: SourceOffsetMap, editorOffset: number): number {
  assertBoundary("editor", editorOffset, map.editorLength);
  return editorOffset + lowerBound(map.crlfEditorStarts, editorOffset);
}

/** Returns the number of sorted values strictly smaller than target. */
function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((values[middle] ?? Number.POSITIVE_INFINITY) < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function assertBoundary(domain: "source" | "editor", offset: number, length: number): void {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > length) {
    throw new RangeError(`${domain} offset ${String(offset)} 越出 [0, ${length}]`);
  }
}
