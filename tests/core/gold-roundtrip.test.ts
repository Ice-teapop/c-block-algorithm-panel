import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Language, Parser, type Node } from "web-tree-sitter";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSourceDocInvariants,
  projectionShape,
  rebuildFromCoverage,
  renderSourceDoc,
  type CParser,
} from "../../src/core/index.js";
import { createTestParser, TEST_PARSER_ASSETS } from "./parser-fixture.js";

const projectRoot = resolve(import.meta.dirname, "../..");
const samplesRoot = resolve(projectRoot, "samples");
const sampleNames = readdirSync(samplesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let parser: CParser;
let oracleParser: Parser;

beforeAll(async () => {
  parser = await createTestParser();
  const language = await Language.load(TEST_PARSER_ASSETS.languageWasm);
  oracleParser = new Parser();
  oracleParser.setLanguage(language);
});

afterAll(() => {
  oracleParser.delete();
  parser.dispose();
});

describe("M1 gold corpus P1/P2", () => {
  it("contains the complete M0 corpus", () => {
    expect(sampleNames.length).toBeGreaterThanOrEqual(20);
  });

  it.each(sampleNames)(
    "round-trips every character and projects all complete functions: %s",
    (name) => {
      const sourceBytes = readFileSync(resolve(samplesRoot, name, "main.c"));
      const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(sourceBytes);
      const document = parser.project(source);
      const rendered = renderSourceDoc(document);
      const rebuilt = rebuildFromCoverage(document);
      const second = parser.project(rendered);
      const oracleTree = oracleParser.parse(source);
      if (oracleTree === null) {
        throw new Error(`${name}: oracle parser 未返回语法树`);
      }
      try {
        const expectedFunctionRanges = oracleTree.rootNode
          .descendantsOfType("function_definition")
          .filter(isCompleteOracleFunction)
          .map((node) => [node.startIndex, node.endIndex] as const);
        const actualFunctionRanges = flattenBlocks(document.blocks)
          .filter((block) => block.kind === "syntax" && block.role === "function")
          .map((block) => [block.range.from, block.range.to] as const);
        const expectedCommentRanges = oracleTree.rootNode
          .descendantsOfType("comment")
          .map((node) => [node.startIndex, node.endIndex] as const);
        const actualCommentRanges = document.comments.map(
          (comment) => [comment.range.from, comment.range.to] as const,
        );

        expect(expectedFunctionRanges.length).toBeGreaterThan(0);
        expect(actualFunctionRanges).toEqual(expectedFunctionRanges);
        expect(actualCommentRanges).toEqual(expectedCommentRanges);
        assertTextEqual(rendered, source, `${name}: range renderer`);
        assertTextEqual(rebuilt, source, `${name}: coverage rebuild`);
        assertBytesEqual(new TextEncoder().encode(rendered), sourceBytes, `${name}: UTF-8 bytes`);
        expect(projectionShape(second)).toEqual(projectionShape(document));
        assertSourceDocInvariants(document);
      } finally {
        oracleTree.delete();
      }
    },
  );
});

function isCompleteOracleFunction(node: Node): boolean {
  return (
    !node.hasError &&
    node.childForFieldName("type") !== null &&
    node.childForFieldName("declarator") !== null &&
    node.childForFieldName("body")?.type === "compound_statement"
  );
}

function flattenBlocks(
  blocks: readonly import("../../src/core/index.js").Block[],
): readonly import("../../src/core/index.js").Block[] {
  const flattened: import("../../src/core/index.js").Block[] = [];
  const stack = [...blocks].reverse();
  while (stack.length > 0) {
    const block = stack.pop();
    if (block === undefined) continue;
    flattened.push(block);
    stack.push(...[...block.children].reverse());
  }
  return flattened;
}

function assertTextEqual(actual: string, expected: string, label: string): void {
  const offset = firstTextDifference(actual, expected);
  if (offset === -1) {
    return;
  }
  throw new Error(
    `${label} 首个差异位于 UTF-16 offset ${offset}：actual=${describeCodeUnit(actual, offset)} expected=${describeCodeUnit(expected, offset)}`,
  );
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array, label: string): void {
  const offset = firstByteDifference(actual, expected);
  if (offset === -1) {
    return;
  }
  throw new Error(
    `${label} 首个差异位于 byte offset ${offset}：actual=${describeByte(actual, offset)} expected=${describeByte(expected, offset)}`,
  );
}

function firstTextDifference(actual: string, expected: string): number {
  const sharedLength = Math.min(actual.length, expected.length);
  for (let offset = 0; offset < sharedLength; offset += 1) {
    if (actual.charCodeAt(offset) !== expected.charCodeAt(offset)) {
      return offset;
    }
  }
  return actual.length === expected.length ? -1 : sharedLength;
}

function firstByteDifference(actual: Uint8Array, expected: Uint8Array): number {
  const sharedLength = Math.min(actual.length, expected.length);
  for (let offset = 0; offset < sharedLength; offset += 1) {
    if (actual[offset] !== expected[offset]) {
      return offset;
    }
  }
  return actual.length === expected.length ? -1 : sharedLength;
}

function describeCodeUnit(value: string, offset: number): string {
  return offset >= value.length
    ? "<EOF>"
    : `U+${value.charCodeAt(offset).toString(16).toUpperCase().padStart(4, "0")}`;
}

function describeByte(value: Uint8Array, offset: number): string {
  const byte = value[offset];
  return byte === undefined ? "<EOF>" : `0x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
}
