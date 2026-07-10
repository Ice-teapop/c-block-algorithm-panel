import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createSourceOffsetMap,
  editorToSource,
  sourceToEditor,
} from "../../src/renderer/source-offset-map.js";

const sourceArbitrary = fc
  .array(fc.constantFrom("a", "中", "\n", "\r\n", "\r", "😀", "\uFEFF"), {
    maxLength: 80,
  })
  .map((tokens) => tokens.join(""));

describe("source UTF-16 ↔ CodeMirror logical offset map", () => {
  it.each([
    ["empty", ""],
    ["LF", "a\nb\n"],
    ["CRLF", "a\r\nb\r\n"],
    ["mixed", "a\r\nb\nc\rd\r\n"],
    ["BOM", "\uFEFFint main(void) {\r\n}\r\n"],
    ["emoji", "😀\r\n中😀\n"],
  ])("maps %s source without changing non-CRLF UTF-16 widths", (_name, source) => {
    assertMapMatchesOracle(source);
  });

  it("left-biases the boundary inside CRLF and skips the full pair after newline", () => {
    const map = createSourceOffsetMap("a\r\nb");

    expect(sourceToEditor(map, 1)).toBe(1);
    expect(sourceToEditor(map, 2)).toBe(1);
    expect(sourceToEditor(map, 3)).toBe(2);
    expect(editorToSource(map, 1)).toBe(1);
    expect(editorToSource(map, 2)).toBe(3);
  });

  it("keeps isolated CR and both UTF-16 halves of emoji at width one", () => {
    const source = "\r😀";
    const map = createSourceOffsetMap(source);

    expect(source.length).toBe(3);
    expect(map.editorLength).toBe(3);
    expect(sourceToEditor(map, 1)).toBe(1);
    expect(sourceToEditor(map, 2)).toBe(2);
    expect(sourceToEditor(map, 3)).toBe(3);
  });

  it("is immutable", () => {
    const map = createSourceOffsetMap("a\r\nb");

    expect(Object.isFrozen(map)).toBe(true);
    expect(Object.isFrozen(map.crlfSourceStarts)).toBe(true);
    expect(Object.isFrozen(map.crlfEditorStarts)).toBe(true);
  });

  it("rejects invalid boundaries", () => {
    const map = createSourceOffsetMap("a\r\nb");

    expect(() => sourceToEditor(map, -1)).toThrow(RangeError);
    expect(() => sourceToEditor(map, map.sourceLength + 1)).toThrow(RangeError);
    expect(() => sourceToEditor(map, 1.5)).toThrow(RangeError);
    expect(() => editorToSource(map, -1)).toThrow(RangeError);
    expect(() => editorToSource(map, map.editorLength + 1)).toThrow(RangeError);
    expect(() => editorToSource(map, Number.NaN)).toThrow(RangeError);
  });

  it("matches the independent logical-text oracle and round-trips every editor boundary", () => {
    fc.assert(
      fc.property(sourceArbitrary, (source) => {
        assertMapMatchesOracle(source);
      }),
      { numRuns: 500, seed: 0xc0de6 },
    );
  });
});

function assertMapMatchesOracle(source: string): void {
  const map = createSourceOffsetMap(source);
  const logicalText = simulateCodeMirrorText(source);

  // @codemirror/state is not a declared dependency at this checkpoint. This
  // exact CRLF-normalized string is the explicit logical Text-length oracle.
  expect(map.editorLength).toBe(logicalText.length);
  expect(map.sourceLength).toBe(source.length);
  expect(map.crlfSourceStarts).toEqual(findCrlfStarts(source));
  expect(map.crlfEditorStarts).toEqual(findLogicalCrlfOffsets(source));

  let previousEditorOffset = -1;
  for (let sourceOffset = 0; sourceOffset <= source.length; sourceOffset += 1) {
    const editorOffset = sourceToEditor(map, sourceOffset);
    expect(editorOffset).toBeGreaterThanOrEqual(previousEditorOffset);
    expect(editorOffset).toBe(linearSourceToEditor(source, sourceOffset));

    const restoredSourceOffset = editorToSource(map, editorOffset);
    const insideCrlf =
      sourceOffset > 0 &&
      source.charCodeAt(sourceOffset - 1) === 0x0d &&
      source.charCodeAt(sourceOffset) === 0x0a;
    expect(restoredSourceOffset).toBe(insideCrlf ? sourceOffset - 1 : sourceOffset);
    previousEditorOffset = editorOffset;
  }

  let previousSourceOffset = -1;
  for (let editorOffset = 0; editorOffset <= logicalText.length; editorOffset += 1) {
    const sourceOffset = editorToSource(map, editorOffset);
    expect(sourceOffset).toBeGreaterThan(previousSourceOffset);
    expect(sourceOffset).toBe(linearEditorToSource(source, editorOffset));
    expect(sourceToEditor(map, sourceOffset)).toBe(editorOffset);
    previousSourceOffset = sourceOffset;
  }
}

function simulateCodeMirrorText(source: string): string {
  return source.replaceAll("\r\n", "\n");
}

function findCrlfStarts(source: string): readonly number[] {
  const starts: number[] = [];
  for (let offset = 0; offset + 1 < source.length; offset += 1) {
    if (source.charCodeAt(offset) === 0x0d && source.charCodeAt(offset + 1) === 0x0a) {
      starts.push(offset);
      offset += 1;
    }
  }
  return starts;
}

function findLogicalCrlfOffsets(source: string): readonly number[] {
  const offsets: number[] = [];
  let sourceOffset = 0;
  let logicalOffset = 0;
  while (sourceOffset < source.length) {
    if (source.charCodeAt(sourceOffset) === 0x0d && source.charCodeAt(sourceOffset + 1) === 0x0a) {
      offsets.push(logicalOffset);
      sourceOffset += 2;
    } else {
      sourceOffset += 1;
    }
    logicalOffset += 1;
  }
  return offsets;
}

function linearSourceToEditor(source: string, sourceOffset: number): number {
  let removedCodeUnits = 0;
  for (const crlfStart of findCrlfStarts(source)) {
    if (crlfStart < sourceOffset) {
      removedCodeUnits += 1;
    }
  }
  return sourceOffset - removedCodeUnits;
}

function linearEditorToSource(source: string, editorOffset: number): number {
  let sourceOffset = 0;
  let logicalOffset = 0;
  while (logicalOffset < editorOffset) {
    if (source.charCodeAt(sourceOffset) === 0x0d && source.charCodeAt(sourceOffset + 1) === 0x0a) {
      sourceOffset += 2;
    } else {
      sourceOffset += 1;
    }
    logicalOffset += 1;
  }
  return sourceOffset;
}
