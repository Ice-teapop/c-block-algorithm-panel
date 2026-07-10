import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { BINARY_OPERATORS } from "../../src/core/editing/operators.js";
import type {
  BinaryExpressionEditTarget,
  ForStatementEditTarget,
  IfStatementEditTarget,
  LiteralEditTarget,
} from "../../src/core/editing/targets.js";
import { textRange } from "../../src/core/model.js";
import {
  buildConfirmationRows,
  buildEditRequest,
  readRawTextareaValue,
  runEditWorkflow,
  type EditConfirmationPlan,
} from "../../src/ui/edit-panel.js";

describe("M3a edit panel pure contract", () => {
  it("builds four target-bound discriminated requests without trimming text", () => {
    expect(buildEditRequest(literalTarget(), { kind: "literal", newText: "  42  " })).toEqual({
      kind: "replace-literal",
      baseRevision: 8,
      targetId: "literal:1",
      newText: "  42  ",
    });
    expect(
      buildEditRequest(binaryTarget(), { kind: "binary-expression", newOperator: "&&" }),
    ).toEqual({
      kind: "replace-binary-operator",
      baseRevision: 8,
      targetId: "binary:1",
      newOperator: "&&",
    });

    const forRequest = buildEditRequest(forTarget(), {
      kind: "for-statement",
      initializerText: "\r\n  /* init */ int i = 0 ",
      conditionText: "\r\n  i < n /* bound */ ",
      updateText: "\r\n  i++\r\n",
    });
    expect(forRequest).toEqual({
      kind: "replace-for-fields",
      baseRevision: 8,
      targetId: "for:1",
      initializerText: "\r\n  /* init */ int i = 0 ",
      conditionText: "\r\n  i < n /* bound */ ",
      updateText: "\r\n  i++\r\n",
    });
    expect(
      buildEditRequest(ifTarget(), {
        kind: "if-statement",
        conditionText: " /* keep */ ((α < 2)) ",
      }),
    ).toEqual({
      kind: "replace-if-condition",
      baseRevision: 8,
      targetId: "if:1",
      conditionText: " /* keep */ ((α < 2)) ",
    });

    expect(Object.isFrozen(forRequest)).toBe(true);
  });

  it("accepts exactly the shared 18 binary operators and rejects mismatched drafts", () => {
    expect(BINARY_OPERATORS).toHaveLength(18);
    for (const operator of BINARY_OPERATORS) {
      expect(
        buildEditRequest(binaryTarget(), {
          kind: "binary-expression",
          newOperator: operator,
        }),
      ).toMatchObject({ kind: "replace-binary-operator", newOperator: operator });
    }
    expect(() =>
      buildEditRequest(binaryTarget(), { kind: "binary-expression", newOperator: "=" }),
    ).toThrow(/不支持/u);
    expect(() =>
      buildEditRequest(literalTarget(), {
        kind: "if-statement",
        conditionText: "x",
      }),
    ).toThrow(/不匹配/u);
  });

  it("restores untouched CRLF textarea text and exposes changed text exactly", () => {
    const original = "\r\n  /* keep */ value\r\n";
    expect(readRawTextareaValue("\n  /* keep */ value\n", original)).toBe(original);
    expect(readRawTextareaValue(" \n/* changed */ value \n ", original)).toBe(
      " \n/* changed */ value \n ",
    );
    expect(readRawTextareaValue("", "   ")).toBe("");
  });

  it("copies exact diff text into deeply frozen confirmation rows", () => {
    const beforeRange = { from: 2, to: 9 };
    const plan: EditConfirmationPlan = {
      diffs: [
        {
          beforeRange,
          afterRange: { from: 2, to: 16 },
          beforeText: " \r\n<script>old</script> ",
          afterText: "\t<img onerror=edit>\n",
        },
        {
          beforeRange: { from: 20, to: 20 },
          afterRange: { from: 27, to: 27 },
          beforeText: "",
          afterText: "",
        },
      ],
    };
    const rows = buildConfirmationRows(plan);

    expect(rows).toEqual([
      {
        index: 0,
        beforeRange: { from: 2, to: 9 },
        afterRange: { from: 2, to: 16 },
        beforeText: " \r\n<script>old</script> ",
        afterText: "\t<img onerror=edit>\n",
      },
      {
        index: 1,
        beforeRange: { from: 20, to: 20 },
        afterRange: { from: 27, to: 27 },
        beforeText: "",
        afterText: "",
      },
    ]);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(rows.every(Object.isFrozen)).toBe(true);
    expect(rows[0]?.beforeRange).not.toBe(beforeRange);
    expect(Object.isFrozen(rows[0]?.beforeRange)).toBe(true);
  });

  it("never commits a cancelled or stale workflow", async () => {
    const events: string[] = [];
    const plan = confirmationPlan();
    const commit = vi.fn(() => {
      events.push("commit");
    });
    const callbacks = {
      plan: vi.fn(() => {
        events.push("plan");
        return plan;
      }),
      commit,
    };
    const request = buildEditRequest(literalTarget(), { kind: "literal", newText: "2" });

    await expect(
      runEditWorkflow(request, callbacks, () => {
        events.push("confirm");
        return false;
      }),
    ).resolves.toBe("cancelled");
    expect(events).toEqual(["plan", "confirm"]);
    expect(commit).not.toHaveBeenCalled();

    let current = true;
    callbacks.plan.mockImplementation(() => {
      current = false;
      return plan;
    });
    await expect(
      runEditWorkflow(
        request,
        callbacks,
        () => true,
        () => current,
      ),
    ).resolves.toBe("stale");
    expect(commit).not.toHaveBeenCalled();
  });

  it("commits only after an asynchronous plan and explicit confirmation", async () => {
    const events: string[] = [];
    const plan = confirmationPlan();
    const request = buildEditRequest(ifTarget(), {
      kind: "if-statement",
      conditionText: "next",
    });
    const result = await runEditWorkflow(
      request,
      {
        plan: async () => {
          events.push("plan");
          return plan;
        },
        commit: async (received) => {
          events.push("commit");
          expect(received).toBe(plan);
        },
      },
      async () => {
        events.push("confirm");
        return true;
      },
    );

    expect(result).toBe("committed");
    expect(events).toEqual(["plan", "confirm", "commit"]);
  });

  it("uses textContent/value and pre blocks instead of HTML injection APIs", async () => {
    const source = await readFile(new URL("../../src/ui/edit-panel.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\.innerHTML|insertAdjacentHTML|outerHTML/u);
    expect(source).toContain('createElement("pre")');
    expect(source).toContain("before.textContent = row.beforeText");
    expect(source).toContain("after.textContent = row.afterText");
  });
});

function confirmationPlan(): EditConfirmationPlan {
  return Object.freeze({
    diffs: Object.freeze([
      Object.freeze({
        beforeRange: textRange(0, 1),
        afterRange: textRange(0, 1),
        beforeText: "1",
        afterText: "2",
      }),
    ]),
  });
}

function literalTarget(): LiteralEditTarget {
  return Object.freeze({
    id: "literal:1",
    revision: 8,
    kind: "literal",
    nodeType: "number_literal",
    literalKind: "number",
    range: textRange(0, 1),
    text: "1",
  });
}

function binaryTarget(): BinaryExpressionEditTarget {
  return Object.freeze({
    id: "binary:1",
    revision: 8,
    kind: "binary-expression",
    nodeType: "binary_expression",
    range: textRange(0, 5),
    text: "a + b",
    leftNodeType: "identifier",
    leftRange: textRange(0, 1),
    leftText: "a",
    operatorRange: textRange(2, 3),
    operatorText: "+",
    rightNodeType: "identifier",
    rightRange: textRange(4, 5),
    rightText: "b",
    parentBinaryId: null,
    parentSide: null,
  });
}

function forTarget(): ForStatementEditTarget {
  return Object.freeze({
    id: "for:1",
    revision: 8,
    kind: "for-statement",
    nodeType: "for_statement",
    range: textRange(0, 32),
    text: "for (int i=0; i<n; i++) body();",
    initializerNodeType: "declaration",
    initializerRange: textRange(5, 12),
    initializerText: "int i=0",
    initializerEmpty: false,
    conditionNodeType: "binary_expression",
    conditionRange: textRange(13, 17),
    conditionText: " i<n",
    conditionEmpty: false,
    updateNodeType: "update_expression",
    updateRange: textRange(18, 22),
    updateText: " i++",
    updateEmpty: false,
    bodyNodeType: "expression_statement",
    bodyRange: textRange(24, 31),
    bodyText: "body();",
  });
}

function ifTarget(): IfStatementEditTarget {
  return Object.freeze({
    id: "if:1",
    revision: 8,
    kind: "if-statement",
    nodeType: "if_statement",
    range: textRange(0, 12),
    text: "if (x) yes();",
    conditionRange: textRange(4, 5),
    conditionText: "x",
    consequenceNodeType: "expression_statement",
    consequenceRange: textRange(7, 13),
    consequenceText: "yes();",
    alternativeNodeType: null,
    alternativeRange: null,
    alternativeText: null,
    bodyRange: textRange(7, 13),
    bodyText: "yes();",
  });
}
