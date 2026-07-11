import type { Node } from "web-tree-sitter";
import { textRange, type SourceDoc, type TextRange } from "../core/model.js";
import { buildFunctionVariableBindings } from "./function-bindings.js";
import type {
  DefUseDefinitionEffect,
  DefUseFact,
  DefUseVariable,
  FunctionCfg,
  LoopConditionComparisonFact,
  LoopConditionFact,
  LoopConditionOperand,
  LoopConditionOperator,
  LoopRegion,
  LoopZeroInitializerFact,
  ReachingDefinitionFact,
} from "./model.js";

export interface LoopConditionFactsInput {
  readonly functionNode: Node;
  readonly cfg: FunctionCfg;
  readonly document: SourceDoc;
  readonly variables: readonly DefUseVariable[];
  readonly facts: readonly DefUseFact[];
  readonly reachingDefinitions: readonly ReachingDefinitionFact[];
  readonly loopRegions: readonly LoopRegion[];
}

interface DefinitionSite {
  readonly definition: DefUseDefinitionEffect;
  readonly nodeId: string;
}

const COMPARISON_OPERATORS = new Set<LoopConditionOperator>(["<", "<=", ">", ">="]);

const COMPLEX_BODY_NODE_TYPES = new Set([
  "break_statement",
  "case_statement",
  "continue_statement",
  "do_statement",
  "for_statement",
  "goto_statement",
  "if_statement",
  "labeled_statement",
  "return_statement",
  "switch_statement",
  "while_statement",
]);

/**
 * Publishes syntax facts that remain deliberately separate from loop-value conclusions.
 * The caller invokes this only after the function's def-use analysis is complete.
 */
export function collectLoopConditionFacts(
  input: LoopConditionFactsInput,
): readonly LoopConditionFact[] {
  assertAlignedInput(input);
  const sourceLength = input.document.source.length;
  const bindings = buildFunctionVariableBindings({
    document: input.document,
    functionRange: input.cfg.range,
    variables: input.variables,
    functionNode: input.functionNode,
  });
  const loopNodes = indexLoopNodes(input.functionNode, sourceLength);
  const definitionSites = indexDefinitionSites(input.facts);
  const flowByNodeId = new Map(input.reachingDefinitions.map((flow) => [flow.nodeId, flow]));
  const identifierByRange = new Map(
    input.functionNode
      .descendantsOfType("identifier")
      .map((identifier) => [rangeKey(checkedNodeRange(identifier, sourceLength)), identifier]),
  );

  return Object.freeze(
    input.loopRegions.map((loop) => {
      const loopNode = loopNodes.get(loopNodeKey(loop));
      if (loopNode === undefined) {
        throw new TypeError(`loop condition fact 缺少对应 CST 节点：${loop.id}`);
      }
      const condition = loopNode.childForFieldName("condition");
      const body = loopNode.childForFieldName("body");
      const conditionRange = condition === null ? null : checkedNodeRange(condition, sourceLength);
      const comparisons =
        condition === null
          ? Object.freeze([])
          : collectComparisons(condition, bindings.variableByOccurrenceRange, sourceLength);
      const zeroInitializers = collectZeroInitializers({
        loop,
        variables: input.variables,
        entryFlow: flowByNodeId.get(loop.entryNodeId),
        definitionSites,
        declarationNodeByRange: bindings.declarationNodeByRange,
        variableByOccurrenceRange: bindings.variableByOccurrenceRange,
        identifierByRange,
        sourceLength,
      });
      return Object.freeze({
        loopId: loop.id,
        conditionRange,
        comparisons,
        zeroInitializers,
        bodyControl: body === null || bodyIsComplex(body) ? "complex" : "straight-line",
      });
    }),
  );
}

function collectComparisons(
  condition: Node,
  variableByOccurrenceRange: ReadonlyMap<string, DefUseVariable>,
  sourceLength: number,
): readonly LoopConditionComparisonFact[] {
  const comparisons = flattenTopLevelConjunction(condition)
    .map((candidate) => collectComparison(candidate, variableByOccurrenceRange, sourceLength))
    .filter((comparison): comparison is LoopConditionComparisonFact => comparison !== null)
    .sort((left, right) => left.range.from - right.range.from || left.range.to - right.range.to);
  return Object.freeze(comparisons);
}

function flattenTopLevelConjunction(node: Node): readonly Node[] {
  const candidate = unwrapParentheses(node);
  if (
    candidate.type !== "binary_expression" ||
    candidate.childForFieldName("operator")?.text !== "&&"
  ) {
    return [candidate];
  }
  const left = candidate.childForFieldName("left");
  const right = candidate.childForFieldName("right");
  if (left === null || right === null) return [];
  return [...flattenTopLevelConjunction(left), ...flattenTopLevelConjunction(right)];
}

function collectComparison(
  node: Node,
  variableByOccurrenceRange: ReadonlyMap<string, DefUseVariable>,
  sourceLength: number,
): LoopConditionComparisonFact | null {
  const candidate = unwrapParentheses(node);
  if (candidate.type !== "binary_expression") return null;
  const operatorNode = candidate.childForFieldName("operator");
  const leftNode = candidate.childForFieldName("left");
  const rightNode = candidate.childForFieldName("right");
  const operator = operatorNode?.text;
  if (
    operatorNode === null ||
    operatorNode === undefined ||
    leftNode === null ||
    rightNode === null ||
    operator === undefined ||
    !isComparisonOperator(operator)
  ) {
    return null;
  }
  const left = collectOperand(leftNode, variableByOccurrenceRange, sourceLength);
  const right = collectOperand(rightNode, variableByOccurrenceRange, sourceLength);
  if (left === null || right === null || (left.kind !== "variable" && right.kind !== "variable")) {
    return null;
  }
  return Object.freeze({
    range: checkedNodeRange(candidate, sourceLength),
    operator,
    operatorRange: checkedNodeRange(operatorNode, sourceLength),
    left,
    right,
  });
}

function collectOperand(
  node: Node,
  variableByOccurrenceRange: ReadonlyMap<string, DefUseVariable>,
  sourceLength: number,
): LoopConditionOperand | null {
  const candidate = unwrapParentheses(node);
  if (candidate.type === "identifier") {
    const range = checkedNodeRange(candidate, sourceLength);
    const variable = variableByOccurrenceRange.get(rangeKey(range));
    return variable === undefined
      ? null
      : Object.freeze({ kind: "variable", variableId: variable.id, range });
  }
  const literal = parseSignedDecimalInteger(candidate, sourceLength);
  return literal === null
    ? null
    : Object.freeze({ kind: "literal", value: literal.value, range: literal.range });
}

function parseSignedDecimalInteger(
  node: Node,
  sourceLength: number,
): { readonly value: number; readonly range: TextRange } | null {
  const candidate = unwrapParentheses(node);
  let sign = 1n;
  let literal = candidate;
  let signedToken = true;
  if (candidate.type === "unary_expression") {
    const operator = candidate.childForFieldName("operator")?.text;
    const argument = candidate.childForFieldName("argument");
    if ((operator !== "+" && operator !== "-") || argument === null) return null;
    sign = operator === "-" ? -1n : 1n;
    literal = unwrapParentheses(argument);
    signedToken = false;
  }
  const decimal = signedToken ? /^[+-]?(?:0|[1-9][0-9]*)$/u : /^(?:0|[1-9][0-9]*)$/u;
  if (literal.type !== "number_literal" || !decimal.test(literal.text)) {
    return null;
  }
  let value: bigint;
  try {
    value = sign * BigInt(literal.text);
  } catch {
    return null;
  }
  if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Object.freeze({ value: Number(value), range: checkedNodeRange(candidate, sourceLength) });
}

function collectZeroInitializers(input: {
  readonly loop: LoopRegion;
  readonly variables: readonly DefUseVariable[];
  readonly entryFlow: ReachingDefinitionFact | undefined;
  readonly definitionSites: ReadonlyMap<string, DefinitionSite>;
  readonly declarationNodeByRange: ReadonlyMap<string, Node>;
  readonly variableByOccurrenceRange: ReadonlyMap<string, DefUseVariable>;
  readonly identifierByRange: ReadonlyMap<string, Node>;
  readonly sourceLength: number;
}): readonly LoopZeroInitializerFact[] {
  if (input.entryFlow === undefined) {
    throw new TypeError(`loop entry 缺少 reaching definition fact：${input.loop.id}`);
  }
  const memberIds = new Set(input.loop.nodeIds);
  const reachingSites = input.entryFlow.inDefinitionEffectIds.map((definitionId) => {
    const site = input.definitionSites.get(definitionId);
    if (site === undefined) {
      throw new TypeError(`reaching definition 引用了未知 effect：${definitionId}`);
    }
    return site;
  });
  const output: LoopZeroInitializerFact[] = [];
  for (const variable of input.variables) {
    if (!isPlainInt(variable, input.declarationNodeByRange)) continue;
    const external = reachingSites.filter(
      (site) => site.definition.variableId === variable.id && !memberIds.has(site.nodeId),
    );
    if (external.length !== 1) continue;
    const site = external[0];
    if (site === undefined) continue;
    const valueRange = exactDecimalZeroDefinitionRange({
      definition: site.definition,
      variable,
      declarationNodeByRange: input.declarationNodeByRange,
      variableByOccurrenceRange: input.variableByOccurrenceRange,
      identifierByRange: input.identifierByRange,
      sourceLength: input.sourceLength,
    });
    if (valueRange === null) continue;
    output.push(
      Object.freeze({
        variableId: variable.id,
        definitionEffectId: site.definition.id,
        valueRange,
      }),
    );
  }
  return Object.freeze(output);
}

function isPlainInt(
  variable: DefUseVariable,
  declarationNodeByRange: ReadonlyMap<string, Node>,
): boolean {
  if (
    variable.storage !== "scalar" ||
    variable.tracking !== "precise" ||
    variable.confidence !== "certain" ||
    variable.declarationRanges.length !== 1
  ) {
    return false;
  }
  const declarationRange = variable.declarationRanges[0];
  const nameNode =
    declarationRange === undefined
      ? undefined
      : declarationNodeByRange.get(rangeKey(declarationRange));
  if (nameNode === undefined) return false;
  const owner = nearestDeclarationOwner(nameNode);
  if (owner === null) return false;
  const type = owner.childForFieldName("type");
  return (
    type?.type === "primitive_type" &&
    type.text === "int" &&
    !owner.namedChildren.some((child) => child.type === "type_qualifier")
  );
}

function exactDecimalZeroDefinitionRange(input: {
  readonly definition: DefUseDefinitionEffect;
  readonly variable: DefUseVariable;
  readonly declarationNodeByRange: ReadonlyMap<string, Node>;
  readonly variableByOccurrenceRange: ReadonlyMap<string, DefUseVariable>;
  readonly identifierByRange: ReadonlyMap<string, Node>;
  readonly sourceLength: number;
}): TextRange | null {
  if (input.definition.strength !== "strong" || input.definition.valueState !== "written") {
    return null;
  }
  let value: Node | null = null;
  if (input.definition.origin === "declaration") {
    const nameNode = input.declarationNodeByRange.get(rangeKey(input.definition.range));
    value = nameNode === undefined ? null : nearestInitializerValue(nameNode);
  } else if (input.definition.origin === "assignment") {
    const target = input.identifierByRange.get(rangeKey(input.definition.range));
    if (
      target === undefined ||
      input.variableByOccurrenceRange.get(rangeKey(input.definition.range))?.id !==
        input.variable.id
    ) {
      return null;
    }
    const assignment = nearestDirectAssignment(target);
    value = assignment?.childForFieldName("right") ?? null;
  } else {
    return null;
  }
  const literal = value === null ? null : unwrapParentheses(value);
  return literal?.type === "number_literal" && literal.text === "0"
    ? checkedNodeRange(literal, input.sourceLength)
    : null;
}

function nearestInitializerValue(nameNode: Node): Node | null {
  let current = nameNode.parent;
  while (current !== null && current.type !== "function_definition") {
    if (current.type === "init_declarator") return current.childForFieldName("value");
    if (current.type === "declaration" || current.type === "parameter_declaration") return null;
    current = current.parent;
  }
  return null;
}

function nearestDirectAssignment(target: Node): Node | null {
  let current = target.parent;
  while (current !== null && current.type !== "function_definition") {
    if (current.type === "assignment_expression") {
      const left = current.childForFieldName("left");
      return current.childForFieldName("operator")?.text === "=" &&
        left !== null &&
        containsNode(left, target)
        ? current
        : null;
    }
    if (
      current.type === "declaration" ||
      current.type === "expression_statement" ||
      current.type === "return_statement"
    ) {
      return null;
    }
    current = current.parent;
  }
  return null;
}

function nearestDeclarationOwner(node: Node): Node | null {
  let current = node.parent;
  while (current !== null && current.type !== "function_definition") {
    if (current.type === "declaration" || current.type === "parameter_declaration") {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function bodyIsComplex(body: Node): boolean {
  if (COMPLEX_BODY_NODE_TYPES.has(body.type) || body.type === "call_expression") return true;
  return body.descendantsOfType([...COMPLEX_BODY_NODE_TYPES, "call_expression"]).length > 0;
}

function indexLoopNodes(functionNode: Node, sourceLength: number): ReadonlyMap<string, Node> {
  const output = new Map<string, Node>();
  const nodes = [
    ...functionNode.descendantsOfType("for_statement"),
    ...functionNode.descendantsOfType("while_statement"),
    ...functionNode.descendantsOfType("do_statement"),
  ];
  for (const node of nodes) {
    const key = `${node.type}:${rangeKey(checkedNodeRange(node, sourceLength))}`;
    if (output.has(key)) throw new TypeError(`重复 loop CST range：${key}`);
    output.set(key, node);
  }
  return output;
}

function indexDefinitionSites(facts: readonly DefUseFact[]): ReadonlyMap<string, DefinitionSite> {
  const output = new Map<string, DefinitionSite>();
  for (const fact of facts) {
    for (const effect of fact.effects) {
      if (effect.kind !== "def") continue;
      if (output.has(effect.id)) throw new TypeError(`重复 definition effect id：${effect.id}`);
      output.set(effect.id, { definition: effect, nodeId: fact.nodeId });
    }
  }
  return output;
}

function loopNodeKey(loop: LoopRegion): string {
  const nodeType =
    loop.kind === "for"
      ? "for_statement"
      : loop.kind === "while"
        ? "while_statement"
        : "do_statement";
  return `${nodeType}:${rangeKey(loop.range)}`;
}

function assertAlignedInput(input: LoopConditionFactsInput): void {
  const functionRange = checkedNodeRange(input.functionNode, input.document.source.length);
  if (!sameRange(functionRange, input.cfg.range)) {
    throw new TypeError("loop condition functionNode 与 CFG 不属于同一函数");
  }
  if (
    input.document.source.slice(functionRange.from, functionRange.to) !== input.functionNode.text
  ) {
    throw new TypeError("loop condition functionNode 与 SourceDoc 不属于同一源码快照");
  }
  if (
    input.facts.length !== input.cfg.nodes.length ||
    input.reachingDefinitions.length !== input.cfg.nodes.length
  ) {
    throw new TypeError("loop condition facts 与 CFG 节点数量不对齐");
  }
  input.cfg.nodes.forEach((node, index) => {
    if (
      input.facts[index]?.nodeId !== node.id ||
      input.reachingDefinitions[index]?.nodeId !== node.id
    ) {
      throw new TypeError(`loop condition facts 与 CFG 节点顺序不对齐：${node.id}`);
    }
  });
  const nodeIds = new Set(input.cfg.nodes.map((node) => node.id));
  const loopIds = new Set<string>();
  for (const loop of input.loopRegions) {
    if (loopIds.has(loop.id)) throw new TypeError(`重复 loop region id：${loop.id}`);
    loopIds.add(loop.id);
    if (!nodeIds.has(loop.entryNodeId) || !nodeIds.has(loop.conditionNodeId)) {
      throw new TypeError(`loop region 引用了未知 CFG 节点：${loop.id}`);
    }
  }
}

function isComparisonOperator(value: string): value is LoopConditionOperator {
  return COMPARISON_OPERATORS.has(value as LoopConditionOperator);
}

function unwrapParentheses(node: Node): Node {
  let current = node;
  while (current.type === "parenthesized_expression") {
    const children = current.namedChildren.filter((child) => child.type !== "comment");
    if (children.length !== 1 || children[0] === undefined) return current;
    current = children[0];
  }
  return current;
}

function checkedNodeRange(node: Node, sourceLength: number): TextRange {
  if (
    node.isMissing ||
    !Number.isSafeInteger(node.startIndex) ||
    !Number.isSafeInteger(node.endIndex) ||
    node.startIndex < 0 ||
    node.endIndex <= node.startIndex ||
    node.endIndex > sourceLength
  ) {
    throw new RangeError(
      `loop condition 节点 range 非法：[${String(node.startIndex)}, ${String(node.endIndex)})`,
    );
  }
  return textRange(node.startIndex, node.endIndex);
}

function containsNode(parent: Node, child: Node): boolean {
  return child.startIndex >= parent.startIndex && child.endIndex <= parent.endIndex;
}

function sameRange(left: TextRange, right: TextRange): boolean {
  return left.from === right.from && left.to === right.to;
}

function rangeKey(range: TextRange): string {
  return `${String(range.from)}:${String(range.to)}`;
}
