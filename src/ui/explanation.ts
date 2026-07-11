import type {
  Block,
  SourceDoc,
  SymbolKind,
  SymbolOccurrence,
  SymbolRecord,
  TextRange,
} from "../core/model.js";
import type {
  AnalysisFindingConfidence,
  AnalysisFindingReason,
  AnalysisFindingRuleId,
  DefUseFact,
  DefUseVariable,
  MemoryEventFact,
  ProgramAnalysisSnapshot,
} from "../analysis/model.js";
import { fingerprintSource } from "../shared/source-snapshot.js";

export interface ExplanationSymbol {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly description?: string;
  readonly signatureText?: string;
  readonly header?: string;
  readonly valueText?: string;
  readonly usageCount: number;
}

interface ExplanationFactBase {
  readonly variable: string;
  readonly range: TextRange;
  /** Whether this fact belongs to a deeper branch or loop body relative to the selected block. */
  readonly control: "direct" | "conditional-path";
}

export interface ExplanationReadFact extends ExplanationFactBase {
  readonly kind: "read";
  readonly execution: "always" | "conditional";
}

export interface ExplanationWriteFact extends ExplanationFactBase {
  readonly kind: "write";
  readonly strength: "strong" | "weak";
  readonly valueState: "written" | "maybe-written";
}

export interface ExplanationEscapeFact extends ExplanationFactBase {
  readonly kind: "escape";
  readonly origin: "stored-address" | "array-decay";
}

export type ExplanationDataFlowFact =
  ExplanationReadFact | ExplanationWriteFact | ExplanationEscapeFact;

interface ExplanationMemoryFactBase extends ExplanationFactBase {
  readonly execution: "always" | "conditional";
  readonly repeatable: boolean;
}

export interface ExplanationAllocationFact extends ExplanationMemoryFactBase {
  readonly kind: "allocation";
  readonly allocator: "malloc" | "calloc";
}

export interface ExplanationFreeFact extends ExplanationMemoryFactBase {
  readonly kind: "free";
}

export interface ExplanationDereferenceFact extends ExplanationMemoryFactBase {
  readonly kind: "dereference";
  readonly form: "indirection" | "subscript" | "arrow";
}

export type ExplanationMemoryFact =
  ExplanationAllocationFact | ExplanationFreeFact | ExplanationDereferenceFact;

export interface ExplanationFinding {
  readonly ruleId: AnalysisFindingRuleId;
  readonly reason: AnalysisFindingReason;
  readonly confidence: AnalysisFindingConfidence;
  readonly subject: string | null;
  readonly primaryRange: TextRange;
}

export interface ExplanationAnalysis {
  readonly dataFlow: readonly ExplanationDataFlowFact[];
  readonly memory: readonly ExplanationMemoryFact[];
  readonly findings: readonly ExplanationFinding[];
}

export interface DeterministicExplanation {
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly symbols: readonly ExplanationSymbol[];
  readonly concerns: readonly string[];
  /** Present only when an exact-source analysis snapshot was supplied. */
  readonly analysis?: ExplanationAnalysis;
}

interface ExplanationTemplate {
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
}

interface SymbolAggregate {
  readonly symbol: SymbolRecord;
  readonly firstOffset: number;
  readonly usageCount: number;
}

/** Builds a deterministic, read-only explanation without AI or algorithm recognition. */
export function explainBlock(
  document: SourceDoc,
  block: Block,
  analysis?: ProgramAnalysisSnapshot | null,
): DeterministicExplanation {
  assertBlockRange(document.range, block.range);
  const template = templateForBlock(block);
  const details = Object.freeze([...template.details]);
  const symbols = collectSymbols(document, block.range);
  const concerns = collectConcerns(document, block.range);
  const analysisFacts = collectAnalysis(document, block, analysis);

  return Object.freeze({
    title: template.title,
    summary: template.summary,
    details,
    symbols,
    concerns,
    ...(analysisFacts === null ? {} : { analysis: analysisFacts }),
  });
}

function collectAnalysis(
  document: SourceDoc,
  block: Block,
  analysis: ProgramAnalysisSnapshot | null | undefined,
): ExplanationAnalysis | null {
  if (
    analysis === null ||
    analysis === undefined ||
    analysis.sourceLength !== document.source.length ||
    analysis.sourceFingerprint !== fingerprintSource(document.source)
  ) {
    return null;
  }
  const blockRange = block.range;

  const cfg = analysis.functions
    .filter((candidate) => containsRange(candidate.range, blockRange))
    .sort(
      (left, right) =>
        left.range.to - left.range.from - (right.range.to - right.range.from) ||
        left.range.from - right.range.from ||
        left.id.localeCompare(right.id),
    )[0];
  if (cfg === undefined) return freezeAnalysis([], [], []);

  const defUse = analysis.defUse.find((candidate) => candidate.functionId === cfg.id);
  const memoryEvents = analysis.memoryEvents.find((candidate) => candidate.functionId === cfg.id);
  const variables = new Map(
    (defUse?.variables ?? []).map((variable) => [variable.id, variable] as const),
  );
  const dataFlow =
    defUse?.status === "complete" ? collectDataFlowFacts(defUse.facts, variables, block) : [];
  const memory =
    memoryEvents?.status === "complete"
      ? collectMemoryFacts(memoryEvents.facts, variables, block)
      : [];
  const findings = analysis.findings
    .filter(
      (finding) => finding.functionId === cfg.id && containsRange(blockRange, finding.primaryRange),
    )
    .sort(
      (left, right) =>
        left.primaryRange.from - right.primaryRange.from ||
        left.primaryRange.to - right.primaryRange.to ||
        left.ruleId.localeCompare(right.ruleId) ||
        left.id.localeCompare(right.id),
    )
    .map((finding): ExplanationFinding =>
      Object.freeze({
        ruleId: finding.ruleId,
        reason: finding.reason,
        confidence: finding.confidence,
        subject: finding.subject,
        primaryRange: freezeRange(finding.primaryRange),
      }),
    );

  return freezeAnalysis(dataFlow, memory, findings);
}

function collectDataFlowFacts(
  facts: readonly DefUseFact[],
  variables: ReadonlyMap<string, DefUseVariable>,
  block: Block,
): ExplanationDataFlowFact[] {
  return facts.flatMap((fact) => {
    const control = controlForNestedFact(block, fact.nodeRange);
    return fact.effects
      .filter((effect) => containsRange(block.range, effect.range))
      .flatMap((effect): ExplanationDataFlowFact[] => {
        const variable = variables.get(effect.variableId);
        if (variable === undefined) return [];
        const base = { variable: variable.name, range: freezeRange(effect.range), control };
        switch (effect.kind) {
          case "use":
            return [Object.freeze({ ...base, kind: "read", execution: effect.execution })];
          case "def":
            if (effect.valueState === "uninitialized") return [];
            return [
              Object.freeze({
                ...base,
                kind: "write",
                strength: effect.strength,
                valueState: effect.valueState,
              }),
            ];
          case "escape":
            return [Object.freeze({ ...base, kind: "escape", origin: effect.origin })];
        }
      });
  });
}

function collectMemoryFacts(
  facts: readonly MemoryEventFact[],
  variables: ReadonlyMap<string, DefUseVariable>,
  block: Block,
): ExplanationMemoryFact[] {
  return facts
    .flatMap((fact) =>
      fact.events.map((event) => ({
        event,
        control: controlForNestedFact(block, fact.nodeRange),
      })),
    )
    .map((record, order) => ({ ...record, order }))
    .filter(({ event }) => containsRange(block.range, event.range))
    .sort(
      (left, right) =>
        left.event.range.from - right.event.range.from ||
        left.event.range.to - right.event.range.to ||
        left.order - right.order,
    )
    .flatMap(({ event, control }): ExplanationMemoryFact[] => {
      const variable = variables.get(event.variableId);
      if (variable === undefined) return [];
      const base = {
        variable: variable.name,
        range: freezeRange(event.range),
        control,
        execution: event.execution,
        repeatable: event.repeatable,
      };
      switch (event.kind) {
        case "allocation":
          return [Object.freeze({ ...base, kind: "allocation", allocator: event.allocator })];
        case "free":
          return [Object.freeze({ ...base, kind: "free" })];
        case "dereference":
          return [Object.freeze({ ...base, kind: "dereference", form: event.form })];
        case "null-assignment":
        case "null-guard":
        case "escape":
          return [];
      }
    });
}

const CONDITIONAL_CONTROL_NODE_TYPES = new Set([
  "if_statement",
  "switch_statement",
  "case_statement",
  "while_statement",
  "for_statement",
  "do_statement",
]);

function controlForNestedFact(
  selectedBlock: Block,
  nodeRange: TextRange,
): ExplanationFactBase["control"] {
  const path = containingBlockPath(selectedBlock, nodeRange);
  if (path === null) return "direct";
  return path
    .slice(0, -1)
    .some((block) => block.kind === "syntax" && CONDITIONAL_CONTROL_NODE_TYPES.has(block.nodeType))
    ? "conditional-path"
    : "direct";
}

function containingBlockPath(block: Block, range: TextRange): readonly Block[] | null {
  if (!containsRange(block.range, range)) return null;
  for (const child of block.children) {
    const childPath = containingBlockPath(child, range);
    if (childPath !== null) return [block, ...childPath];
  }
  return [block];
}

function freezeAnalysis(
  dataFlow: readonly ExplanationDataFlowFact[],
  memory: readonly ExplanationMemoryFact[],
  findings: readonly ExplanationFinding[],
): ExplanationAnalysis {
  return Object.freeze({
    dataFlow: Object.freeze([...dataFlow]),
    memory: Object.freeze([...memory]),
    findings: Object.freeze([...findings]),
  });
}

function freezeRange(range: TextRange): TextRange {
  return Object.freeze({ from: range.from, to: range.to });
}

function templateForBlock(block: Block): ExplanationTemplate {
  if (block.kind === "raw") {
    switch (block.reason) {
      case "parse-error":
        return template(
          "原始 C（解析恢复）",
          "解析器无法安全地把这段源码拆成语法积木，因此按原文保留。",
          ["这通常表示源码暂时不完整或包含语法错误。", "查看原文可以核对被保留的精确范围。"],
        );
      case "unsupported-syntax":
        return template(
          "原始 C（暂不支持）",
          "这段源码超出当前结构化投影的承诺范围，因此按原文保留。",
          ["保留为原始 C 不表示代码一定错误。", "系统不会为积木外观擅自改写这段源码。"],
        );
      case "not-yet-structured":
        return template("原始 C", "这段源码目前保持为未拆解的原始 C。", [
          "原始范围仍是文本事实源的一部分。",
          "当前面板只解释已确定的语法结构。",
        ]);
    }
  }

  switch (block.nodeType) {
    case "function_definition":
      return template("函数", "定义一个可以被调用的 C 函数。", [
        "函数头给出返回类型、名称和参数。",
        "函数体中的语句按源码顺序执行，控制语句可能改变该顺序。",
      ]);
    case "declaration":
    case "type_definition":
      return template("声明", "向当前 C 作用域引入名称或类型。", [
        "声明可能包含初始值，也可能只描述名称和类型。",
        "这里不推断变量在算法中的角色。",
      ]);
    case "if_statement":
      return template("if 条件分支", "根据条件真假选择要执行的分支。", [
        "条件非零时执行 then 分支。",
        "条件为零时执行可选的 else 分支。",
      ]);
    case "for_statement":
      return template("for 循环", "按初始化、条件、更新和循环体组织重复执行。", [
        "初始化部分通常在进入循环时执行一次。",
        "每轮先检查条件，执行循环体后再执行更新部分。",
      ]);
    case "while_statement":
      return template("while 循环", "只要条件非零，就重复执行循环体。", [
        "条件在每轮循环体之前检查。",
        "若第一次检查即为零，循环体不会执行。",
      ]);
    case "do_statement":
      return template("do-while 循环", "先执行循环体，再检查是否继续。", [
        "循环体至少执行一次。",
        "每轮末尾的条件非零时继续下一轮。",
      ]);
    case "switch_statement":
      return template("switch 分支", "根据一个表达式的值选择 case 入口。", [
        "case 给出候选入口，default 是可选的兜底入口。",
        "是否继续落入后续 case 取决于 break、return 等控制语句。",
      ]);
    case "case_statement":
      return template("case 分支", "标记 switch 中的一个候选执行入口。", [
        "匹配后从该位置开始执行。",
        "case 本身不自动结束 switch。",
      ]);
    case "return_statement":
      return template("return 返回", "结束当前函数，并可把一个值交给调用方。", [
        "执行 return 后，当前函数中后续语句不再执行。",
      ]);
    case "break_statement":
      return template("break 跳出", "结束最近一层循环或 switch。", [
        "控制流继续到该循环或 switch 后面的语句。",
      ]);
    case "continue_statement":
      return template("continue 继续下一轮", "跳过本轮剩余部分并进入下一轮循环。", [
        "在 for 循环中，更新部分仍会在再次检查条件前执行。",
      ]);
    case "goto_statement":
      return template("goto 跳转", "把控制流转移到当前函数内的指定标签。", [
        "该解释只描述语法作用，不判断跳转是否适合当前算法。",
      ]);
    case "labeled_statement":
      return template("语句标签", "为当前函数中的语句提供一个 goto 目标。", [
        "标签属于函数作用域中的控制流名称。",
      ]);
    case "expression_statement":
      return template("表达式语句", "计算一个表达式，并保留它产生的 C 语言副作用。", [
        "常见副作用包括赋值、函数调用和自增或自减。",
        "这里不推断表达式的业务目的。",
      ]);
    case "preproc_include":
      return template("包含头文件", "请求预处理器包含指定头文件的内容。", [
        "头文件通常提供函数声明、类型和宏。",
        "v1 不解析项目本地头文件中的跨文件符号。",
      ]);
    case "preproc_def":
      return template("定义对象宏", "定义一个由预处理器执行文本替换的对象式宏。", [
        "宏替换发生在 C 语法解析之前。",
        "当前解释不会把宏展开结果当成新的源码事实源。",
      ]);
    case "preproc_ifdef":
      return template("条件编译", "根据宏是否已定义选择参与编译的源码分支。", [
        "未被选中的分支仍保留在原始源码中。",
        "面板展示的是源码结构，不判断本次构建选择了哪一支。",
      ]);
  }

  switch (block.role) {
    case "function":
      return template("函数结构", "表示一个当前可以安全定位的函数结构。", [
        "解释仅来自确定性的语法节点类型。",
      ]);
    case "declaration":
      return template("声明结构", "表示一条当前可以安全定位的声明。", [
        "这里不执行类型检查或数据流分析。",
      ]);
    case "preprocessor":
      return template("预处理指令", "由 C 预处理阶段处理的源码结构。", [
        "预处理发生在常规 C 编译之前。",
      ]);
    case "statement":
      return template("C 语句", "表示一条当前可以安全定位的 C 语句。", [
        "这里不推断算法模式或运行结果。",
      ]);
  }
}

function collectSymbols(document: SourceDoc, blockRange: TextRange): readonly ExplanationSymbol[] {
  const symbolById = new Map(document.symbols.symbols.map((symbol) => [symbol.id, symbol]));
  const aggregates = new Map<string, SymbolAggregate>();

  for (const occurrence of document.symbols.occurrences) {
    if (!containsRange(blockRange, occurrence.range)) {
      continue;
    }
    const symbol = symbolById.get(occurrence.symbolId);
    if (symbol === undefined) {
      continue;
    }
    const previous = aggregates.get(symbol.id);
    aggregates.set(symbol.id, {
      symbol,
      firstOffset: Math.min(previous?.firstOffset ?? occurrence.range.from, occurrence.range.from),
      usageCount: (previous?.usageCount ?? 0) + useWeight(occurrence),
    });
  }

  return Object.freeze(
    [...aggregates.values()]
      .sort(
        (left, right) =>
          left.firstOffset - right.firstOffset ||
          left.symbol.name.localeCompare(right.symbol.name) ||
          left.symbol.kind.localeCompare(right.symbol.kind),
      )
      .map(freezeExplanationSymbol),
  );
}

function useWeight(occurrence: SymbolOccurrence): number {
  return occurrence.role === "use" ? 1 : 0;
}

function freezeExplanationSymbol(aggregate: SymbolAggregate): ExplanationSymbol {
  const { symbol } = aggregate;
  return Object.freeze({
    name: symbol.name,
    kind: symbol.kind,
    usageCount: aggregate.usageCount,
    ...(symbol.description === undefined ? {} : { description: symbol.description }),
    ...(symbol.signatureText === undefined ? {} : { signatureText: symbol.signatureText }),
    ...(symbol.header === undefined ? {} : { header: symbol.header }),
    ...(symbol.valueText === undefined ? {} : { valueText: symbol.valueText }),
  });
}

function collectConcerns(document: SourceDoc, blockRange: TextRange): readonly string[] {
  const ordered = document.concerns
    .filter((concern) => containsRange(blockRange, concern.evidenceRange))
    .sort(
      (left, right) =>
        left.evidenceRange.from - right.evidenceRange.from ||
        left.evidenceRange.to - right.evidenceRange.to ||
        left.code.localeCompare(right.code),
    );
  const messages: string[] = [];
  const seen = new Set<string>();
  for (const concern of ordered) {
    if (!seen.has(concern.message)) {
      seen.add(concern.message);
      messages.push(concern.message);
    }
  }
  return Object.freeze(messages);
}

function template(title: string, summary: string, details: readonly string[]): ExplanationTemplate {
  return Object.freeze({ title, summary, details: Object.freeze([...details]) });
}

function containsRange(container: TextRange, candidate: TextRange): boolean {
  return candidate.from >= container.from && candidate.to <= container.to;
}

function assertBlockRange(documentRange: TextRange, blockRange: TextRange): void {
  if (
    blockRange.from < documentRange.from ||
    blockRange.to > documentRange.to ||
    blockRange.from >= blockRange.to
  ) {
    throw new RangeError(
      `block range [${blockRange.from}, ${blockRange.to}) 越出 document range [${documentRange.from}, ${documentRange.to})`,
    );
  }
}
