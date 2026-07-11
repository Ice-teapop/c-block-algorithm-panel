import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  analyzeProgramCst,
  type FunctionCfg,
  type FunctionDefUse,
  type LoopRegion,
} from "../../src/analysis/index.js";
import type { CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("M5a loop regions", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("excludes a for loop's own initializer while retaining update and nested initializers", () => {
    const analysis = inspectOne(
      parser,
      "int f(int n) { int sum = 0; for (int i = 0; i < n; i++) { for (int j = 0; j < n; j++) sum += j; } return sum; }",
    );
    const [outer, inner] = analysis.defUse.loopRegions;
    if (outer === undefined || inner === undefined) throw new Error("fixture 缺少嵌套 loop region");

    expect(outer.kind).toBe("for");
    expect(inner.kind).toBe("for");
    expect(inner.parentLoopId).toBe(outer.id);
    expect(outer.parentLoopId).toBeNull();
    expect(outer.nodeIds).not.toContain(outer.initializerNodeId);
    expect(outer.nodeIds).toContain(outer.updateNodeId);
    expect(outer.nodeIds).toContain(inner.initializerNodeId);
    expect(inner.nodeIds).not.toContain(inner.initializerNodeId);
    expect(inner.nodeIds).toContain(inner.updateNodeId);
    expect(outer.entryNodeId).toBe(outer.conditionNodeId);
    expect(inner.entryNodeId).toBe(inner.conditionNodeId);
  });

  it("uses the bottom condition and body entry for a do-while region", () => {
    const analysis = inspectOne(parser, "int f(int x) { do { x--; } while (x); return x; }");
    const loop = onlyLoop(analysis.defUse);
    const condition = analysis.cfg.nodes.find((node) => node.id === loop.conditionNodeId);
    const branch = analysis.cfg.edges.find(
      (edge) => edge.from === loop.conditionNodeId && edge.kind === "branch-true",
    );

    expect(loop.kind).toBe("do-while");
    expect(condition?.nodeType).toBe("do_condition");
    expect(loop.entryNodeId).toBe(branch?.to);
    expect(analysis.source.slice(loop.range.from, loop.range.to)).toBe("do { x--; } while (x);");
  });

  it.each([
    "int f(int x) { do { return x; } while (x); }",
    "int f(int x) { do { break; } while (x); return x; }",
  ])("uses reachable do body entry even when the bottom condition is unreachable: %s", (source) => {
    const analysis = inspectOne(parser, source);
    const loop = onlyLoop(analysis.defUse);
    const condition = analysis.cfg.nodes.find((node) => node.id === loop.conditionNodeId);
    const entry = analysis.cfg.nodes.find((node) => node.id === loop.entryNodeId);

    expect(entry?.reachable).toBe(true);
    expect(condition?.reachable).toBe(false);
    expect(loop.availability).toBe("analyzable");
  });

  it("marks only loops touched by goto as unsupported", () => {
    const touched = inspectOne(
      parser,
      "int f(int x) { while (x) { if (x > 3) goto done; x++; } done: return x; }",
    );
    const unrelated = inspectOne(
      parser,
      "int f(int x) { goto ready; ready: x++; while (x < 3) x++; return x; }",
    );

    expect(onlyLoop(touched.defUse).availability).toBe("unsupported-control-flow");
    expect(onlyLoop(unrelated.defUse).availability).toBe("analyzable");
  });

  it("preserves unreachable loops but publishes none for disabled partial CFG", () => {
    const unreachable = inspectOne(parser, "int f(int x) { return x; while (x) x--; }");
    const partial = inspectOne(
      parser,
      "int f(int x) { goto inside; while (x) { inside: x--; } return x; }",
    );

    expect(onlyLoop(unreachable.defUse).availability).toBe("unreachable");
    expect(partial.defUse.status).toBe("disabled");
    expect(partial.defUse.loopRegions).toEqual([]);
  });

  it("is source ordered, deterministic and deeply frozen", () => {
    const source = "int f(int x) { while (x) { do x--; while (x > 1); } return x; }";
    const first = inspectOne(parser, source).defUse.loopRegions;
    const second = inspectOne(parser, source).defUse.loopRegions;

    expect(first).toEqual(second);
    expect(first.map((loop) => loop.range.from)).toEqual(
      [...first].map((loop) => loop.range.from).sort((left, right) => left - right),
    );
    expect(deeplyFrozen(first)).toBe(true);
  });
});

interface InspectedFunction {
  readonly source: string;
  readonly cfg: FunctionCfg;
  readonly defUse: FunctionDefUse;
}

function inspectOne(parser: CParser, source: string): InspectedFunction {
  return parser.inspect(source, 1, ({ rootNode, document }) => {
    const snapshot = analyzeProgramCst({ source, revision: 1, rootNode, document });
    const cfg = snapshot.functions[0];
    const defUse = snapshot.defUse[0];
    if (cfg === undefined || defUse === undefined) throw new Error("fixture 缺少函数分析");
    return Object.freeze({ source, cfg, defUse });
  }).result;
}

function onlyLoop(defUse: FunctionDefUse): LoopRegion {
  const loop = defUse.loopRegions[0];
  if (loop === undefined || defUse.loopRegions.length !== 1)
    throw new Error("fixture loop 数量异常");
  return loop;
}

function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => deeplyFrozen(child, seen));
}
