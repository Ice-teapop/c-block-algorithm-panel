import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createBlockIndex,
  type BlockIndexEntry,
  type CAnalysisSnapshot,
  type CParser,
} from "../../src/core/index.js";
import { createLearningCatalog } from "../../src/learning/index.js";
import {
  buildAssemblyInsertRequest,
  createAssemblyController,
} from "../../src/app/assembly-controller.js";
import type { StructureEditController } from "../../src/app/structure-edit-controller.js";
import { createTestParser } from "../core/parser-fixture.js";

let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("assembly insertion request", () => {
  it("binds a current active template to an exact statement-side slot", () => {
    const source = "int main(void) {\n  return 0;\n}\n";
    const analysis = parser.analyze(source, 7);
    const target = requireBlock(analysis, "return_statement");
    const request = buildAssemblyInsertRequest(createLearningCatalog(), analysis, {
      templateId: "builtin.control.for",
      target,
      position: "before",
    });

    expect(request).toMatchObject({
      kind: "insert-statement",
      baseRevision: 7,
      expectedTargetText: "return 0;",
      position: "before",
      statementText: "for (int i = 0; i < limit; i++) {\n  action();\n}",
    });
    expect(Object.isFrozen(request)).toBe(true);
  });

  it("rejects deprecated definitions and non-statement targets", () => {
    const source = "int main(void) {\n  return 0;\n}\n";
    const analysis = parser.analyze(source, 8);
    const catalog = createLearningCatalog();
    catalog.createCustom({
      id: "custom.old",
      version: "1.0.0",
      label: "旧积木",
      category: "custom",
      stage: "c.basics",
      source: "old();",
      description: "旧模板",
      fragmentKind: "statement",
    });
    catalog.deprecateCustom("custom.old", { reason: "已替换" });

    expect(() =>
      buildAssemblyInsertRequest(catalog, analysis, {
        templateId: "custom.old",
        target: requireBlock(analysis, "return_statement"),
        position: "after",
      }),
    ).toThrow(/不可用于新插入/u);
    expect(() =>
      buildAssemblyInsertRequest(catalog, analysis, {
        templateId: "builtin.c.return-success",
        target: requireBlock(analysis, "function_definition"),
        position: "after",
      }),
    ).toThrow(/明确插槽/u);
  });

  it("accepts continue in a nested loop compound and rejects it outside a loop", () => {
    const source = `int main(void) {
  int value = 0;
  while (value < 3) {
    if (value == 1) {
      value++;
    }
  }
  return value;
}
`;
    const analysis = parser.analyze(source, 10);
    const catalog = createLearningCatalog();
    const entries = createBlockIndex(analysis.document).entries.filter(
      (candidate) => candidate.block?.kind === "syntax",
    );
    const nestedExpression = entries.find(
      (candidate) =>
        candidate.block?.kind === "syntax" && candidate.block.nodeType === "expression_statement",
    );
    const outsideReturn = entries.find(
      (candidate) =>
        candidate.block?.kind === "syntax" && candidate.block.nodeType === "return_statement",
    );
    if (nestedExpression === undefined || outsideReturn === undefined) {
      throw new Error("missing nested placement targets");
    }

    expect(() =>
      buildAssemblyInsertRequest(catalog, analysis, {
        templateId: "builtin.control.continue",
        target: nestedExpression,
        position: "before",
      }),
    ).not.toThrow();
    expect(() =>
      buildAssemblyInsertRequest(catalog, analysis, {
        templateId: "builtin.control.continue",
        target: outsideReturn,
        position: "before",
      }),
    ).toThrow(/循环或 switch/u);
  });
});

describe("assembly controller", () => {
  it("routes drag and keyboard insertion through the existing structure edit owner", async () => {
    const source = "int main(void) {\n  return 0;\n}\n";
    const analysis = parser.analyze(source, 9);
    const target = requireBlock(analysis, "return_statement");
    const run = vi.fn<StructureEditController["run"]>(async () => undefined);
    const onError = vi.fn();
    const controller = createAssemblyController({
      catalog: createLearningCatalog(),
      getAnalysis: () => analysis,
      structureEdits: { run } as unknown as StructureEditController,
      onError,
    });

    await controller.insert({
      templateId: "builtin.c.declare-integer",
      target,
      position: "before",
    });
    await controller.insertAfterSelected("builtin.c.return-success", target);
    await controller.insertAfterSelected("builtin.c.return-success", null);

    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[0]?.[0]).toMatchObject({ position: "before" });
    expect(run.mock.calls[1]?.[0]).toMatchObject({ position: "after" });
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("先在") }),
    );
  });
});

function requireBlock(analysis: CAnalysisSnapshot, nodeType: string): BlockIndexEntry {
  const entry = createBlockIndex(analysis.document).entries.find(
    (candidate) => candidate.block?.kind === "syntax" && candidate.block.nodeType === nodeType,
  );
  if (entry === undefined) throw new Error(`missing ${nodeType}`);
  return entry;
}
