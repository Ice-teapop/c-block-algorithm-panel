import type { Block, SourceDoc, SymbolRecord } from "../core/model.js";
import type { AnalysisFindingRuleId, ProgramAnalysisSnapshot } from "../analysis/model.js";
import {
  explainBlock,
  type ExplanationAnalysis,
  type ExplanationDataFlowFact,
  type ExplanationFinding,
  type ExplanationMemoryFact,
} from "./explanation.js";

const EMPTY_EXPLANATION = "这里是源码空白或注释区。选择一条语句积木查看作用。";

/**
 * Replaces the explanation host with a deterministic, text-only view.
 *
 * The caller owns selection and session state. This view reads only the
 * supplied snapshot values and writes user-controlled text through
 * `textContent`, never through HTML parsing.
 */
export function renderExplanationView(
  host: HTMLElement,
  sourceDocument: SourceDoc | null,
  block: Block | null,
  focusedSymbol: SymbolRecord | null,
  analysis?: ProgramAnalysisSnapshot | null,
): void {
  const ownerDocument = host.ownerDocument;
  host.replaceChildren();

  if (sourceDocument === null || block === null) {
    const empty = ownerDocument.createElement("p");
    empty.className = "empty-state";
    empty.textContent = EMPTY_EXPLANATION;
    host.append(empty);
    return;
  }

  const explanation = explainBlock(sourceDocument, block, analysis);
  const title = ownerDocument.createElement("h3");
  title.className = "explanation__title";
  title.textContent =
    focusedSymbol === null ? explanation.title : `${explanation.title} · ${focusedSymbol.name}`;
  const summary = ownerDocument.createElement("p");
  summary.className = "explanation__summary";
  summary.textContent = explanation.summary;
  host.append(title, summary);

  if (explanation.details.length > 0) {
    const details = ownerDocument.createElement("ul");
    details.className = "explanation__details";
    for (const detail of explanation.details) {
      const item = ownerDocument.createElement("li");
      item.textContent = detail;
      details.append(item);
    }
    host.append(details);
  }

  const symbols = [...explanation.symbols].sort((left, right) => {
    const leftFocused = focusedSymbol?.name === left.name && focusedSymbol.kind === left.kind;
    const rightFocused = focusedSymbol?.name === right.name && focusedSymbol.kind === right.kind;
    return Number(rightFocused) - Number(leftFocused);
  });
  if (symbols.length > 0) {
    const list = ownerDocument.createElement("ul");
    list.className = "explanation__symbols";
    for (const symbol of symbols) {
      const item = ownerDocument.createElement("li");
      item.className = "symbol-card";
      if (focusedSymbol?.name === symbol.name && focusedSymbol.kind === symbol.kind) {
        item.dataset.focused = "true";
      }
      const name = ownerDocument.createElement("code");
      name.textContent =
        symbol.valueText === undefined ? symbol.name : `${symbol.name} = ${symbol.valueText}`;
      const meta = ownerDocument.createElement("span");
      meta.className = "symbol-card__meta";
      meta.textContent = [
        symbolKindLabel(symbol.kind),
        symbol.header,
        `${symbol.usageCount} 处使用`,
      ]
        .filter((value): value is string => value !== undefined)
        .join(" · ");
      item.append(name, meta);
      if (symbol.signatureText !== undefined) {
        appendText(ownerDocument, item, symbol.signatureText);
      }
      if (symbol.description !== undefined) {
        appendText(ownerDocument, item, symbol.description);
      }
      list.append(item);
    }
    host.append(list);
  }

  if (explanation.concerns.length > 0) {
    const concerns = ownerDocument.createElement("ul");
    concerns.className = "explanation__concerns";
    for (const message of explanation.concerns) {
      const item = ownerDocument.createElement("li");
      item.className = "concern-card";
      item.textContent = `低置信度：${message}`;
      concerns.append(item);
    }
    host.append(concerns);
  }

  if (explanation.analysis !== undefined) {
    renderAnalysis(ownerDocument, host, explanation.analysis);
  }
}

function renderAnalysis(
  ownerDocument: Document,
  host: HTMLElement,
  analysis: ExplanationAnalysis,
): void {
  if (
    analysis.dataFlow.length === 0 &&
    analysis.memory.length === 0 &&
    analysis.findings.length === 0
  ) {
    return;
  }
  const section = ownerDocument.createElement("section");
  section.className = "explanation__analysis";
  const title = ownerDocument.createElement("h4");
  title.textContent = "程序分析事实";
  section.append(title);
  appendFactGroup(
    ownerDocument,
    section,
    "数据流",
    "explanation__data-flow",
    analysis.dataFlow.map(dataFlowText),
  );
  appendFactGroup(
    ownerDocument,
    section,
    "内存",
    "explanation__memory-facts",
    analysis.memory.map(memoryText),
  );
  appendFactGroup(
    ownerDocument,
    section,
    "诊断",
    "explanation__findings",
    analysis.findings.map(findingText),
  );
  host.append(section);
}

function appendFactGroup(
  ownerDocument: Document,
  section: HTMLElement,
  label: string,
  className: string,
  messages: readonly string[],
): void {
  if (messages.length === 0) return;
  const heading = ownerDocument.createElement("h5");
  heading.textContent = label;
  const list = ownerDocument.createElement("ul");
  list.className = className;
  for (const message of messages) {
    const item = ownerDocument.createElement("li");
    item.className = "analysis-fact";
    item.textContent = message;
    list.append(item);
  }
  section.append(heading, list);
}

function dataFlowText(fact: ExplanationDataFlowFact): string {
  const pathQualifier = fact.control === "conditional-path" ? " · 条件路径内" : "";
  switch (fact.kind) {
    case "read":
      return `${fact.execution === "conditional" ? "条件读取" : "读取"} · ${fact.variable}${pathQualifier}`;
    case "write":
      return `${
        fact.strength === "weak" ||
        fact.valueState === "maybe-written" ||
        fact.control === "conditional-path"
          ? "可能写入"
          : "写入"
      } · ${fact.variable}${pathQualifier}`;
    case "escape":
      return `${fact.control === "conditional-path" ? "可能逃逸" : "逃逸"} · ${fact.variable} · ${
        fact.origin === "stored-address" ? "地址被存储" : "数组退化为指针"
      }${pathQualifier}`;
  }
}

function memoryText(fact: ExplanationMemoryFact): string {
  const qualifiers = [
    fact.control === "conditional-path" ? "条件路径内" : undefined,
    fact.execution === "conditional" ? "条件执行" : undefined,
    fact.repeatable ? "可能重复" : undefined,
  ].filter((value): value is string => value !== undefined);
  let message: string;
  switch (fact.kind) {
    case "allocation":
      message = `分配尝试 · ${fact.variable} · ${fact.allocator}`;
      break;
    case "free":
      message = `释放调用 · ${fact.variable}`;
      break;
    case "dereference":
      message = `解引用 · ${fact.variable} · ${dereferenceFormLabel(fact.form)}`;
      break;
  }
  return qualifiers.length === 0 ? message : `${message} · ${qualifiers.join(" · ")}`;
}

function findingText(finding: ExplanationFinding): string {
  const subject = finding.subject === null ? "" : ` · ${finding.subject}`;
  return `${confidenceLabel(finding.confidence)} · ${findingRuleLabel(finding.ruleId)}${subject}`;
}

function dereferenceFormLabel(form: "indirection" | "subscript" | "arrow"): string {
  const labels: Readonly<Record<"indirection" | "subscript" | "arrow", string>> = {
    indirection: "*",
    subscript: "[]",
    arrow: "->",
  };
  return labels[form];
}

function confidenceLabel(confidence: ExplanationFinding["confidence"]): string {
  const labels: Readonly<Record<ExplanationFinding["confidence"], string>> = {
    certain: "确定",
    likely: "可能",
    hint: "提示",
  };
  return labels[confidence];
}

function findingRuleLabel(ruleId: AnalysisFindingRuleId): string {
  const labels: Readonly<Record<AnalysisFindingRuleId, string>> = {
    "unreachable-code": "不可达代码",
    "uninitialized-read": "读取未初始化变量",
    "literal-out-of-bounds": "字面量下标越界",
    "loop-off-by-one": "循环边界偏一",
    "memory-leak": "内存泄漏",
    "possible-memory-leak": "可能的内存泄漏",
    "double-free": "重复释放",
    "possible-double-free": "可能的重复释放",
    "use-after-free": "释放后使用",
    "possible-use-after-free": "可能的释放后使用",
    "malloc-sizeof-pointer": "分配大小使用了指针宽度",
    "unchecked-allocation": "分配结果未经空值检查",
    "runtime-bound-check": "需要运行时边界检查",
    "loop-index-mismatch": "循环索引与数组不匹配",
  };
  return labels[ruleId];
}

function symbolKindLabel(kind: SymbolRecord["kind"]): string {
  const labels: Readonly<Record<SymbolRecord["kind"], string>> = {
    parameter: "参数",
    "local-variable": "局部变量",
    "file-variable": "文件变量",
    "enum-constant": "枚举常量",
    function: "函数",
    typedef: "typedef",
    "object-macro": "对象宏",
    "builtin-function": "标准库函数",
    "builtin-typedef": "标准 typedef",
    "builtin-object-macro": "标准对象宏",
    "unknown-external": "未知外部符号",
  };
  return labels[kind];
}

function appendText(ownerDocument: Document, parent: HTMLElement, text: string): void {
  const element = ownerDocument.createElement("span");
  element.textContent = text;
  parent.append(element);
}
