import { describe, expect, it } from "vitest";
import { textRange, type Block, type SourceDoc, type SymbolRecord } from "../../src/core/model.js";
import { explainBlock } from "../../src/ui/explanation.js";

describe("M2 deterministic explanation", () => {
  it("explains a for block and exposes only in-range printf/NULL metadata", () => {
    const source = 'for (int i = 0; i < 3; i++) { printf("%p", NULL); }\noutside();';
    const forEnd = source.indexOf("\n");
    const block = syntaxBlock("for_statement", "statement", 0, forEnd);
    const iDeclaration = source.indexOf("i =");
    const iCondition = source.indexOf("i <");
    const iUpdate = source.indexOf("i++");
    const printfOffset = source.indexOf("printf");
    const nullOffset = source.indexOf("NULL");
    const outsideOffset = source.indexOf("outside");
    const document = sourceDoc(source, block, {
      symbols: [
        symbol("local:i", "i", "local-variable"),
        symbol("builtin:printf", "printf", "builtin-function", {
          description: "按格式把文本写到标准输出。",
          signatureText: "int printf(const char * restrict format, ...);",
          header: "<stdio.h>",
        }),
        symbol("builtin:NULL", "NULL", "builtin-object-macro", {
          description: "实现定义的空指针常量。",
          header: "<stddef.h>",
          valueText: "实现定义的空指针常量",
        }),
        symbol("unknown:outside", "outside", "unknown-external"),
      ],
      occurrences: [
        occurrence("local:i", iDeclaration, "declaration"),
        occurrence("local:i", iCondition, "use"),
        occurrence("local:i", iUpdate, "use"),
        occurrence("builtin:printf", printfOffset, "use", "builtin", "printf".length),
        occurrence("builtin:NULL", nullOffset, "use", "builtin", "NULL".length),
        occurrence("unknown:outside", outsideOffset, "use", "unknown", "outside".length),
      ],
    });

    const explanation = explainBlock(document, block);

    expect(explanation.title).toBe("for 循环");
    expect(explanation.summary).toContain("初始化、条件、更新和循环体");
    expect(explanation.symbols.map((entry) => entry.name)).toEqual(["i", "printf", "NULL"]);
    expect(explanation.symbols.find((entry) => entry.name === "i")?.usageCount).toBe(2);
    expect(explanation.symbols.find((entry) => entry.name === "printf")).toMatchObject({
      usageCount: 1,
      header: "<stdio.h>",
      signatureText: "int printf(const char * restrict format, ...);",
    });
    expect(explanation.symbols.find((entry) => entry.name === "NULL")).toMatchObject({
      usageCount: 1,
      kind: "builtin-object-macro",
      valueText: "实现定义的空指针常量",
    });
    expect(explanation.symbols.some((entry) => entry.name === "outside")).toBe(false);
  });

  it("surfaces only R11 concerns inside the selected block", () => {
    const source = "int a, b; a * b;\nint ok = 1;";
    const from = source.indexOf("a * b;");
    const to = from + "a * b;".length;
    const block = syntaxBlock("declaration", "declaration", from, to);
    const document = sourceDoc(source, block, {
      concerns: [
        Object.freeze({
          code: "variable-used-as-type",
          confidence: "low",
          blockRange: textRange(from, to),
          evidenceRange: textRange(from, from + 1),
          message: "类型位置的 a 同时解析为已声明变量；请对照原文复核。",
        }),
        Object.freeze({
          code: "unknown-type-name",
          confidence: "low",
          blockRange: textRange(to + 1, source.length),
          evidenceRange: textRange(source.lastIndexOf("int"), source.lastIndexOf("int") + 3),
          message: "区间外 concern 不应显示。",
        }),
      ],
    });

    const explanation = explainBlock(document, block);

    expect(explanation.title).toBe("声明");
    expect(explanation.concerns).toEqual(["类型位置的 a 同时解析为已声明变量；请对照原文复核。"]);
  });

  it("explains raw blocks without pretending to understand their semantics", () => {
    const source = "int main( {";
    const block: Block = Object.freeze({
      kind: "raw",
      reason: "parse-error",
      range: textRange(0, source.length),
      children: Object.freeze([]),
    });
    const explanation = explainBlock(sourceDoc(source, block), block);

    expect(explanation).toMatchObject({
      title: "原始 C（解析恢复）",
      concerns: [],
      symbols: [],
    });
    expect(explanation.summary).toContain("按原文保留");
    expect(JSON.stringify(explanation)).not.toMatch(/AI|算法标签|控制流图/u);
  });

  it.each([
    ["function_definition", "function", "函数"],
    ["declaration", "declaration", "声明"],
    ["if_statement", "statement", "if 条件分支"],
    ["while_statement", "statement", "while 循环"],
    ["do_statement", "statement", "do-while 循环"],
    ["switch_statement", "statement", "switch 分支"],
    ["case_statement", "statement", "case 分支"],
    ["return_statement", "statement", "return 返回"],
    ["break_statement", "statement", "break 跳出"],
    ["continue_statement", "statement", "continue 继续下一轮"],
    ["goto_statement", "statement", "goto 跳转"],
    ["labeled_statement", "statement", "语句标签"],
    ["expression_statement", "statement", "表达式语句"],
    ["preproc_include", "preprocessor", "包含头文件"],
    ["preproc_def", "preprocessor", "定义对象宏"],
    ["preproc_ifdef", "preprocessor", "条件编译"],
  ] as const)("uses the %s syntax template", (nodeType, role, expectedTitle) => {
    const source = "placeholder";
    const block = syntaxBlock(nodeType, role, 0, source.length);

    expect(explainBlock(sourceDoc(source, block), block).title).toBe(expectedTitle);
  });

  it("deep-freezes the complete explanation graph", () => {
    const source = "return NULL;";
    const block = syntaxBlock("return_statement", "statement", 0, source.length);
    const nullOffset = source.indexOf("NULL");
    const document = sourceDoc(source, block, {
      symbols: [
        symbol("builtin:NULL", "NULL", "builtin-object-macro", {
          valueText: "实现定义",
        }),
      ],
      occurrences: [occurrence("builtin:NULL", nullOffset, "use", "builtin", 4)],
      concerns: [
        Object.freeze({
          code: "unknown-type-name",
          confidence: "low",
          blockRange: block.range,
          evidenceRange: textRange(nullOffset, nullOffset + 4),
          message: "测试 concern",
        }),
      ],
    });

    const explanation = explainBlock(document, block);

    expect(Object.isFrozen(explanation)).toBe(true);
    expect(Object.isFrozen(explanation.details)).toBe(true);
    expect(Object.isFrozen(explanation.symbols)).toBe(true);
    expect(explanation.symbols.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(explanation.concerns)).toBe(true);
  });
});

interface SnapshotOverrides {
  readonly symbols?: readonly SymbolRecord[];
  readonly occurrences?: SourceDoc["symbols"]["occurrences"];
  readonly concerns?: SourceDoc["concerns"];
}

function sourceDoc(source: string, block: Block, overrides: SnapshotOverrides = {}): SourceDoc {
  return Object.freeze({
    source,
    range: textRange(0, source.length),
    blocks: Object.freeze([block]),
    comments: Object.freeze([]),
    parse: Object.freeze({
      mode: "tree-sitter",
      hasError: block.kind === "raw" && block.reason === "parse-error",
      errorRanges: Object.freeze([]),
      missingOffsets: Object.freeze([]),
    }),
    issues: Object.freeze([]),
    concerns: Object.freeze([...(overrides.concerns ?? [])]),
    symbols: Object.freeze({
      symbols: Object.freeze([...(overrides.symbols ?? [])]),
      occurrences: Object.freeze([...(overrides.occurrences ?? [])]),
    }),
  });
}

function syntaxBlock(
  nodeType: string,
  role: "function" | "statement" | "declaration" | "preprocessor",
  from: number,
  to: number,
): Block {
  return Object.freeze({
    kind: "syntax",
    role,
    nodeType,
    range: textRange(from, to),
    children: Object.freeze([]),
  });
}

function symbol(
  id: string,
  name: string,
  kind: SymbolRecord["kind"],
  metadata: Partial<
    Pick<SymbolRecord, "description" | "signatureText" | "header" | "valueText">
  > = {},
): SymbolRecord {
  return Object.freeze({
    id,
    name,
    kind,
    declarationRanges: Object.freeze([]),
    confidence: kind === "unknown-external" ? "unknown" : "certain",
    ...metadata,
  });
}

function occurrence(
  symbolId: string,
  from: number,
  role: "declaration" | "use",
  resolution: "local" | "file" | "user-macro" | "builtin" | "unknown" = "local",
  length = 1,
): SourceDoc["symbols"]["occurrences"][number] {
  return Object.freeze({ symbolId, range: textRange(from, from + length), role, resolution });
}
