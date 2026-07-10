import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Language, Parser, type Tree } from "web-tree-sitter";
import {
  extractEditTargets,
  type EditTarget,
  type EditTargetSnapshot,
} from "../../../src/core/editing/targets.js";

const projectRoot = resolve(import.meta.dirname, "../../..");
let parser: Parser;

beforeAll(async () => {
  const runtimeWasmUrl = resolve(projectRoot, "resources/wasm/web-tree-sitter.wasm");
  await Parser.init({ locateFile: () => runtimeWasmUrl });
  const language = await Language.load(resolve(projectRoot, "resources/wasm/tree-sitter-c.wasm"));
  parser = new Parser();
  parser.setLanguage(language);
});

afterAll(() => {
  parser.delete();
});

describe("M3a edit target extraction", () => {
  it("copies literal ranges exactly across CRLF and UTF-16 Unicode offsets", () => {
    const source = [
      "int main(void) {",
      "  int α = 0x2A;",
      "  char c = '\\n';",
      '  const char *s = "é😀";',
      "  return α;",
      "}",
      "",
    ].join("\r\n");
    const snapshot = extractAndDelete(source, 7);

    expect(snapshot.literals.map((target) => [target.literalKind, target.text])).toEqual([
      ["number", "0x2A"],
      ["char", "'\\n'"],
      ["string", '"é😀"'],
    ]);
    for (const target of snapshot.literals) {
      expect(target.revision).toBe(7);
      expect(source.slice(target.range.from, target.range.to)).toBe(target.text);
    }
    expect(snapshot.literals[2]?.range).toEqual({
      from: source.indexOf('"é😀"'),
      to: source.indexOf('"é😀"') + '"é😀"'.length,
    });
  });

  it("extracts anonymous binary operators, operand facts, and parent side links", () => {
    const source = "int value = a /* keep */ + b * c + (d - 2);\n";
    const snapshot = extractAndDelete(source, 3);
    const keptPlus = requireBinary(snapshot, "a /* keep */ + b * c");
    const multiply = requireBinary(snapshot, "b * c");
    const outerPlus = requireBinary(snapshot, "a /* keep */ + b * c + (d - 2)");
    const parenthesizedMinus = requireBinary(snapshot, "d - 2");

    expect(keptPlus).toMatchObject({
      leftNodeType: "identifier",
      leftText: "a",
      operatorText: "+",
      rightNodeType: "binary_expression",
      rightText: "b * c",
      parentBinaryId: outerPlus.id,
      parentSide: "left",
    });
    expect(source.slice(keptPlus.operatorRange.from, keptPlus.operatorRange.to)).toBe("+");
    expect(multiply).toMatchObject({
      parentBinaryId: keptPlus.id,
      parentSide: "right",
      leftText: "b",
      rightText: "c",
    });
    expect(parenthesizedMinus).toMatchObject({
      parentBinaryId: outerPlus.id,
      parentSide: "right",
    });
    expect(outerPlus.rightNodeType).toBe("parenthesized_expression");
    expect(outerPlus.rightText).toBe("(d - 2)");
    expect(parenthesizedMinus.range.from).toBeGreaterThan(outerPlus.rightRange.from);
    expect(parenthesizedMinus.range.to).toBeLessThan(outerPlus.rightRange.to);
    expect(outerPlus.parentBinaryId).toBeNull();
  });

  it("finds declaration-style and empty for slots without consuming delimiters or comments", () => {
    const source = [
      "int main(void) {",
      "  for (",
      "    /*lead*/ int α = 0 /*seed*/ ;",
      "    /*between*/ α < n /*bound*/ ;",
      "    /*step*/ α += 1 /*tail*/",
      "  ) { use(α); }",
      "  for ( /*init*/ ; /*cond*/ ; /*update*/ ) body();",
      "  for (;;) {}",
      "}",
      "",
    ].join("\r\n");
    const snapshot = extractAndDelete(source, 11);
    expect(snapshot.forStatements).toHaveLength(3);
    const declared = snapshot.forStatements[0];
    const empty = snapshot.forStatements[1];
    const bare = snapshot.forStatements[2];
    if (declared === undefined || empty === undefined || bare === undefined) {
      throw new Error("缺少 for target");
    }

    expect(declared).toMatchObject({
      initializerNodeType: "declaration",
      initializerText: "\r\n    /*lead*/ int α = 0 /*seed*/ ",
      initializerEmpty: false,
      conditionNodeType: "binary_expression",
      conditionText: "\r\n    /*between*/ α < n /*bound*/ ",
      conditionEmpty: false,
      updateNodeType: "assignment_expression",
      updateText: "\r\n    /*step*/ α += 1 /*tail*/\r\n  ",
      updateEmpty: false,
      bodyNodeType: "compound_statement",
      bodyText: "{ use(α); }",
    });
    expect(source[declared.initializerRange.to]).toBe(";");
    expect(source.slice(declared.bodyRange.from, declared.bodyRange.to)).toBe(declared.bodyText);

    const emptyStart = source.indexOf("for ( /*init*/");
    const openParenthesis = source.indexOf("(", emptyStart);
    const firstSemicolon = source.indexOf(";", emptyStart);
    const secondSemicolon = source.indexOf(";", firstSemicolon + 1);
    const closeParenthesis = source.indexOf(")", secondSemicolon + 1);
    expect(empty).toMatchObject({
      initializerNodeType: null,
      initializerRange: { from: openParenthesis + 1, to: firstSemicolon },
      initializerText: " /*init*/ ",
      initializerEmpty: true,
      conditionNodeType: null,
      conditionRange: { from: firstSemicolon + 1, to: secondSemicolon },
      conditionText: " /*cond*/ ",
      conditionEmpty: true,
      updateNodeType: null,
      updateRange: { from: secondSemicolon + 1, to: closeParenthesis },
      updateText: " /*update*/ ",
      updateEmpty: true,
      bodyText: "body();",
    });
    expect(source.slice(empty.range.from, empty.range.to)).toBe(empty.text);
    expect(bare).toMatchObject({
      initializerRange: { from: bare.range.from + "for (".length, to: bare.range.from + 5 },
      initializerText: "",
      initializerEmpty: true,
      conditionText: "",
      conditionEmpty: true,
      updateText: "",
      updateEmpty: true,
      bodyText: "{}",
    });
  });

  it("keeps the outer if condition interior and complete branch snapshots", () => {
    const source = [
      "int main(void) {",
      "  if ( /*lead*/ ((α + 1) < (β - 2)) /*tail*/ ) { yes(); } else if (x) no();",
      "}",
      "",
    ].join("\r\n");
    const snapshot = extractAndDelete(source, 19);
    expect(snapshot.ifStatements).toHaveLength(2);
    const outer = snapshot.ifStatements[0];
    const inner = snapshot.ifStatements[1];
    if (outer === undefined || inner === undefined) throw new Error("缺少 if target");

    expect(outer).toMatchObject({
      conditionText: " /*lead*/ ((α + 1) < (β - 2)) /*tail*/ ",
      consequenceNodeType: "compound_statement",
      consequenceText: "{ yes(); }",
      alternativeNodeType: "else_clause",
      alternativeText: "else if (x) no();",
      bodyText: "{ yes(); } else if (x) no();",
    });
    expect(source.slice(outer.conditionRange.from, outer.conditionRange.to)).toBe(
      outer.conditionText,
    );
    expect(source.slice(outer.bodyRange.from, outer.bodyRange.to)).toBe(outer.bodyText);
    expect(inner).toMatchObject({
      conditionText: "x",
      consequenceText: "no();",
      alternativeRange: null,
      alternativeText: null,
      bodyText: "no();",
    });
  });

  it("prunes malformed statements while retaining safe sibling targets", () => {
    const source = [
      "int main(void) {",
      "  int before = 1;",
      "  if (x + ) { int hidden_if = 2; }",
      "  for (int i = 0 i < 3; i++) { int hidden_for = 4; }",
      "  int after = 5;",
      "}",
      "",
    ].join("\n");
    const snapshot = extractAndDelete(source, 0);

    expect(snapshot.literals.map((target) => target.text)).toEqual(["1", "5"]);
    expect(snapshot.ifStatements).toEqual([]);
    expect(snapshot.forStatements).toEqual([]);
    expect(snapshot.binaryExpressions).toEqual([]);
  });

  it("returns deeply frozen plain snapshots that survive Tree disposal", () => {
    const source = "int main(void){ for(int i=0;i<2;i++) if(i==1) return i+1; }\n";
    const tree = requireTree(source);
    const snapshot = extractEditTargets(tree.rootNode, source, 23);
    tree.delete();

    expectDeepFrozenPlain(snapshot);
    const allTargets = targetsOf(snapshot);
    expect(new Set(allTargets.map((target) => target.id)).size).toBe(allTargets.length);
    expect(allTargets.every((target) => target.revision === 23)).toBe(true);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

  it("rejects stale source text and invalid revisions", () => {
    const source = "int value = 1;\n";
    const tree = requireTree(source);
    try {
      expect(() => extractEditTargets(tree.rootNode, "int value = 2;\n", 1)).toThrow(
        /同一源码快照/u,
      );
      expect(() => extractEditTargets(tree.rootNode, source, -1)).toThrow(/revision/u);
      expect(() => extractEditTargets(tree.rootNode, source, 1.5)).toThrow(/revision/u);
    } finally {
      tree.delete();
    }
  });
});

function extractAndDelete(source: string, revision: number): EditTargetSnapshot {
  const tree = requireTree(source);
  try {
    return extractEditTargets(tree.rootNode, source, revision);
  } finally {
    tree.delete();
  }
}

function requireTree(source: string): Tree {
  const tree = parser.parse(source);
  if (tree === null) throw new Error("tree-sitter 未返回语法树");
  return tree;
}

function requireBinary(snapshot: EditTargetSnapshot, text: string) {
  const target = snapshot.binaryExpressions.find((candidate) => candidate.text === text);
  if (target === undefined) throw new Error(`缺少 binary target ${JSON.stringify(text)}`);
  return target;
}

function targetsOf(snapshot: EditTargetSnapshot): readonly EditTarget[] {
  return [
    ...snapshot.literals,
    ...snapshot.binaryExpressions,
    ...snapshot.forStatements,
    ...snapshot.ifStatements,
  ];
}

function expectDeepFrozenPlain(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  if (Array.isArray(value)) {
    for (const item of value) expectDeepFrozenPlain(item);
    return;
  }
  expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  for (const [key, nested] of Object.entries(value)) {
    expect(key).not.toBe("node");
    expect(key).not.toBe("tree");
    expect(key).not.toBe("nodeId");
    if (key === "id") expect(typeof nested).toBe("string");
    expectDeepFrozenPlain(nested);
  }
}
