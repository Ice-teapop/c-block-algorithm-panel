import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { analyzeProgramCst, type FunctionCfg } from "../../src/analysis/index.js";
import { type Block, type CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("M5a CFG foundation", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("builds deterministic sequence and return edges", () => {
    const source = "int f(void) { int x = 0; x++; return x; }";
    const cfg = analyzeOne(parser, source);

    expect(cfg.name).toBe("f");
    expect(cfg.partial).toBe(false);
    expect(edgeShapes(cfg, source)).toEqual([
      ["ENTRY", "int x = 0;", "entry"],
      ["int x = 0;", "x++;", "next"],
      ["x++;", "return x;", "next"],
      ["return x;", "EXIT", "return"],
    ]);
    expect(cfg.nodes.every((node) => node.reachable)).toBe(true);
  });

  it("connects an empty function directly to EXIT", () => {
    const source = "int f(void) {}";
    const cfg = analyzeOne(parser, source);

    expect(cfg.partial).toBe(false);
    expect(edgeShapes(cfg, source)).toEqual([["ENTRY", "EXIT", "entry"]]);
  });

  it("keeps the suffix after return but marks it unreachable", () => {
    const source = "int f(void) { return 1; int x = 2; x++; }";
    const cfg = analyzeOne(parser, source);

    expect(edgeShapes(cfg, source)).toEqual([
      ["ENTRY", "return 1;", "entry"],
      ["return 1;", "EXIT", "return"],
      ["int x = 2;", "x++;", "next"],
      ["x++;", "EXIT", "next"],
    ]);
    expect(reachability(cfg, source)).toMatchObject({
      "return 1;": true,
      "int x = 2;": false,
      "x++;": false,
    });
  });

  it("joins an if without else at the following statement", () => {
    const source = "int f(int x) { if (x) x++; return x; }";
    const cfg = analyzeOne(parser, source);

    expect(cfg.partial).toBe(false);
    expect(edgeShapes(cfg, source)).toEqual([
      ["ENTRY", "if (x) x++;", "entry"],
      ["if (x) x++;", "x++;", "branch-true"],
      ["if (x) x++;", "return x;", "branch-false"],
      ["x++;", "return x;", "next"],
      ["return x;", "EXIT", "return"],
    ]);
  });

  it("unwraps else_clause and connects both branches to the join", () => {
    const source = "int f(int x) { if (x) x++; else x--; return x; }";
    const cfg = analyzeOne(parser, source);

    expect(cfg.partial).toBe(false);
    expect(cfg.nodes.some((node) => node.nodeType === "else_clause")).toBe(false);
    expect(edgeShapes(cfg, source)).toEqual([
      ["ENTRY", "if (x) x++; else x--;", "entry"],
      ["if (x) x++; else x--;", "x++;", "branch-true"],
      ["if (x) x++; else x--;", "x--;", "branch-false"],
      ["x++;", "return x;", "next"],
      ["x--;", "return x;", "next"],
      ["return x;", "EXIT", "return"],
    ]);
  });

  it("treats else-if as a nested if node rather than an else wrapper", () => {
    const source = "int f(int x, int y) { if (x) return 1; else if (y) return 2; else return 3; }";
    const cfg = analyzeOne(parser, source);

    expect(cfg.partial).toBe(false);
    expect(edgeShapes(cfg, source)).toEqual([
      ["ENTRY", "if (x) return 1; else if (y) return 2; else return 3;", "entry"],
      ["if (x) return 1; else if (y) return 2; else return 3;", "return 1;", "branch-true"],
      [
        "if (x) return 1; else if (y) return 2; else return 3;",
        "if (y) return 2; else return 3;",
        "branch-false",
      ],
      ["return 1;", "EXIT", "return"],
      ["if (y) return 2; else return 3;", "return 2;", "branch-true"],
      ["if (y) return 2; else return 3;", "return 3;", "branch-false"],
      ["return 2;", "EXIT", "return"],
      ["return 3;", "EXIT", "return"],
    ]);
  });

  it("preserves both typed edges when true and false empty branches share a target", () => {
    const source = "int f(int x) { if (x) {} else {} return 0; }";
    const cfg = analyzeOne(parser, source);

    expect(edgeShapes(cfg, source)).toEqual([
      ["ENTRY", "if (x) {} else {}", "entry"],
      ["if (x) {} else {}", "return 0;", "branch-true"],
      ["if (x) {} else {}", "return 0;", "branch-false"],
      ["return 0;", "EXIT", "return"],
    ]);
  });

  it("fails closed with an explicit partial reason for unsupported control flow", () => {
    const source = "int f(int x) { while (x) x--; return x; }";
    const cfg = analyzeOne(parser, source);

    expect(cfg.partial).toBe(true);
    expect(cfg.partialReasons).toEqual([
      expect.objectContaining({ code: "unsupported-control-flow", nodeType: "while_statement" }),
    ]);
    expect(edgeShapes(cfg, source)).toContainEqual(["ENTRY", "while (x) x--;", "entry"]);
    expect(edgeShapes(cfg, source)).toContainEqual(["while (x) x--;", "return x;", "next"]);
    expect(reachability(cfg, source)["return x;"]).toBe(true);
  });

  it("returns a deeply frozen plain snapshot that survives Tree disposal", () => {
    const source = "int f(void) { return 0; }";
    const snapshot = parser.inspect(source, 12, ({ rootNode }) =>
      analyzeProgramCst({ source, revision: 12, rootNode }),
    ).result;

    expect(snapshot.revision).toBe(12);
    expect(JSON.stringify(snapshot)).not.toMatch(/"tree"|"rootNode"/u);
    expect(deeplyFrozen(snapshot)).toBe(true);
    expect(snapshot.functions[0]?.nodes.map((node) => node.nodeType)).toEqual([
      "function_definition",
      "return_statement",
      "function_definition",
    ]);
  });

  it("is deeply equal across independent reparses of identical source", () => {
    const source = "int f(int x) { if (x) return 1; return 0; }";
    const first = parser.inspect(source, 5, ({ rootNode }) =>
      analyzeProgramCst({ source, revision: 5, rootNode }),
    ).result;
    const second = parser.inspect(source, 5, ({ rootNode }) =>
      analyzeProgramCst({ source, revision: 5, rootNode }),
    ).result;

    expect(second).toEqual(first);
  });

  it.each([
    "int f(void) { int x = 0; x++; return x; }",
    "int f(int x) { if (x) x++; return x; }",
    "int f(int x) { if (x) x++; else x--; return x; }",
    "int f(int x, int y) { if (x) return 1; else if (y) return 2; else return 3; }",
  ])("owns every projected statement or declaration exactly once: %s", (source) => {
    const inspected = parser.inspect(source, 3, ({ rootNode }) =>
      analyzeProgramCst({ source, revision: 3, rootNode }),
    );
    const cfg = inspected.result.functions[0];
    if (cfg === undefined) throw new Error("fixture 缺少函数 CFG");

    const projected = collectStructuredStatementRanges(inspected.analysis.document.blocks);
    const analyzed = cfg.nodes
      .filter((node) => node.kind === "syntax")
      .map((node) => `${node.range.from}:${node.range.to}`)
      .sort();

    expect(analyzed).toEqual(projected);
    expect(new Set(analyzed).size).toBe(analyzed.length);
  });
});

function analyzeOne(parser: CParser, source: string): FunctionCfg {
  const snapshot = parser.inspect(source, 1, ({ rootNode }) =>
    analyzeProgramCst({ source, revision: 1, rootNode }),
  ).result;
  const cfg = snapshot.functions[0];
  if (cfg === undefined) throw new Error("fixture 缺少函数 CFG");
  return cfg;
}

function edgeShapes(cfg: FunctionCfg, source: string): readonly (readonly string[])[] {
  const labels = new Map(cfg.nodes.map((node) => [node.id, nodeLabel(node, source)]));
  return cfg.edges.map((edge) => [
    labels.get(edge.from) ?? "?",
    labels.get(edge.to) ?? "?",
    edge.kind,
  ]);
}

function reachability(cfg: FunctionCfg, source: string): Readonly<Record<string, boolean>> {
  return Object.fromEntries(
    cfg.nodes
      .filter((node) => node.kind === "syntax")
      .map((node) => [source.slice(node.range.from, node.range.to).trim(), node.reachable]),
  );
}

function nodeLabel(node: FunctionCfg["nodes"][number], source: string): string {
  if (node.kind === "entry") return "ENTRY";
  if (node.kind === "exit") return "EXIT";
  return source.slice(node.range.from, node.range.to).trim();
}

function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((child) => deeplyFrozen(child, seen));
}

function collectStructuredStatementRanges(blocks: readonly Block[]): readonly string[] {
  const ranges: string[] = [];
  const visit = (block: Block): void => {
    if (block.kind === "syntax" && (block.role === "statement" || block.role === "declaration")) {
      ranges.push(`${block.range.from}:${block.range.to}`);
    }
    block.children.forEach(visit);
  };
  blocks.forEach(visit);
  return ranges.sort();
}
