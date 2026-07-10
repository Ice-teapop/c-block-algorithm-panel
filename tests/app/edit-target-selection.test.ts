import { describe, expect, it } from "vitest";
import { createBlockIndex, type BlockIndexEntry } from "../../src/core/block-index.js";
import type {
  BinaryExpressionEditTarget,
  EditTargetSnapshot,
  ForStatementEditTarget,
  IfStatementEditTarget,
  LiteralEditTarget,
} from "../../src/core/editing/targets.js";
import { textRange, type Block, type SourceDoc } from "../../src/core/model.js";
import {
  allEditTargets,
  blockEntryForTarget,
  candidateTargetForPlan,
  editTargetAtOffset,
  editTargetForBlock,
  rangeContainsOffset,
  smallestTarget,
} from "../../src/app/edit-target-selection.js";

describe("edit target selection", () => {
  it("uses half-open adjacent ranges while keeping empty slots clickable", () => {
    expect(rangeContainsOffset(textRange(0, 4), 0)).toBe(true);
    expect(rangeContainsOffset(textRange(0, 4), 3)).toBe(true);
    expect(rangeContainsOffset(textRange(0, 4), 4)).toBe(false);
    expect(rangeContainsOffset(textRange(4, 8), 4)).toBe(true);
    expect(rangeContainsOffset(textRange(4, 4), 4)).toBe(true);
    expect(rangeContainsOffset(textRange(4, 4), 3)).toBe(false);
  });

  it("prefers a literal or operator over its enclosing for header", () => {
    const control = forTarget("for:base", 0, 32, {
      initializer: [4, 9],
      condition: [10, 20],
      update: [21, 24],
      body: [26, 32],
    });
    const literal = literalTarget("literal:base", 12, 14);
    const binary = binaryTarget("binary:base", 10, 19, 15, 17);
    const snapshot = editSnapshot(1, { literals: [literal], binaries: [binary], fors: [control] });

    expect(editTargetAtOffset(snapshot, 12)).toBe(literal);
    expect(editTargetAtOffset(snapshot, 15)).toBe(binary);
    expect(editTargetAtOffset(snapshot, 11)).toBe(control);
    expect(smallestTarget([control, binary, literal])).toBe(literal);
    expect(allEditTargets(snapshot)).toEqual([literal, binary, control]);
  });

  it("selects for and if only in editable header fields, not their bodies", () => {
    const forControl = forTarget("for:1", 0, 30, {
      initializer: [4, 8],
      condition: [9, 14],
      update: [15, 18],
      body: [20, 30],
    });
    const ifControl = ifTarget("if:1", 31, 50, [35, 40], [42, 50]);
    const snapshot = editSnapshot(3, { fors: [forControl], ifs: [ifControl] });

    expect(editTargetAtOffset(snapshot, 4)).toBe(forControl);
    expect(editTargetAtOffset(snapshot, 9)).toBe(forControl);
    expect(editTargetAtOffset(snapshot, 15)).toBe(forControl);
    expect(editTargetAtOffset(snapshot, 8)).toBeNull();
    expect(editTargetAtOffset(snapshot, 25)).toBeNull();
    expect(editTargetAtOffset(snapshot, 35)).toBe(ifControl);
    expect(editTargetAtOffset(snapshot, 40)).toBeNull();
    expect(editTargetAtOffset(snapshot, 45)).toBeNull();
  });

  it("matches exact for/if statement blocks and locates the owning block", () => {
    const forBlock = syntaxBlock("for_statement", 0, 30);
    const ifBlock = syntaxBlock("if_statement", 31, 50);
    const document = sourceDoc(50, [forBlock, ifBlock]);
    const index = createBlockIndex(document);
    const forEntry = index.entries.find((entry) => entry.block === forBlock);
    const ifEntry = index.entries.find((entry) => entry.block === ifBlock);
    expect(forEntry).toBeDefined();
    expect(ifEntry).toBeDefined();
    const forControl = forTarget("for:1", 0, 30, {
      initializer: [4, 8],
      condition: [9, 14],
      update: [15, 18],
      body: [20, 30],
    });
    const ifControl = ifTarget("if:1", 31, 50, [35, 40], [42, 50]);
    const literal = literalTarget("literal:1", 10, 11);
    const snapshot = editSnapshot(4, {
      literals: [literal],
      fors: [forControl],
      ifs: [ifControl],
    });

    expect(editTargetForBlock(snapshot, forEntry as BlockIndexEntry)).toBe(forControl);
    expect(editTargetForBlock(snapshot, ifEntry as BlockIndexEntry)).toBe(ifControl);
    expect(blockEntryForTarget(index, forControl)).toBe(forEntry);
    expect(blockEntryForTarget(index, literal)).toBe(forEntry);
  });

  it("maps literal, operator, for, and if targets into a candidate snapshot", () => {
    const baseLiteral = literalTarget("literal:base", 2, 3);
    const baseBinary = binaryTarget("binary:base", 5, 10, 7, 8);
    const baseFor = forTarget("for:base", 12, 30, {
      initializer: [16, 18],
      condition: [19, 21],
      update: [22, 24],
      body: [26, 30],
    });
    const baseIf = ifTarget("if:base", 32, 45, [35, 36], [38, 45]);
    const base = editSnapshot(8, {
      literals: [baseLiteral],
      binaries: [baseBinary],
      fors: [baseFor],
      ifs: [baseIf],
    });

    const candidateLiteral = literalTarget("literal:candidate", 2, 5, 9);
    const candidateBinary = binaryTarget("binary:candidate", 7, 13, 10, 12, 9);
    const candidateFor = forTarget(
      "for:candidate",
      12,
      34,
      {
        initializer: [16, 20],
        condition: [21, 23],
        update: [24, 28],
        body: [30, 34],
      },
      9,
    );
    const candidateIf = ifTarget("if:candidate", 32, 48, [35, 39], [41, 48], 9);
    const candidate = editSnapshot(9, {
      literals: [candidateLiteral],
      binaries: [candidateBinary],
      fors: [candidateFor],
      ifs: [candidateIf],
    });
    const diffs = [
      { beforeRange: baseLiteral.range, afterRange: candidateLiteral.range },
      { beforeRange: baseBinary.operatorRange, afterRange: candidateBinary.operatorRange },
    ];

    expect(candidateTargetForPlan(base, plan(baseLiteral.id, candidate, diffs))).toBe(
      candidateLiteral,
    );
    expect(candidateTargetForPlan(base, plan(baseBinary.id, candidate, diffs))).toBe(
      candidateBinary,
    );
    expect(candidateTargetForPlan(base, plan(baseFor.id, candidate, diffs))).toBe(candidateFor);
    expect(candidateTargetForPlan(base, plan(baseIf.id, candidate, diffs))).toBe(candidateIf);
    expect(candidateTargetForPlan(base, plan("missing", candidate, diffs))).toBeNull();
    expect(candidateTargetForPlan(base, plan(baseLiteral.id, candidate, []))).toBeNull();
  });
});

function plan(
  targetId: string,
  candidate: EditTargetSnapshot,
  diffs: readonly {
    beforeRange: ReturnType<typeof textRange>;
    afterRange: ReturnType<typeof textRange>;
  }[],
) {
  return { targetId, diffs, candidateAnalysis: { editTargets: candidate } };
}

function editSnapshot(
  revision: number,
  values: {
    readonly literals?: readonly LiteralEditTarget[];
    readonly binaries?: readonly BinaryExpressionEditTarget[];
    readonly fors?: readonly ForStatementEditTarget[];
    readonly ifs?: readonly IfStatementEditTarget[];
  } = {},
): EditTargetSnapshot {
  return Object.freeze({
    revision,
    literals: Object.freeze([...(values.literals ?? [])]),
    binaryExpressions: Object.freeze([...(values.binaries ?? [])]),
    forStatements: Object.freeze([...(values.fors ?? [])]),
    ifStatements: Object.freeze([...(values.ifs ?? [])]),
  });
}

function literalTarget(id: string, from: number, to: number, revision = 1): LiteralEditTarget {
  return Object.freeze({
    id,
    revision,
    kind: "literal",
    nodeType: "number_literal",
    literalKind: "number",
    range: textRange(from, to),
    text: "1",
  });
}

function binaryTarget(
  id: string,
  from: number,
  to: number,
  operatorFrom: number,
  operatorTo: number,
  revision = 1,
): BinaryExpressionEditTarget {
  return Object.freeze({
    id,
    revision,
    kind: "binary-expression",
    nodeType: "binary_expression",
    range: textRange(from, to),
    text: "a + b",
    leftNodeType: "identifier",
    leftRange: textRange(from, operatorFrom),
    leftText: "a",
    operatorRange: textRange(operatorFrom, operatorTo),
    operatorText: "+",
    rightNodeType: "identifier",
    rightRange: textRange(operatorTo, to),
    rightText: "b",
    parentBinaryId: null,
    parentSide: null,
  });
}

interface ForRanges {
  readonly initializer: readonly [number, number];
  readonly condition: readonly [number, number];
  readonly update: readonly [number, number];
  readonly body: readonly [number, number];
}

function forTarget(
  id: string,
  from: number,
  to: number,
  ranges: ForRanges,
  revision = 1,
): ForStatementEditTarget {
  return Object.freeze({
    id,
    revision,
    kind: "for-statement",
    nodeType: "for_statement",
    range: textRange(from, to),
    text: "for (...) {}",
    initializerNodeType: "declaration",
    initializerRange: textRange(...ranges.initializer),
    initializerText: "i = 0",
    initializerEmpty: false,
    conditionNodeType: "binary_expression",
    conditionRange: textRange(...ranges.condition),
    conditionText: "i < n",
    conditionEmpty: false,
    updateNodeType: "update_expression",
    updateRange: textRange(...ranges.update),
    updateText: "i++",
    updateEmpty: false,
    bodyNodeType: "compound_statement",
    bodyRange: textRange(...ranges.body),
    bodyText: "{}",
  });
}

function ifTarget(
  id: string,
  from: number,
  to: number,
  condition: readonly [number, number],
  consequence: readonly [number, number],
  revision = 1,
): IfStatementEditTarget {
  return Object.freeze({
    id,
    revision,
    kind: "if-statement",
    nodeType: "if_statement",
    range: textRange(from, to),
    text: "if (x) {}",
    conditionRange: textRange(...condition),
    conditionText: "x",
    consequenceNodeType: "compound_statement",
    consequenceRange: textRange(...consequence),
    consequenceText: "{}",
    alternativeNodeType: null,
    alternativeRange: null,
    alternativeText: null,
    bodyRange: textRange(...consequence),
    bodyText: "{}",
  });
}

function syntaxBlock(nodeType: string, from: number, to: number): Block {
  return Object.freeze({
    kind: "syntax",
    role: "statement",
    nodeType,
    range: textRange(from, to),
    children: Object.freeze([]),
  });
}

function sourceDoc(length: number, blocks: readonly Block[]): Pick<SourceDoc, "range" | "blocks"> {
  return Object.freeze({
    range: textRange(0, length),
    blocks: Object.freeze([...blocks]),
  });
}
