import type { Block, SourceDoc, SymbolRecord } from "../core/model.js";
import type { AnalysisFindingRuleId, ProgramAnalysisSnapshot } from "../analysis/model.js";
import type { InterfaceLocale } from "./interface-preferences.js";
import {
  explainBlock,
  type ExplanationAnalysis,
  type ExplanationDataFlowFact,
  type ExplanationFinding,
  type ExplanationMemoryFact,
} from "./explanation.js";

interface ExplanationViewCopy {
  readonly ariaLabel: string;
  readonly empty: string;
  readonly usageCount: (count: number) => string;
  readonly lowConfidence: (message: string) => string;
  readonly analysisTitle: string;
  readonly groups: Readonly<Record<"dataFlow" | "memory" | "diagnostics", string>>;
  readonly pathConditional: string;
  readonly dataFlow: Readonly<
    Record<"read" | "conditionalRead" | "write" | "maybeWrite" | "escape" | "maybeEscape", string>
  >;
  readonly escapeOrigin: Readonly<Record<"stored-address" | "array-decay", string>>;
  readonly memoryQualifiers: Readonly<
    Record<"conditionalPath" | "conditionalExecution" | "repeatable", string>
  >;
  readonly memory: Readonly<Record<"allocation" | "free" | "dereference", string>>;
  readonly confidence: Readonly<Record<ExplanationFinding["confidence"], string>>;
  readonly findingRules: Readonly<Record<AnalysisFindingRuleId, string>>;
  readonly symbolKinds: Readonly<Record<SymbolRecord["kind"], string>>;
}

const EXPLANATION_COPY: Readonly<Record<InterfaceLocale, ExplanationViewCopy>> = Object.freeze({
  "zh-CN": Object.freeze({
    ariaLabel: "代码解释",
    empty: "这里是源码空白或注释区。选择一条语句积木查看作用。",
    usageCount: (count: number) => `${String(count)} 处使用`,
    lowConfidence: (message: string) => `低置信度：${message}`,
    analysisTitle: "程序分析事实",
    groups: Object.freeze({ dataFlow: "数据流", memory: "内存", diagnostics: "诊断" }),
    pathConditional: "条件路径内",
    dataFlow: Object.freeze({
      read: "读取",
      conditionalRead: "条件读取",
      write: "写入",
      maybeWrite: "可能写入",
      escape: "逃逸",
      maybeEscape: "可能逃逸",
    }),
    escapeOrigin: Object.freeze({
      "stored-address": "地址被存储",
      "array-decay": "数组退化为指针",
    }),
    memoryQualifiers: Object.freeze({
      conditionalPath: "条件路径内",
      conditionalExecution: "条件执行",
      repeatable: "可能重复",
    }),
    memory: Object.freeze({
      allocation: "分配尝试",
      free: "释放调用",
      dereference: "解引用",
    }),
    confidence: Object.freeze({ certain: "确定", likely: "可能", hint: "提示" }),
    findingRules: Object.freeze({
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
    }),
    symbolKinds: Object.freeze({
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
    }),
  }),
  en: Object.freeze({
    ariaLabel: "Code explanation",
    empty: "This is blank source or a comment region. Select a statement block to explain it.",
    usageCount: (count: number) => `${String(count)} uses`,
    lowConfidence: (message: string) => `Low confidence: ${message}`,
    analysisTitle: "Program analysis facts",
    groups: Object.freeze({ dataFlow: "Data flow", memory: "Memory", diagnostics: "Diagnostics" }),
    pathConditional: "on a conditional path",
    dataFlow: Object.freeze({
      read: "Read",
      conditionalRead: "Conditional read",
      write: "Write",
      maybeWrite: "Possible write",
      escape: "Escape",
      maybeEscape: "Possible escape",
    }),
    escapeOrigin: Object.freeze({
      "stored-address": "address stored",
      "array-decay": "array decays to pointer",
    }),
    memoryQualifiers: Object.freeze({
      conditionalPath: "on a conditional path",
      conditionalExecution: "conditional execution",
      repeatable: "may repeat",
    }),
    memory: Object.freeze({
      allocation: "Allocation attempt",
      free: "Free call",
      dereference: "Dereference",
    }),
    confidence: Object.freeze({ certain: "Certain", likely: "Likely", hint: "Hint" }),
    findingRules: Object.freeze({
      "unreachable-code": "Unreachable code",
      "uninitialized-read": "Read of an uninitialized variable",
      "literal-out-of-bounds": "Literal index out of bounds",
      "loop-off-by-one": "Loop boundary is off by one",
      "memory-leak": "Memory leak",
      "possible-memory-leak": "Possible memory leak",
      "double-free": "Double free",
      "possible-double-free": "Possible double free",
      "use-after-free": "Use after free",
      "possible-use-after-free": "Possible use after free",
      "malloc-sizeof-pointer": "Allocation size uses pointer width",
      "unchecked-allocation": "Allocation result is not checked for null",
      "runtime-bound-check": "Runtime bounds check required",
      "loop-index-mismatch": "Loop index does not match the array",
    }),
    symbolKinds: Object.freeze({
      parameter: "Parameter",
      "local-variable": "Local variable",
      "file-variable": "File variable",
      "enum-constant": "Enum constant",
      function: "Function",
      typedef: "typedef",
      "object-macro": "Object macro",
      "builtin-function": "Standard library function",
      "builtin-typedef": "Standard typedef",
      "builtin-object-macro": "Standard object macro",
      "unknown-external": "Unknown external symbol",
    }),
  }),
});

interface ExplanationRenderSnapshot {
  readonly sourceDocument: SourceDoc | null;
  readonly block: Block | null;
  readonly focusedSymbol: SymbolRecord | null;
  readonly analysis: ProgramAnalysisSnapshot | null | undefined;
}

interface ExplanationLocaleBinding {
  readonly localeHost: HTMLElement;
  readonly onLocaleChange: (event: Event) => void;
  readonly observer: MutationObserver | null;
  locale: InterfaceLocale;
  snapshot: ExplanationRenderSnapshot;
}

const explanationBindings = new WeakMap<HTMLElement, ExplanationLocaleBinding>();

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
  const binding = ensureExplanationLocaleBinding(host);
  binding.snapshot = Object.freeze({ sourceDocument, block, focusedSymbol, analysis });
  renderExplanationContent(host, binding.snapshot, binding.locale);
}

export function destroyExplanationView(host: HTMLElement): void {
  const binding = explanationBindings.get(host);
  if (binding === undefined) return;
  binding.localeHost.removeEventListener("workbench-locale-change", binding.onLocaleChange);
  binding.observer?.disconnect();
  explanationBindings.delete(host);
}

function renderExplanationContent(
  host: HTMLElement,
  snapshot: ExplanationRenderSnapshot,
  locale: InterfaceLocale,
): void {
  const { sourceDocument, block, focusedSymbol, analysis } = snapshot;
  const ownerDocument = host.ownerDocument;
  const copy = EXPLANATION_COPY[locale];
  host.className = "explanation";
  host.dataset.locale = locale;
  host.setAttribute("aria-label", copy.ariaLabel);
  host.replaceChildren();

  if (sourceDocument === null || block === null) {
    const empty = ownerDocument.createElement("p");
    empty.className = "empty-state";
    empty.textContent = copy.empty;
    host.append(empty);
    return;
  }

  const explanation = explainBlock(sourceDocument, block, analysis, locale);
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
        copy.symbolKinds[symbol.kind],
        symbol.header,
        copy.usageCount(symbol.usageCount),
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
      item.textContent = copy.lowConfidence(message);
      concerns.append(item);
    }
    host.append(concerns);
  }

  if (explanation.analysis !== undefined) {
    renderAnalysis(ownerDocument, host, explanation.analysis, copy);
  }
}

function renderAnalysis(
  ownerDocument: Document,
  host: HTMLElement,
  analysis: ExplanationAnalysis,
  copy: ExplanationViewCopy,
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
  title.textContent = copy.analysisTitle;
  section.append(title);
  appendFactGroup(
    ownerDocument,
    section,
    copy.groups.dataFlow,
    "explanation__data-flow",
    analysis.dataFlow.map((fact) => dataFlowText(fact, copy)),
  );
  appendFactGroup(
    ownerDocument,
    section,
    copy.groups.memory,
    "explanation__memory-facts",
    analysis.memory.map((fact) => memoryText(fact, copy)),
  );
  appendFactGroup(
    ownerDocument,
    section,
    copy.groups.diagnostics,
    "explanation__findings",
    analysis.findings.map((finding) => findingText(finding, copy)),
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

function dataFlowText(fact: ExplanationDataFlowFact, copy: ExplanationViewCopy): string {
  const pathQualifier = fact.control === "conditional-path" ? ` · ${copy.pathConditional}` : "";
  switch (fact.kind) {
    case "read":
      return `${fact.execution === "conditional" ? copy.dataFlow.conditionalRead : copy.dataFlow.read} · ${fact.variable}${pathQualifier}`;
    case "write":
      return `${
        fact.strength === "weak" ||
        fact.valueState === "maybe-written" ||
        fact.control === "conditional-path"
          ? copy.dataFlow.maybeWrite
          : copy.dataFlow.write
      } · ${fact.variable}${pathQualifier}`;
    case "escape":
      return `${
        fact.control === "conditional-path" ? copy.dataFlow.maybeEscape : copy.dataFlow.escape
      } · ${fact.variable} · ${copy.escapeOrigin[fact.origin]}${pathQualifier}`;
  }
}

function memoryText(fact: ExplanationMemoryFact, copy: ExplanationViewCopy): string {
  const qualifiers = [
    fact.control === "conditional-path" ? copy.memoryQualifiers.conditionalPath : undefined,
    fact.execution === "conditional" ? copy.memoryQualifiers.conditionalExecution : undefined,
    fact.repeatable ? copy.memoryQualifiers.repeatable : undefined,
  ].filter((value): value is string => value !== undefined);
  let message: string;
  switch (fact.kind) {
    case "allocation":
      message = `${copy.memory.allocation} · ${fact.variable} · ${fact.allocator}`;
      break;
    case "free":
      message = `${copy.memory.free} · ${fact.variable}`;
      break;
    case "dereference":
      message = `${copy.memory.dereference} · ${fact.variable} · ${dereferenceFormLabel(fact.form)}`;
      break;
  }
  return qualifiers.length === 0 ? message : `${message} · ${qualifiers.join(" · ")}`;
}

function findingText(finding: ExplanationFinding, copy: ExplanationViewCopy): string {
  const subject = finding.subject === null ? "" : ` · ${finding.subject}`;
  return `${copy.confidence[finding.confidence]} · ${copy.findingRules[finding.ruleId]}${subject}`;
}

function dereferenceFormLabel(form: "indirection" | "subscript" | "arrow"): string {
  const labels: Readonly<Record<"indirection" | "subscript" | "arrow", string>> = {
    indirection: "*",
    subscript: "[]",
    arrow: "->",
  };
  return labels[form];
}

export function resolveExplanationLocale(value: unknown): InterfaceLocale {
  if (typeof value !== "string") return "zh-CN";
  return value.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

function ensureExplanationLocaleBinding(host: HTMLElement): ExplanationLocaleBinding {
  const existing = explanationBindings.get(host);
  if (existing !== undefined) return existing;
  const ownerDocument = host.ownerDocument;
  const localeHost = resolveLocaleHost(host);
  const initialSnapshot: ExplanationRenderSnapshot = Object.freeze({
    sourceDocument: null,
    block: null,
    focusedSymbol: null,
    analysis: undefined,
  });
  let binding: ExplanationLocaleBinding;
  const rerender = (candidate: unknown): void => {
    if (!explanationBindings.has(host)) return;
    binding.locale = resolveExplanationLocale(candidate);
    renderExplanationContent(host, binding.snapshot, binding.locale);
  };
  const onLocaleChange = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    rerender(
      typeof detail === "object" && detail !== null && "locale" in detail
        ? detail.locale
        : localeHost.dataset.locale,
    );
  };
  const MutationObserverConstructor = ownerDocument.defaultView?.MutationObserver;
  const observer =
    MutationObserverConstructor === undefined
      ? null
      : new MutationObserverConstructor(() => rerender(localeHost.dataset.locale));
  binding = {
    localeHost,
    onLocaleChange,
    observer,
    locale: resolveExplanationLocale(
      localeHost.dataset.locale ??
        ownerDocument.documentElement?.dataset.locale ??
        ownerDocument.documentElement?.lang,
    ),
    snapshot: initialSnapshot,
  };
  explanationBindings.set(host, binding);
  localeHost.addEventListener("workbench-locale-change", onLocaleChange);
  observer?.observe(localeHost, {
    attributes: true,
    attributeFilter: ["data-locale"],
  });
  return binding;
}

function resolveLocaleHost(host: HTMLElement): HTMLElement {
  if (typeof host.closest !== "function") return host;
  return host.closest<HTMLElement>("[data-locale]") ?? host;
}

function appendText(ownerDocument: Document, parent: HTMLElement, text: string): void {
  const element = ownerDocument.createElement("span");
  element.textContent = text;
  parent.append(element);
}
