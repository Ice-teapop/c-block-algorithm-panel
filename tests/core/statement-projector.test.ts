import { resolve } from "node:path";
import { Language, Parser, type Node } from "web-tree-sitter";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  projectStatementBlocks,
  type StatementProjectionFacts,
} from "../../src/core/statement-projector.js";
import { textRange, type Block, type TextRange } from "../../src/core/model.js";

const projectRoot = resolve(import.meta.dirname, "../..");
const runtimeWasm = resolve(projectRoot, "resources/wasm/web-tree-sitter.wasm");
const languageWasm = resolve(projectRoot, "resources/wasm/tree-sitter-c.wasm");

let parser: Parser;

beforeAll(async () => {
  await Parser.init({ locateFile: () => runtimeWasm });
  const language = await Language.load(languageWasm);
  parser = new Parser();
  parser.setLanguage(language);
});

afterAll(() => {
  parser.delete();
});

describe("M2 statement projector", () => {
  it("projects the C17 statement matrix as a frozen laminar hierarchy", () => {
    const source = [
      "// top-level teaching sample",
      "#include <stdio.h>",
      "#define LIMIT 4",
      "typedef int count_t;",
      "int global_value = 0;",
      "#ifdef FEATURE",
      "int feature(void) { return 1; }",
      "#else",
      "int feature(void) { return 0; }",
      "#endif",
      "int main(void) {",
      "  int total = 0;",
      "  { int scoped = 1; total += scoped; }",
      "  if (total) total++; else if (global_value) { total--; }",
      "  for (int i = 0; i < LIMIT; i++) {",
      "    if (i == 2) continue;",
      "    int body_value = i;",
      "    total += body_value;",
      "  }",
      "  while (total < 10) total++;",
      "  do { total--; } while (total > 5);",
      "  switch (total) {",
      "    case 1:",
      "      goto done;",
      "    default:",
      "      break;",
      "  }",
      "done:",
      "  return total;",
      "}",
      "",
    ].join("\n");
    const blocks = project(source);
    const all = flattenBlocks(blocks);
    const nodeTypes = new Set(
      all.filter((block) => block.kind === "syntax").map((block) => block.nodeType),
    );

    for (const expectedNodeType of [
      "preproc_include",
      "preproc_def",
      "type_definition",
      "declaration",
      "preproc_ifdef",
      "function_definition",
      "if_statement",
      "for_statement",
      "while_statement",
      "do_statement",
      "switch_statement",
      "case_statement",
      "goto_statement",
      "break_statement",
      "continue_statement",
      "labeled_statement",
      "return_statement",
      "expression_statement",
    ]) {
      expect(nodeTypes.has(expectedNodeType), expectedNodeType).toBe(true);
    }
    expect(nodeTypes.has("compound_statement")).toBe(false);
    expect(nodeTypes.has("else_clause")).toBe(false);
    expect(
      blocks.some(
        (block) =>
          block.kind === "raw" &&
          source.slice(block.range.from, block.range.to) === "// top-level teaching sample",
      ),
    ).toBe(true);

    const forBlock = all.find(
      (block) => block.kind === "syntax" && block.nodeType === "for_statement",
    );
    expect(forBlock).toBeDefined();
    expect(
      forBlock?.children.some(
        (child) => source.slice(child.range.from, child.range.to) === "int i = 0;",
      ),
    ).toBe(false);
    expect(
      forBlock?.children.some((child) =>
        source.slice(child.range.from, child.range.to).includes("body_value"),
      ),
    ).toBe(true);

    const switchBlock = all.find(
      (block) => block.kind === "syntax" && block.nodeType === "switch_statement",
    );
    expect(
      switchBlock?.children.every(
        (child) => child.kind === "syntax" && child.nodeType === "case_statement",
      ),
    ).toBe(true);
    expect(
      switchBlock?.children.some((caseBlock) =>
        caseBlock.children.some(
          (child) => child.kind === "syntax" && child.nodeType === "goto_statement",
        ),
      ),
    ).toBe(true);

    const labelBlock = all.find(
      (block) => block.kind === "syntax" && block.nodeType === "labeled_statement",
    );
    expect(
      labelBlock?.children.some(
        (child) => child.kind === "syntax" && child.nodeType === "return_statement",
      ),
    ).toBe(true);

    assertFrozenLaminar(blocks, textRange(0, source.length));
    expect(renderBlocks(source, blocks, textRange(0, source.length))).toBe(source);
  });

  it("keeps #if expressions and function macros raw at their exact ranges", () => {
    const source = [
      "#define APPLY(x) ((x) + 1)",
      "#if FEATURE + 1",
      "int conditional(void) { return 1; }",
      "#endif",
      "int main(void) {",
      "  int value = 0;",
      "#if FEATURE",
      "  value++;",
      "#endif",
      "  return value;",
      "}",
      "",
    ].join("\n");
    const blocks = project(source);
    const rawTexts = flattenBlocks(blocks)
      .filter((block) => block.kind === "raw")
      .map((block) => source.slice(block.range.from, block.range.to));

    expect(rawTexts.some((text) => text.trimEnd() === "#define APPLY(x) ((x) + 1)")).toBe(true);
    expect(
      rawTexts.some(
        (text) => text.trimEnd() === "#if FEATURE + 1\nint conditional(void) { return 1; }\n#endif",
      ),
    ).toBe(true);
    expect(rawTexts.some((text) => text.trimEnd() === "#if FEATURE\n  value++;\n#endif")).toBe(
      true,
    );
    expect(
      flattenBlocks(blocks).some(
        (block) =>
          block.kind === "syntax" &&
          source.slice(block.range.from, block.range.to).includes("conditional"),
      ),
    ).toBe(false);
    expect(renderBlocks(source, blocks, textRange(0, source.length))).toBe(source);
  });

  it("mines a complete function and its statements from an EOF-spanning ERROR", () => {
    const source =
      "#if 0\nint broken( {\n#endif\nint recovered = 1;\nint main(void){return recovered;}\n";
    const blocks = project(source);
    const all = flattenBlocks(blocks);
    const main = all.find(
      (block) =>
        block.kind === "syntax" &&
        block.nodeType === "function_definition" &&
        source.slice(block.range.from, block.range.to).startsWith("int main"),
    );

    expect(main).toBeDefined();
    expect(
      all.some(
        (block) =>
          block.kind === "syntax" &&
          block.nodeType === "declaration" &&
          source.slice(block.range.from, block.range.to) === "int recovered = 1;",
      ),
    ).toBe(true);
    expect(
      main?.children.some(
        (child) => child.kind === "syntax" && child.nodeType === "return_statement",
      ),
    ).toBe(true);
    expect(all.some((block) => block.kind === "raw" && block.reason === "parse-error")).toBe(true);
    expect(renderBlocks(source, blocks, textRange(0, source.length))).toBe(source);
  });

  it("keeps unsupported functions raw without hiding supported siblings", () => {
    const source = [
      "__attribute__((unused)) int extended(void) { return 1; }",
      "int main(void) { return 0; }",
      "",
    ].join("\n");
    const blocks = project(
      source,
      (node, range) =>
        source.slice(range.from, range.to).includes("__attribute__") &&
        node.type === "function_definition",
    );
    const all = flattenBlocks(blocks);

    expect(
      all.some(
        (block) =>
          block.kind === "raw" &&
          block.reason === "unsupported-syntax" &&
          source.slice(block.range.from, block.range.to).includes("extended"),
      ),
    ).toBe(true);
    expect(
      all.some(
        (block) =>
          block.kind === "syntax" &&
          block.nodeType === "function_definition" &&
          source.slice(block.range.from, block.range.to).includes("main"),
      ),
    ).toBe(true);
    expect(renderBlocks(source, blocks, textRange(0, source.length))).toBe(source);
  });

  it("preserves an anonymous malformed declarator without creating empty blocks", () => {
    const source = "int main(void) { int [64]; return 0; }\n";
    const blocks = project(source);

    expect(flattenBlocks(blocks).every((block) => block.range.from < block.range.to)).toBe(true);
    expect(renderBlocks(source, blocks, textRange(0, source.length))).toBe(source);
  });
});

function project(
  source: string,
  unsupported: (node: Node, range: TextRange) => boolean = () => false,
): readonly Block[] {
  const tree = parser.parse(source);
  if (tree === null) {
    throw new Error("test parser 未返回语法树");
  }
  try {
    const facts = collectFacts(source, tree.rootNode, unsupported);
    return projectStatementBlocks(source, tree.rootNode, facts);
  } finally {
    tree.delete();
  }
}

function collectFacts(
  source: string,
  rootNode: Node,
  unsupported: (node: Node, range: TextRange) => boolean,
): StatementProjectionFacts {
  const supportedFunctionRanges: TextRange[] = [];
  const unsupportedFunctionRanges: TextRange[] = [];
  const errorRanges: TextRange[] = [];
  const missingOffsets: number[] = [];
  const stack = [rootNode];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    const range = textRange(
      Math.max(0, Math.min(source.length, node.startIndex)),
      Math.max(0, Math.min(source.length, node.endIndex)),
    );
    if (node.isError && range.from < range.to) {
      errorRanges.push(range);
    }
    if (node.isMissing) {
      missingOffsets.push(range.from);
    }
    if (
      node.type === "function_definition" &&
      !node.hasError &&
      node.childForFieldName("type") !== null &&
      node.childForFieldName("declarator") !== null &&
      node.childForFieldName("body")?.type === "compound_statement"
    ) {
      if (unsupported(node, range)) {
        unsupportedFunctionRanges.push(range);
      } else {
        supportedFunctionRanges.push(range);
      }
    }
    stack.push(...node.children);
  }

  return Object.freeze({
    supportedFunctionRanges: Object.freeze(supportedFunctionRanges),
    unsupportedFunctionRanges: Object.freeze(unsupportedFunctionRanges),
    errorRanges: Object.freeze(errorRanges),
    missingOffsets: Object.freeze(missingOffsets),
  });
}

function flattenBlocks(blocks: readonly Block[]): readonly Block[] {
  const flattened: Block[] = [];
  const stack = [...blocks].reverse();
  while (stack.length > 0) {
    const block = stack.pop();
    if (block === undefined) {
      continue;
    }
    flattened.push(block);
    for (let index = block.children.length - 1; index >= 0; index -= 1) {
      const child = block.children[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return flattened;
}

function renderBlocks(source: string, blocks: readonly Block[], parentRange: TextRange): string {
  let cursor = parentRange.from;
  const fragments: string[] = [];
  for (const block of blocks) {
    fragments.push(source.slice(cursor, block.range.from));
    fragments.push(renderBlock(source, block));
    cursor = block.range.to;
  }
  fragments.push(source.slice(cursor, parentRange.to));
  return fragments.join("");
}

function renderBlock(source: string, block: Block): string {
  return block.children.length === 0
    ? source.slice(block.range.from, block.range.to)
    : renderBlocks(source, block.children, block.range);
}

function assertFrozenLaminar(blocks: readonly Block[], parentRange: TextRange): void {
  expect(Object.isFrozen(blocks)).toBe(true);
  let previousEnd = parentRange.from;
  for (const block of blocks) {
    expect(Object.isFrozen(block)).toBe(true);
    expect(Object.isFrozen(block.range)).toBe(true);
    expect(block.range.from).toBeGreaterThanOrEqual(previousEnd);
    expect(block.range.from).toBeGreaterThanOrEqual(parentRange.from);
    expect(block.range.to).toBeLessThanOrEqual(parentRange.to);
    assertFrozenLaminar(block.children, block.range);
    previousEnd = block.range.to;
  }
}
