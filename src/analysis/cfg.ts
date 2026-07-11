import type { Node } from "web-tree-sitter";
import { textRange, type TextRange } from "../core/model.js";
import type {
  CfgEdge,
  CfgEdgeKind,
  CfgNode,
  CfgNodeRole,
  CfgPartialReason,
  CfgPartialReasonCode,
  FunctionCfg,
  ProgramAnalysisInput,
  ProgramAnalysisSnapshot,
} from "./model.js";

interface DraftNode extends Omit<CfgNode, "reachable"> {
  reachable: boolean;
}

interface FunctionBuildContext {
  readonly sourceLength: number;
  readonly functionRange: TextRange;
  readonly entryId: string;
  readonly exitId: string;
  readonly nodes: Map<string, DraftNode>;
  readonly edges: Map<string, CfgEdge>;
  readonly partialReasons: Map<string, CfgPartialReason>;
}

interface ControlTargets {
  readonly breakTargetId: string | null;
  readonly continueTargetId: string | null;
}

const NO_CONTROL_TARGETS: ControlTargets = Object.freeze({
  breakTargetId: null,
  continueTargetId: null,
});

const CONTROL_FLOW_NODES = new Set([
  "break_statement",
  "continue_statement",
  "do_statement",
  "for_statement",
  "goto_statement",
  "if_statement",
  "labeled_statement",
  "switch_statement",
  "while_statement",
]);

const EDGE_ORDER: Readonly<Record<CfgEdgeKind, number>> = Object.freeze({
  entry: 0,
  next: 1,
  "branch-true": 2,
  "branch-false": 3,
  break: 4,
  continue: 5,
  return: 6,
  terminate: 7,
});

export function analyzeProgramCst(input: ProgramAnalysisInput): ProgramAnalysisSnapshot {
  assertInput(input);
  const functions = collectFunctions(input.rootNode)
    .map((node) => buildFunctionCfg(node, input.source.length))
    .sort((left, right) => left.range.from - right.range.from || left.range.to - right.range.to);

  return Object.freeze({
    revision: input.revision,
    sourceLength: input.source.length,
    functions: Object.freeze(functions),
  });
}

function buildFunctionCfg(functionNode: Node, sourceLength: number): FunctionCfg {
  const range = nodeRange(functionNode, sourceLength);
  const id = `function:${range.from}:${range.to}`;
  const entryId = `${id}:entry`;
  const exitId = `${id}:exit`;
  const context: FunctionBuildContext = {
    sourceLength,
    functionRange: range,
    entryId,
    exitId,
    nodes: new Map([
      [entryId, boundaryNode(entryId, "entry", functionNode, range)],
      [exitId, boundaryNode(exitId, "exit", functionNode, range)],
    ]),
    edges: new Map(),
    partialReasons: new Map(),
  };

  if (functionNode.hasError) addPartial(context, "parse-error", functionNode);
  const body = functionNode.childForFieldName("body");
  if (body === null || body.type !== "compound_statement") {
    addPartial(context, "missing-function-body", functionNode);
    addEdge(context, entryId, exitId, "entry");
  } else {
    const first = buildSequence(body.namedChildren, exitId, context, NO_CONTROL_TARGETS);
    addEdge(context, entryId, first, "entry");
  }

  markReachable(context);
  return freezeFunctionCfg(id, declaredFunctionName(functionNode, range), range, context);
}

function buildSequence(
  children: readonly Node[],
  continuationId: string,
  context: FunctionBuildContext,
  targets: ControlTargets,
): string {
  let first = continuationId;
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child === undefined || child.type === "comment") continue;
    first = buildNode(child, first, context, targets);
  }
  return first;
}

function buildNode(
  node: Node,
  continuationId: string,
  context: FunctionBuildContext,
  targets: ControlTargets,
): string {
  if (node.type === "compound_statement") {
    return buildSequence(node.namedChildren, continuationId, context, targets);
  }

  const role: CfgNodeRole =
    node.type === "declaration" || node.type === "type_definition" ? "declaration" : "statement";
  const id = addSyntaxNode(context, node, role);
  if (node.isError || node.type === "ERROR" || node.hasError) {
    addPartial(context, "parse-error", node);
    addEdge(context, id, continuationId, "next");
    return id;
  }
  if (node.type === "return_statement") {
    addEdge(context, id, context.exitId, "return");
    return id;
  }
  if (node.type === "if_statement") {
    return buildIf(node, id, continuationId, context, targets);
  }
  if (node.type === "while_statement") {
    return buildWhile(node, id, continuationId, context);
  }
  if (node.type === "do_statement") {
    return buildDoWhile(node, id, continuationId, context);
  }
  if (node.type === "for_statement") {
    return buildFor(node, id, continuationId, context);
  }
  if (node.type === "break_statement") {
    return buildControlTransfer(node, id, continuationId, targets.breakTargetId, "break", context);
  }
  if (node.type === "continue_statement") {
    return buildControlTransfer(
      node,
      id,
      continuationId,
      targets.continueTargetId,
      "continue",
      context,
    );
  }
  if (node.type === "expression_statement") {
    const directCall = directCallName(node);
    if (directCall === "exit" || directCall === "abort") {
      addEdge(context, id, context.exitId, "terminate");
      return id;
    }
    if (directCall === "assert") {
      addEdge(context, id, continuationId, "branch-true");
      addEdge(context, id, context.exitId, "branch-false");
      return id;
    }
  }
  if (
    node.type === "declaration" ||
    node.type === "type_definition" ||
    node.type === "expression_statement"
  ) {
    addEdge(context, id, continuationId, "next");
    return id;
  }

  addPartial(
    context,
    CONTROL_FLOW_NODES.has(node.type) ? "unsupported-control-flow" : "unsupported-syntax",
    node,
  );
  addEdge(context, id, continuationId, "next");
  return id;
}

function buildIf(
  node: Node,
  id: string,
  continuationId: string,
  context: FunctionBuildContext,
  targets: ControlTargets,
): string {
  const consequence = node.childForFieldName("consequence");
  if (consequence === null) {
    addPartial(context, "unsupported-syntax", node);
    return id;
  }

  const consequenceId = buildNode(consequence, continuationId, context, targets);
  const alternativeClause = node.childForFieldName("alternative");
  let alternativeId = continuationId;
  if (alternativeClause !== null) {
    const alternatives = alternativeClause.namedChildren.filter(
      (candidate) => candidate.type !== "comment",
    );
    const alternative = alternatives.length === 1 ? alternatives[0] : undefined;
    if (alternativeClause.type !== "else_clause" || alternative === undefined) {
      addPartial(context, "unsupported-syntax", alternativeClause);
      return id;
    }
    alternativeId = buildNode(alternative, continuationId, context, targets);
  }

  addEdge(context, id, consequenceId, "branch-true");
  addEdge(context, id, alternativeId, "branch-false");
  return id;
}

function buildWhile(
  node: Node,
  id: string,
  continuationId: string,
  context: FunctionBuildContext,
): string {
  const body = node.childForFieldName("body");
  if (body === null) {
    addPartial(context, "unsupported-syntax", node);
    addEdge(context, id, continuationId, "next");
    return id;
  }
  const bodyId = buildNode(body, id, context, {
    breakTargetId: continuationId,
    continueTargetId: id,
  });
  addEdge(context, id, bodyId, "branch-true");
  addEdge(context, id, continuationId, "branch-false");
  return id;
}

function buildDoWhile(
  node: Node,
  id: string,
  continuationId: string,
  context: FunctionBuildContext,
): string {
  const body = node.childForFieldName("body");
  const condition = node.childForFieldName("condition");
  if (body === null || condition === null) {
    addPartial(context, "unsupported-syntax", node);
    addEdge(context, id, continuationId, "next");
    return id;
  }
  context.nodes.delete(id);
  const conditionId = addControlNode(context, node, condition, "do_condition");
  const bodyId = buildNode(body, conditionId, context, {
    breakTargetId: continuationId,
    continueTargetId: conditionId,
  });
  addEdge(context, conditionId, bodyId, "branch-true");
  addEdge(context, conditionId, continuationId, "branch-false");
  return bodyId;
}

function buildFor(
  node: Node,
  id: string,
  continuationId: string,
  context: FunctionBuildContext,
): string {
  const body = node.childForFieldName("body");
  if (body === null) {
    addPartial(context, "unsupported-syntax", node);
    addEdge(context, id, continuationId, "next");
    return id;
  }

  const update = node.childForFieldName("update");
  const updateId = update === null ? id : addControlNode(context, node, update, "for_update");
  if (update !== null) addPhaseEdges(context, update, updateId, id);

  const bodyId = buildNode(body, updateId, context, {
    breakTargetId: continuationId,
    continueTargetId: updateId,
  });
  addEdge(context, id, bodyId, "branch-true");
  if (node.childForFieldName("condition") !== null) {
    addEdge(context, id, continuationId, "branch-false");
  }

  const initializer = node.childForFieldName("initializer");
  if (initializer === null) return id;
  const initializerId = addControlNode(context, node, initializer, "for_initializer");
  addPhaseEdges(context, initializer, initializerId, id);
  return initializerId;
}

function addPhaseEdges(
  context: FunctionBuildContext,
  node: Node,
  id: string,
  continuationId: string,
): void {
  const directCall = directCallName(node);
  if (directCall === "exit" || directCall === "abort") {
    addEdge(context, id, context.exitId, "terminate");
    return;
  }
  if (directCall === "assert") {
    addEdge(context, id, continuationId, "branch-true");
    addEdge(context, id, context.exitId, "branch-false");
    return;
  }
  addEdge(context, id, continuationId, "next");
}

function buildControlTransfer(
  node: Node,
  id: string,
  continuationId: string,
  targetId: string | null,
  kind: "break" | "continue",
  context: FunctionBuildContext,
): string {
  if (targetId === null) {
    addPartial(context, "unsupported-control-flow", node);
    addEdge(context, id, continuationId, "next");
  } else {
    addEdge(context, id, targetId, kind);
  }
  return id;
}

function addSyntaxNode(context: FunctionBuildContext, node: Node, role: CfgNodeRole): string {
  const range = nodeRange(node, context.sourceLength);
  const id = `syntax:${range.from}:${range.to}:${node.type}`;
  context.nodes.set(id, {
    id,
    kind: "syntax",
    role,
    nodeType: node.type,
    range,
    ownerBlockRange: range,
    reachable: false,
  });
  return id;
}

function addControlNode(
  context: FunctionBuildContext,
  owner: Node,
  node: Node,
  nodeType: "do_condition" | "for_initializer" | "for_update",
): string {
  const range = nodeRange(node, context.sourceLength);
  const ownerBlockRange = nodeRange(owner, context.sourceLength);
  const id = `control:${range.from}:${range.to}:${nodeType}`;
  context.nodes.set(id, {
    id,
    kind: "control",
    role: "control",
    nodeType,
    range,
    ownerBlockRange,
    reachable: false,
  });
  return id;
}

function addEdge(context: FunctionBuildContext, from: string, to: string, kind: CfgEdgeKind): void {
  const edge = Object.freeze({ from, to, kind });
  context.edges.set(`${from}\u0000${kind}\u0000${to}`, edge);
}

function addPartial(context: FunctionBuildContext, code: CfgPartialReasonCode, node: Node): void {
  const range = nodeRange(node, context.sourceLength);
  const reason = Object.freeze({ code, nodeType: node.type, range });
  context.partialReasons.set(`${code}:${node.type}:${range.from}:${range.to}`, reason);
}

function markReachable(context: FunctionBuildContext): void {
  const outgoing = new Map<string, string[]>();
  for (const edge of context.edges.values()) {
    const targets = outgoing.get(edge.from) ?? [];
    targets.push(edge.to);
    outgoing.set(edge.from, targets);
  }
  const pending = [context.entryId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    const node = context.nodes.get(id);
    if (node !== undefined) node.reachable = true;
    pending.push(...(outgoing.get(id) ?? []));
  }
}

function freezeFunctionCfg(
  id: string,
  name: string,
  range: TextRange,
  context: FunctionBuildContext,
): FunctionCfg {
  const nodes = [...context.nodes.values()].sort(compareNodes);
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const frozenNodes = Object.freeze(nodes.map((node) => Object.freeze({ ...node })));
  const edges = Object.freeze(
    [...context.edges.values()].sort(
      (left, right) =>
        (nodeOrder.get(left.from) ?? -1) - (nodeOrder.get(right.from) ?? -1) ||
        EDGE_ORDER[left.kind] - EDGE_ORDER[right.kind] ||
        (nodeOrder.get(left.to) ?? -1) - (nodeOrder.get(right.to) ?? -1),
    ),
  );
  const partialReasons = Object.freeze(
    [...context.partialReasons.values()].sort(
      (left, right) =>
        left.range.from - right.range.from ||
        left.range.to - right.range.to ||
        left.code.localeCompare(right.code),
    ),
  );
  return Object.freeze({
    id,
    name,
    range,
    entryId: context.entryId,
    exitId: context.exitId,
    nodes: frozenNodes,
    edges,
    partial: partialReasons.length > 0,
    partialReasons,
  });
}

function boundaryNode(
  id: string,
  kind: "entry" | "exit",
  functionNode: Node,
  range: TextRange,
): DraftNode {
  return {
    id,
    kind,
    role: "boundary",
    nodeType: "function_definition",
    range,
    ownerBlockRange: range,
    reachable: false,
  };
}

function compareNodes(left: DraftNode, right: DraftNode): number {
  const kindOrder = { entry: 0, syntax: 1, control: 1, exit: 2 } as const;
  return (
    kindOrder[left.kind] - kindOrder[right.kind] ||
    left.range.from - right.range.from ||
    right.range.to - left.range.to ||
    left.id.localeCompare(right.id)
  );
}

function collectFunctions(rootNode: Node): readonly Node[] {
  return rootNode
    .descendantsOfType("function_definition")
    .sort((left, right) => left.startIndex - right.startIndex || left.endIndex - right.endIndex);
}

function declaredFunctionName(functionNode: Node, range: TextRange): string {
  let declarator = functionNode.childForFieldName("declarator");
  while (declarator !== null) {
    if (declarator.type === "identifier") return declarator.text;
    declarator = declarator.childForFieldName("declarator");
  }
  return `<function@${range.from}>`;
}

function directCallName(node: Node): string | null {
  const children = node.namedChildren.filter((candidate) => candidate.type !== "comment");
  const expression =
    node.type === "call_expression" ? node : children.length === 1 ? children[0] : undefined;
  if (expression?.type !== "call_expression") return null;
  const callee = expression.childForFieldName("function");
  return callee?.type === "identifier" ? callee.text : null;
}

function nodeRange(node: Node, sourceLength: number): TextRange {
  if (
    !Number.isSafeInteger(node.startIndex) ||
    !Number.isSafeInteger(node.endIndex) ||
    node.startIndex < 0 ||
    node.endIndex <= node.startIndex ||
    node.endIndex > sourceLength
  ) {
    throw new RangeError(`分析节点 range 非法：[${node.startIndex}, ${node.endIndex})`);
  }
  return textRange(node.startIndex, node.endIndex);
}

function assertInput(input: ProgramAnalysisInput): void {
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new RangeError(`分析 revision 必须是非负安全整数，实际 ${String(input.revision)}`);
  }
  if (input.rootNode.type !== "translation_unit") {
    throw new TypeError(`分析根节点必须是 translation_unit，实际 ${input.rootNode.type}`);
  }
}
