import { describe, expect, it } from "vitest";
import { analyzeProgramCst } from "../../src/analysis/index.js";
import { textRange, type Block, type SourceDoc, type SymbolRecord } from "../../src/core/model.js";
import { renderExplanationView } from "../../src/ui/explanation-view.js";
import { createTestParser } from "../core/parser-fixture.js";

describe("explanation view", () => {
  it("renders the existing empty-state copy without requiring application state", () => {
    const fixture = fakeHost();

    renderExplanationView(fixture.host, null, null, null);

    expect(fixture.root.children).toHaveLength(1);
    expect(fixture.root.children[0]).toMatchObject({
      tagName: "P",
      className: "empty-state",
      textContent: "这里是源码空白或注释区。选择一条语句积木查看作用。",
    });
  });

  it("preserves explanation copy, focuses the matching symbol, and labels metadata", () => {
    const source = 'for (;;) total += printf("%d", total);';
    const block = syntaxBlock("for_statement", 0, source.length);
    const total = symbol("local:total", "total", "local-variable", {
      valueText: "0",
      description: "累计值",
    });
    const printf = symbol("builtin:printf", "printf", "builtin-function", {
      header: "<stdio.h>",
      signatureText: "int printf(const char *format, ...)",
      description: "格式化输出",
    });
    const document = sourceDoc(
      source,
      block,
      [total, printf],
      [
        occurrence(total.id, source.indexOf("total"), 5),
        occurrence(printf.id, source.indexOf("printf"), 6),
      ],
    );
    const fixture = fakeHost();

    renderExplanationView(fixture.host, document, block, printf);

    expect(fixture.root.children[0]?.textContent).toBe("for 循环 · printf");
    expect(fixture.root.children[1]?.textContent).toBe(
      "按初始化、条件、更新和循环体组织重复执行。",
    );
    const symbolList = fixture.root.findByClass("explanation__symbols");
    expect(symbolList?.children.map((item) => item.children[0]?.textContent)).toEqual([
      "printf",
      "total = 0",
    ]);
    expect(symbolList?.children[0]?.dataset.focused).toBe("true");
    expect(symbolList?.children[0]?.children.map((child) => child.textContent)).toEqual([
      "printf",
      "标准库函数 · <stdio.h> · 1 处使用",
      "int printf(const char *format, ...)",
      "格式化输出",
    ]);
    expect(fixture.root.findByClass("explanation__analysis")).toBeUndefined();
  });

  it("keeps source-derived strings as textContent and never parses them as markup", () => {
    const injected = '<img src=x onerror="globalThis.pwned=true">';
    const source = "value;";
    const block = syntaxBlock("expression_statement", 0, source.length);
    const unsafeSymbol = symbol("local:unsafe", injected, "local-variable", {
      description: "<script>throw new Error('executed')</script>",
      valueText: "<b>7</b>",
    });
    const document = sourceDoc(
      source,
      block,
      [unsafeSymbol],
      [occurrence(unsafeSymbol.id, 0, 5)],
      "<svg onload=alert(1)>",
    );
    const fixture = fakeHost();

    renderExplanationView(fixture.host, document, block, unsafeSymbol);

    expect(fixture.document.createdTags).toEqual(
      expect.arrayContaining(["H3", "P", "UL", "LI", "CODE", "SPAN"]),
    );
    expect(fixture.document.createdTags).not.toContain("IMG");
    expect(fixture.document.createdTags).not.toContain("SCRIPT");
    expect(fixture.root.findByTag("H3")?.textContent).toBe(`表达式语句 · ${injected}`);
    expect(fixture.root.findByTag("CODE")?.textContent).toBe(`${injected} = <b>7</b>`);
    expect(fixture.root.findByClass("concern-card")?.textContent).toBe(
      "低置信度：<svg onload=alert(1)>",
    );
  });

  it("renders conservative analysis groups and finding confidence through textContent", async () => {
    const parser = await createTestParser();
    const functionSource =
      "int f(void) { int x = 0; int y = x; int *q = &x; int *p = malloc(4); (void)q; *p = 1; free(p); return *p + y; }";
    const source = ["#include <stdlib.h>", functionSource].join("\n");

    try {
      const inspected = parser.inspect(source, 1, ({ rootNode, document }) =>
        Object.freeze({
          document,
          analysis: analyzeProgramCst({ source, revision: 1, rootNode, document }),
        }),
      ).result;
      const block = findBlockByText(inspected.document, source, functionSource);
      const fixture = fakeHost();

      renderExplanationView(fixture.host, inspected.document, block, null, inspected.analysis);

      expect(fixture.root.findByClass("explanation__analysis")?.children[0]?.textContent).toBe(
        "程序分析事实",
      );
      expect(
        fixture.root
          .findByClass("explanation__data-flow")
          ?.children.map((item) => item.textContent),
      ).toEqual(["写入 · x", "读取 · x", "写入 · y", "逃逸 · x · 地址被存储", "读取 · y"]);
      expect(
        fixture.root
          .findByClass("explanation__memory-facts")
          ?.children.map((item) => item.textContent),
      ).toEqual(["分配尝试 · p · malloc", "解引用 · p · *", "释放调用 · p", "解引用 · p · *"]);
      expect(
        fixture.root.findByClass("explanation__findings")?.children.map((item) => item.textContent),
      ).toEqual(["提示 · 分配结果未经空值检查 · p", "确定 · 释放后使用 · p"]);

      const injected = '<img src=x onerror="globalThis.pwned=true">';
      const adversarial = Object.freeze({
        ...inspected.analysis,
        findings: Object.freeze(
          inspected.analysis.findings.map((finding, index) =>
            index === 0 ? Object.freeze({ ...finding, subject: injected }) : finding,
          ),
        ),
      });
      renderExplanationView(fixture.host, inspected.document, block, null, adversarial);

      expect(fixture.root.findByClass("explanation__findings")?.children[0]?.textContent).toBe(
        `提示 · 分配结果未经空值检查 · ${injected}`,
      );
      expect(fixture.document.createdTags).not.toContain("IMG");
    } finally {
      parser.dispose();
    }
  });

  it("labels branch-body facts as conditional for a function selection but not their own statement", async () => {
    const parser = await createTestParser();
    const functionSource =
      "int f(int c) { int x = 0; int y = 0; int *p = malloc(4); if (c) { y = x; free(p); } return y; }";
    const source = ["#include <stdlib.h>", functionSource].join("\n");

    try {
      const inspected = parser.inspect(source, 1, ({ rootNode, document }) =>
        Object.freeze({
          document,
          analysis: analyzeProgramCst({ source, revision: 1, rootNode, document }),
        }),
      ).result;
      const functionBlock = findBlockByText(inspected.document, source, functionSource);
      const assignmentBlock = findBlockByText(inspected.document, source, "y = x;");
      const freeBlock = findBlockByText(inspected.document, source, "free(p);");
      const fixture = fakeHost();

      renderExplanationView(
        fixture.host,
        inspected.document,
        functionBlock,
        null,
        inspected.analysis,
      );
      const functionDataFlow = fixture.root
        .findByClass("explanation__data-flow")
        ?.children.map((item) => item.textContent);
      const functionMemory = fixture.root
        .findByClass("explanation__memory-facts")
        ?.children.map((item) => item.textContent);
      expect(functionDataFlow).toContain("读取 · x · 条件路径内");
      expect(functionDataFlow).toContain("可能写入 · y · 条件路径内");
      expect(functionDataFlow).toContain("读取 · c");
      expect(functionMemory).toContain("释放调用 · p · 条件路径内");

      renderExplanationView(
        fixture.host,
        inspected.document,
        assignmentBlock,
        null,
        inspected.analysis,
      );
      expect(
        fixture.root
          .findByClass("explanation__data-flow")
          ?.children.map((item) => item.textContent),
      ).toEqual(["读取 · x", "写入 · y"]);

      renderExplanationView(fixture.host, inspected.document, freeBlock, null, inspected.analysis);
      expect(
        fixture.root
          .findByClass("explanation__memory-facts")
          ?.children.map((item) => item.textContent),
      ).toEqual(["释放调用 · p"]);
    } finally {
      parser.dispose();
    }
  });
});

class FakeDocument {
  readonly createdTags: string[] = [];

  createElement(tagName: string): FakeElement {
    const element = new FakeElement(tagName, this);
    this.createdTags.push(element.tagName);
    return element;
  }
}

class FakeElement {
  readonly tagName: string;
  readonly ownerDocument: FakeDocument;
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  className = "";
  textContent = "";

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  findByClass(className: string): FakeElement | undefined {
    return this.find((element) => element.className === className);
  }

  findByTag(tagName: string): FakeElement | undefined {
    const normalized = tagName.toUpperCase();
    return this.find((element) => element.tagName === normalized);
  }

  private find(predicate: (element: FakeElement) => boolean): FakeElement | undefined {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const match = child.find(predicate);
      if (match !== undefined) return match;
    }
    return undefined;
  }
}

function fakeHost(): { document: FakeDocument; root: FakeElement; host: HTMLElement } {
  const document = new FakeDocument();
  const root = document.createElement("section");
  return { document, root, host: root as unknown as HTMLElement };
}

function sourceDoc(
  source: string,
  block: Block,
  symbols: readonly SymbolRecord[],
  occurrences: SourceDoc["symbols"]["occurrences"],
  concernMessage?: string,
): SourceDoc {
  return Object.freeze({
    source,
    range: textRange(0, source.length),
    blocks: Object.freeze([block]),
    comments: Object.freeze([]),
    parse: Object.freeze({
      mode: "tree-sitter",
      hasError: false,
      errorRanges: Object.freeze([]),
      missingOffsets: Object.freeze([]),
    }),
    issues: Object.freeze([]),
    concerns: Object.freeze(
      concernMessage === undefined
        ? []
        : [
            Object.freeze({
              code: "unknown-type-name" as const,
              confidence: "low" as const,
              blockRange: block.range,
              evidenceRange: textRange(0, 1),
              message: concernMessage,
            }),
          ],
    ),
    symbols: Object.freeze({
      symbols: Object.freeze([...symbols]),
      occurrences: Object.freeze([...occurrences]),
    }),
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
    confidence: "certain",
    ...metadata,
  });
}

function occurrence(
  symbolId: string,
  from: number,
  length: number,
): SourceDoc["symbols"]["occurrences"][number] {
  return Object.freeze({
    symbolId,
    range: textRange(from, from + length),
    role: "use",
    resolution: "local",
  });
}

function findBlockByText(document: SourceDoc, source: string, text: string): Block {
  const matches: Block[] = [];
  const visit = (blocks: readonly Block[]): void => {
    for (const block of blocks) {
      if (source.slice(block.range.from, block.range.to) === text) matches.push(block);
      visit(block.children);
    }
  };
  visit(document.blocks);
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(`block 数量异常：${JSON.stringify(text)}=${String(matches.length)}`);
  }
  return matches[0];
}
