import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSourceDocInvariants,
  projectionShape,
  rebuildFromCoverage,
  renderSourceDoc,
  type CParser,
} from "../../src/core/index.js";
import { createTestParser } from "./parser-fixture.js";

let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("M1 function-level lossless projection", () => {
  it("projects every complete top-level function and keeps the remainder raw", () => {
    const source = [
      "#include <stdio.h>",
      "int global = 2;",
      "static int square(int value) { return value * value; }",
      'int main(void) { printf("%d\\n", square(global)); return 0; }',
      "",
    ].join("\n");
    const document = parser.project(source);
    const functions = document.blocks.filter((block) => block.kind === "syntax");

    expect(functions).toHaveLength(2);
    expect(functions.map((block) => source.slice(block.range.from, block.range.to))).toEqual([
      "static int square(int value) { return value * value; }",
      'int main(void) { printf("%d\\n", square(global)); return 0; }',
    ]);
    expect(document.blocks.some((block) => block.kind === "raw")).toBe(true);
    expect(renderSourceDoc(document)).toBe(source);
    expect(rebuildFromCoverage(document)).toBe(source);
    assertSourceDocInvariants(document);
  });

  it("uses UTF-16 ranges while preserving BOM, CRLF, emoji, and comment ownership", () => {
    const source = "\uFEFF// 中文🙂 doc\r\nint main(void) { /* 内部🙂 */ return 0; } // tail\r\n";
    const document = parser.project(source);
    const functionBlock = document.blocks.find((block) => block.kind === "syntax");

    expect(functionBlock).toBeDefined();
    expect(source.slice(functionBlock?.range.from, functionBlock?.range.to)).toBe(
      "int main(void) { /* 内部🙂 */ return 0; }",
    );
    expect(document.comments).toHaveLength(3);
    expect(
      document.comments.map((comment) => source.slice(comment.range.from, comment.range.to)),
    ).toEqual(["// 中文🙂 doc\r", "/* 内部🙂 */", "// tail\r"]);
    expect(document.comments[0]?.attachment.relation).toBe("leading");
    expect(document.comments[0]?.attachment.target?.nodeType).toBe("function_definition");
    expect(document.comments[0]?.spansMultipleLines).toBe(false);
    expect(document.comments[1]?.attachment.relation).toBe("leading");
    expect(document.comments[1]?.attachment.target?.nodeType).toBe("return_statement");
    expect(document.comments[2]?.attachment.relation).toBe("trailing");
    expect(document.comments[2]?.attachment.target?.nodeType).toBe("function_definition");
    expect(document.comments[0]?.range.to).not.toBe(
      new TextEncoder().encode(source.slice(0, document.comments[0]?.range.to)).byteLength,
    );
    expect(renderSourceDoc(document)).toBe(source);
  });

  it("records multiline block ownership without allowing it to move with the function", () => {
    const source = "/**\n * documentation\n */\nint main(void) { return 0; }\n";
    const document = parser.project(source);
    const comment = document.comments[0];

    expect(comment).toMatchObject({
      form: "block",
      spansMultipleLines: true,
      attachment: { relation: "leading", movesWithTarget: false },
    });
  });

  it("attaches global, local, inline, and consecutive comments to CST owners", () => {
    const source = [
      "int global = 0; // global tail",
      "// first doc",
      "// second doc",
      "int main(void) {",
      "  int value = 0; // local tail",
      "  return value /* inline */ + 1;",
      "}",
      "",
    ].join("\n");
    const document = parser.project(source);
    const [globalTail, firstDoc, secondDoc, localTail, inline] = document.comments;

    expect(globalTail?.attachment).toMatchObject({
      relation: "trailing",
      target: { nodeType: "declaration" },
    });
    expect(
      source.slice(
        globalTail?.attachment.target?.range.from,
        globalTail?.attachment.target?.range.to,
      ),
    ).toBe("int global = 0;");

    for (const comment of [firstDoc, secondDoc]) {
      expect(comment?.attachment).toMatchObject({
        relation: "leading",
        target: { nodeType: "function_definition" },
      });
    }

    expect(localTail?.attachment).toMatchObject({
      relation: "trailing",
      target: { nodeType: "declaration" },
    });
    expect(
      source.slice(
        localTail?.attachment.target?.range.from,
        localTail?.attachment.target?.range.to,
      ),
    ).toBe("int value = 0;");

    expect(inline?.attachment).toMatchObject({
      relation: "internal",
      target: { nodeType: "binary_expression" },
      movesWithTarget: false,
    });
    expect(renderSourceDoc(document)).toBe(source);
  });

  it("records anonymous MISSING punctuation and marks its raw region as parse recovery", () => {
    for (const source of ["int x\n", "int main(void) { return 0;\n"]) {
      const document = parser.project(source);

      expect(document.parse.hasError).toBe(true);
      expect(document.parse.missingOffsets.length).toBeGreaterThan(0);
      expect(document.blocks).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "raw", reason: "parse-error" })]),
      );
      expect(renderSourceDoc(document)).toBe(source);
    }
  });

  it("keeps large comment ownership projection responsive", () => {
    const declarations = Array.from(
      { length: 2_000 },
      (_, index) => `  int value_${index} = ${index}; // owner ${index}`,
    );
    const source = ["int main(void) {", ...declarations, "  return 0;", "}", ""].join("\n");
    const startedAt = performance.now();
    const document = parser.project(source);
    const durationMs = performance.now() - startedAt;

    expect(document.comments).toHaveLength(2_000);
    expect(
      document.comments.every(
        (comment) =>
          comment.attachment.relation === "trailing" &&
          comment.attachment.target?.nodeType === "declaration",
      ),
    ).toBe(true);
    expect(durationMs).toBeLessThan(1_500);
  });

  it("mines a complete main function from inside an EOF-spanning ERROR node", () => {
    const source = "#if 0\nint broken( {\n#endif\nint main(void){return 0;}\n";
    const document = parser.project(source);
    const functions = document.blocks.filter((block) => block.kind === "syntax");

    expect(document.parse.hasError).toBe(true);
    expect(functions).toHaveLength(1);
    expect(source.slice(functions[0]?.range.from, functions[0]?.range.to)).toBe(
      "int main(void){return 0;}",
    );
    expect(
      document.blocks.some((block) => block.kind === "raw" && block.reason === "parse-error"),
    ).toBe(true);
    expect(renderSourceDoc(document)).toBe(source);
  });

  it("projects #ifdef functions but keeps #if-expression functions raw in M1", () => {
    const ifdefSource =
      "#ifdef FEATURE\nint enabled(void){return 1;}\n#else\nint disabled(void){return 0;}\n#endif\n";
    const ifSource = "#if FEATURE + 1\nint conditional(void){return 1;}\n#endif\n";

    expect(
      parser.project(ifdefSource).blocks.filter((block) => block.kind === "syntax"),
    ).toHaveLength(2);
    expect(parser.project(ifSource).blocks.filter((block) => block.kind === "syntax")).toHaveLength(
      0,
    );
  });

  it("keeps extension-bearing functions raw without turning valid functions raw", () => {
    const source = [
      "__attribute__((unused)) int extended(void) { return 1; }",
      "int main(void) { return 0; }",
      "",
    ].join("\n");
    const document = parser.project(source);
    const functions = document.blocks.filter((block) => block.kind === "syntax");

    expect(functions.map((block) => source.slice(block.range.from, block.range.to))).toEqual([
      "int main(void) { return 0; }",
    ]);
    expect(
      document.blocks.some(
        (block) => block.kind === "raw" && block.reason === "unsupported-syntax",
      ),
    ).toBe(true);
    expect(renderSourceDoc(document)).toBe(source);
  });

  it("is idempotent through the independent range renderer", () => {
    const source = "// doc\nint helper(int x){return x + 1;}\nint main(void){return helper(2);}\n";
    const first = parser.project(source);
    const rendered = renderSourceDoc(first);
    const second = parser.project(rendered);

    expect(rendered).toBe(source);
    expect(projectionShape(second)).toEqual(projectionShape(first));
  });
});
