import type {
  AnalysisFinding,
  AnalysisFindingConfidence,
  AnalysisFindingEvidence,
  AnalysisFindingReason,
  AnalysisFindingRuleId,
  CfgEdge,
  CfgNode,
  DefUseVariable,
  FunctionCfg,
  FunctionDefUse,
  FunctionMemoryEvents,
  FunctionMemoryTypestate,
  MemoryAllocationEvent,
  MemoryDereferenceEvent,
  MemoryEvent,
  MemoryEventTypestateFact,
  MemoryFreeEvent,
  MemoryTypestateEdgeFact,
  MemoryTypestateValue,
} from "./model.js";

export interface FunctionMemoryFindingsInput {
  readonly cfg: FunctionCfg;
  readonly defUse: FunctionDefUse;
  readonly memoryEvents: FunctionMemoryEvents;
  readonly memoryTypestate: FunctionMemoryTypestate;
}

interface EventIndexEntry {
  readonly event: MemoryEvent;
  readonly node: CfgNode;
  readonly typestate: MemoryEventTypestateFact;
}

interface MemoryFindingContext {
  readonly input: FunctionMemoryFindingsInput;
  readonly variablesById: ReadonlyMap<string, DefUseVariable>;
  readonly eventsById: ReadonlyMap<string, EventIndexEntry>;
  readonly activeEventsByVariableId: ReadonlyMap<string, readonly MemoryEvent[]>;
  readonly escapedVariableIds: ReadonlySet<string>;
  readonly normalExitsByVariableId: ReadonlyMap<string, readonly NormalExitState[]>;
  readonly nullGuardVariableIdsByNodeId: ReadonlyMap<string, ReadonlySet<string>>;
  readonly feasibleEdgeKeys: ReadonlySet<string>;
  readonly cfgEdgesByFrom: ReadonlyMap<string, readonly CfgEdge[]>;
}

interface NormalExitState {
  readonly edge: MemoryTypestateEdgeFact;
  readonly node: CfgNode;
  readonly states: readonly MemoryTypestateValue[];
}

interface TemporalClassification {
  readonly confidence: Extract<AnalysisFindingConfidence, "certain" | "likely">;
  readonly priorFree: MemoryFreeEvent;
}

const LIVE_STATES = new Set<MemoryTypestateValue["state"]>(["alloc", "maybeNull"]);
const ASSERT_NODE_TYPES = new Set(["expression_statement", "for_initializer", "for_update"]);

/**
 * Publishes only diagnostics justified by the frozen unique-handle typestate layer. Stateful
 * rules deliberately require one non-repeatable acquisition; multi-lifetime handles remain facts
 * but stay silent until allocation epochs are modeled explicitly.
 */
export function collectFunctionMemoryFindings(
  input: FunctionMemoryFindingsInput,
): readonly AnalysisFinding[] {
  if (input.memoryEvents.status !== "complete" || input.memoryTypestate.status !== "complete") {
    return Object.freeze([]);
  }
  assertAlignedInput(input);
  const context = buildContext(input);
  const findings: AnalysisFinding[] = [];

  for (const variableId of input.memoryEvents.handleVariableIds) {
    const variable = context.variablesById.get(variableId);
    if (variable === undefined) throw new TypeError(`memory finding 缺少变量：${variableId}`);
    const activeEvents = context.activeEventsByVariableId.get(variableId) ?? [];
    const allocations = activeEvents.filter(
      (event): event is MemoryAllocationEvent => event.kind === "allocation",
    );
    if (allocations.length === 0 || context.escapedVariableIds.has(variableId)) continue;

    findings.push(...collectSizeofPointerFindings(context, variable, allocations));

    const allocation = allocations.length === 1 ? allocations[0] : undefined;
    if (allocation === undefined || allocation.repeatable) continue;
    findings.push(...collectTemporalFindings(context, variable, allocation, activeEvents));
    const leak = collectLeakFinding(context, variable, allocation);
    if (leak !== null) findings.push(leak);
  }

  return Object.freeze(findings);
}

function collectSizeofPointerFindings(
  context: MemoryFindingContext,
  variable: DefUseVariable,
  allocations: readonly MemoryAllocationEvent[],
): readonly AnalysisFinding[] {
  return allocations.flatMap((allocation) => {
    if (allocation.sizeForm !== "sizeof-handle") return [];
    const sizeArgument =
      allocation.allocator === "malloc"
        ? allocation.argumentRanges[0]
        : allocation.argumentRanges[1];
    const ownerNodeId = ownerNodeIdForEvent(context, allocation);
    if (sizeArgument === undefined || ownerNodeId === null) return [];
    return [
      freezeMemoryFinding({
        functionId: context.input.cfg.id,
        ruleId: "malloc-sizeof-pointer",
        reason: "pointer-size-used-for-pointee-allocation",
        confidence: "hint",
        primaryRange: sizeArgument,
        ownerNodeId,
        subject: variable.name,
        subjectVariableId: variable.id,
        evidence: [{ role: "allocation", range: allocation.range }],
      }),
    ];
  });
}

function collectTemporalFindings(
  context: MemoryFindingContext,
  variable: DefUseVariable,
  allocation: MemoryAllocationEvent,
  activeEvents: readonly MemoryEvent[],
): readonly AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const uafEventIds = new Set<string>();

  for (const event of activeEvents) {
    if (event.kind !== "free" && event.kind !== "dereference") continue;
    const entry = context.eventsById.get(event.id);
    if (entry === undefined) throw new TypeError(`memory finding 缺少事件状态：${event.id}`);
    const classification = classifyFreedBefore(
      entry.typestate.beforeStates,
      allocation.id,
      event,
      context,
    );
    if (classification === null) continue;
    const ownerNodeId = ownerNodeIdForEvent(context, event);
    if (ownerNodeId === null) continue;
    const certain = classification.confidence === "certain";
    const isFree = event.kind === "free";
    if (!isFree) uafEventIds.add(event.id);
    findings.push(
      freezeMemoryFinding({
        functionId: context.input.cfg.id,
        ruleId: isFree
          ? certain
            ? "double-free"
            : "possible-double-free"
          : certain
            ? "use-after-free"
            : "possible-use-after-free",
        reason: isFree
          ? certain
            ? "must-freed-before-free"
            : "may-freed-before-free"
          : certain
            ? "must-freed-before-dereference"
            : "may-freed-before-dereference",
        confidence: classification.confidence,
        primaryRange: event.range,
        ownerNodeId,
        subject: variable.name,
        subjectVariableId: variable.id,
        evidence: [
          { role: "free" as const, range: classification.priorFree.range },
          { role: isFree ? ("free" as const) : ("use" as const), range: event.range },
        ],
      }),
    );
  }

  for (const event of activeEvents) {
    if (event.kind !== "dereference" || uafEventIds.has(event.id)) continue;
    const entry = context.eventsById.get(event.id);
    if (
      entry === undefined ||
      !mayUseNullableAllocation(entry.typestate.beforeStates, allocation.id)
    ) {
      continue;
    }
    const ownerNodeId = ownerNodeIdForEvent(context, event);
    if (ownerNodeId === null) continue;
    findings.push(
      freezeMemoryFinding({
        functionId: context.input.cfg.id,
        ruleId: "unchecked-allocation",
        reason: "maybe-null-before-dereference",
        confidence: "hint",
        primaryRange: event.range,
        ownerNodeId,
        subject: variable.name,
        subjectVariableId: variable.id,
        evidence: [
          { role: "allocation", range: allocation.range },
          { role: "use", range: event.range },
        ],
      }),
    );
  }

  return findings;
}

function collectLeakFinding(
  context: MemoryFindingContext,
  variable: DefUseVariable,
  allocation: MemoryAllocationEvent,
): AnalysisFinding | null {
  const liveExits: NormalExitState[] = [];
  const freedStates: MemoryTypestateValue[] = [];
  for (const exit of context.normalExitsByVariableId.get(variable.id) ?? []) {
    const { states } = exit;
    const relevant = states.filter(
      (state) => state.state !== "unalloc" && state.eventIds.includes(allocation.id),
    );
    if (relevant.some((state) => LIVE_STATES.has(state.state))) liveExits.push(exit);
    freedStates.push(...relevant.filter((state) => state.state === "freed"));
  }
  if (liveExits.length === 0) return null;

  const allocationNode = context.eventsById.get(allocation.id)?.node;
  const hasTrustedLiveExit =
    allocationNode !== undefined &&
    liveExits.some(
      (exit) =>
        hasTrustedPath(context, variable.id, allocationNode.id, exit.node.id) &&
        isTrustedEdge(context, variable.id, exit.edge, true),
    );
  const confidence: Extract<AnalysisFindingConfidence, "certain" | "likely"> =
    freedStates.length === 0 && hasTrustedLiveExit ? "certain" : "likely";
  const freeEvidence = latestFreeWitness(freedStates, context.eventsById, null);
  const ownerNodeId = ownerNodeIdForEvent(context, allocation);
  if (ownerNodeId === null) return null;
  return freezeMemoryFinding({
    functionId: context.input.cfg.id,
    ruleId: confidence === "certain" ? "memory-leak" : "possible-memory-leak",
    reason: confidence === "certain" ? "live-at-all-normal-exits" : "live-at-some-normal-exit",
    confidence,
    primaryRange: allocation.range,
    ownerNodeId,
    subject: variable.name,
    subjectVariableId: variable.id,
    evidence: [
      { role: "allocation", range: allocation.range },
      ...(freeEvidence === null ? [] : [{ role: "free" as const, range: freeEvidence.range }]),
      { role: "exit", range: liveExits[0]!.node.range },
    ],
  });
}

function classifyFreedBefore(
  states: readonly MemoryTypestateValue[],
  allocationEventId: string,
  currentEvent: MemoryFreeEvent | MemoryDereferenceEvent,
  context: MemoryFindingContext,
): TemporalClassification | null {
  const relevant = states.filter(
    (state) => state.state !== "unalloc" && state.eventIds.includes(allocationEventId),
  );
  const freedStates = relevant.filter((state) => state.state === "freed");
  if (freedStates.length === 0) return null;
  const live = relevant.some((state) => LIVE_STATES.has(state.state));
  const priorFree = latestFreeWitness(freedStates, context.eventsById, currentEvent);
  if (priorFree === null) return null;
  const currentNode = context.eventsById.get(currentEvent.id)?.node;
  const priorNode = context.eventsById.get(priorFree.id)?.node;
  const hasTrustedPrior =
    currentNode !== undefined &&
    priorNode !== undefined &&
    hasTrustedPath(context, currentEvent.variableId, priorNode.id, currentNode.id, false);
  return Object.freeze({
    confidence: !live && hasTrustedPrior ? "certain" : "likely",
    priorFree,
  });
}

function latestFreeWitness(
  states: readonly MemoryTypestateValue[],
  eventsById: ReadonlyMap<string, EventIndexEntry>,
  before: MemoryFreeEvent | MemoryDereferenceEvent | null,
): MemoryFreeEvent | null {
  let latest: MemoryFreeEvent | null = null;
  for (const state of states) {
    for (let index = state.eventIds.length - 1; index >= 0; index -= 1) {
      const eventId = state.eventIds[index];
      if (eventId === undefined || eventId === before?.id) continue;
      const event = eventsById.get(eventId)?.event;
      if (event?.kind !== "free" || (before !== null && event.range.from >= before.range.from)) {
        continue;
      }
      if (latest === null || compareEvents(event, latest) > 0) latest = event;
      break;
    }
  }
  return latest;
}

function mayUseNullableAllocation(
  states: readonly MemoryTypestateValue[],
  allocationEventId: string,
): boolean {
  return states.some(
    (state) =>
      (state.state === "maybeNull" || state.state === "unalloc") &&
      state.eventIds.includes(allocationEventId),
  );
}

function buildContext(input: FunctionMemoryFindingsInput): MemoryFindingContext {
  const nodesById = new Map(input.cfg.nodes.map((node) => [node.id, node]));
  const typestateEventsById = new Map(
    input.memoryTypestate.facts.flatMap((fact) =>
      fact.events.map((event) => [event.eventId, event] as const),
    ),
  );
  const eventsById = new Map<string, EventIndexEntry>();
  const activeEventsByVariableId = new Map<string, MemoryEvent[]>();
  const nullGuardVariableIdsByNodeId = new Map<string, Set<string>>();
  for (const fact of input.memoryEvents.facts) {
    const node = nodesById.get(fact.nodeId);
    if (node === undefined) throw new TypeError(`memory finding 缺少 CFG 节点：${fact.nodeId}`);
    for (const event of fact.events) {
      const typestate = typestateEventsById.get(event.id);
      if (typestate === undefined)
        throw new TypeError(`memory finding 缺少 typestate：${event.id}`);
      if (eventsById.has(event.id)) throw new TypeError(`memory finding 事件重复：${event.id}`);
      eventsById.set(event.id, Object.freeze({ event, node, typestate }));
      if (typestate.beforeStates.length > 0) {
        const active = activeEventsByVariableId.get(event.variableId) ?? [];
        active.push(event);
        activeEventsByVariableId.set(event.variableId, active);
        if (event.kind === "null-guard") {
          const guarded = nullGuardVariableIdsByNodeId.get(node.id) ?? new Set<string>();
          guarded.add(event.variableId);
          nullGuardVariableIdsByNodeId.set(node.id, guarded);
        }
      }
    }
  }
  for (const events of activeEventsByVariableId.values()) events.sort(compareEvents);
  const escapedVariableIds = new Set<string>();
  for (const fact of input.memoryTypestate.facts) {
    for (const handle of fact.handles) {
      if ([...handle.inStates, ...handle.outStates].some((state) => state.state === "escaped")) {
        escapedVariableIds.add(handle.variableId);
      }
    }
  }
  const normalExitEdges = input.memoryTypestate.edgeFacts.filter(
    (edge) =>
      edge.feasible &&
      edge.to === input.cfg.exitId &&
      edge.kind !== "terminate" &&
      !isAssertFailureEdge(input.cfg, edge),
  );
  const normalExitsByVariableId = new Map<string, NormalExitState[]>();
  for (const edge of normalExitEdges) {
    const node = nodesById.get(edge.from);
    if (node === undefined) throw new TypeError(`memory finding 缺少 exit 前驱：${edge.from}`);
    for (const handle of edge.handles) {
      const exits = normalExitsByVariableId.get(handle.variableId) ?? [];
      exits.push(Object.freeze({ edge, node, states: handle.states }));
      normalExitsByVariableId.set(handle.variableId, exits);
    }
  }
  const cfgEdgesByFrom = new Map<string, CfgEdge[]>();
  for (const edge of input.cfg.edges) {
    const outgoing = cfgEdgesByFrom.get(edge.from) ?? [];
    outgoing.push(edge);
    cfgEdgesByFrom.set(edge.from, outgoing);
  }
  return Object.freeze({
    input,
    variablesById: new Map(input.defUse.variables.map((variable) => [variable.id, variable])),
    eventsById,
    activeEventsByVariableId,
    escapedVariableIds,
    normalExitsByVariableId,
    nullGuardVariableIdsByNodeId,
    feasibleEdgeKeys: new Set(
      input.memoryTypestate.edgeFacts
        .filter((edge) => edge.feasible)
        .map((edge) => cfgEdgeKey(edge.from, edge.kind, edge.to)),
    ),
    cfgEdgesByFrom,
  });
}

function hasTrustedPath(
  context: MemoryFindingContext,
  variableId: string,
  from: string,
  to: string,
  trustNullGuardBranches = true,
): boolean {
  if (from === to) return true;
  const visited = new Set([from]);
  const queue = [from];
  let cursor = 0;
  while (cursor < queue.length) {
    const nodeId = queue[cursor++];
    if (nodeId === undefined) break;
    for (const edge of context.cfgEdgesByFrom.get(nodeId) ?? []) {
      if (!isTrustedEdge(context, variableId, edge, trustNullGuardBranches)) continue;
      if (edge.to === to) return true;
      if (visited.has(edge.to)) continue;
      visited.add(edge.to);
      queue.push(edge.to);
    }
  }
  return false;
}

function isTrustedEdge(
  context: MemoryFindingContext,
  variableId: string,
  edge: CfgEdge,
  trustNullGuardBranches: boolean,
): boolean {
  if (!context.feasibleEdgeKeys.has(cfgEdgeKey(edge.from, edge.kind, edge.to))) return false;
  if (edge.kind === "next" || edge.kind === "return") return true;
  return (
    trustNullGuardBranches &&
    (edge.kind === "branch-true" || edge.kind === "branch-false") &&
    (context.nullGuardVariableIdsByNodeId.get(edge.from)?.has(variableId) ?? false)
  );
}

function cfgEdgeKey(from: string, kind: CfgEdge["kind"], to: string): string {
  return `${from}\u0000${kind}\u0000${to}`;
}

function isAssertFailureEdge(cfg: FunctionCfg, edge: MemoryTypestateEdgeFact): boolean {
  if (edge.kind !== "branch-false") return false;
  const node = cfg.nodes.find((candidate) => candidate.id === edge.from);
  return (
    node !== undefined &&
    node.nodeType !== null &&
    ASSERT_NODE_TYPES.has(node.nodeType) &&
    cfg.edges.some((candidate) => candidate.from === edge.from && candidate.kind === "branch-true")
  );
}

function ownerNodeIdForEvent(context: MemoryFindingContext, event: MemoryEvent): string | null {
  const node = context.eventsById.get(event.id)?.node;
  if (node === undefined) return null;
  if (node.ownership === "primary") return node.id;
  if (node.ownership !== "auxiliary") return null;
  return (
    context.input.cfg.nodes.find(
      (candidate) =>
        candidate.ownership === "primary" && sameRange(candidate.range, node.ownerBlockRange),
    )?.id ?? null
  );
}

function freezeMemoryFinding(input: {
  readonly functionId: string;
  readonly ruleId: Extract<
    AnalysisFindingRuleId,
    | "memory-leak"
    | "possible-memory-leak"
    | "double-free"
    | "possible-double-free"
    | "use-after-free"
    | "possible-use-after-free"
    | "malloc-sizeof-pointer"
    | "unchecked-allocation"
  >;
  readonly reason: Extract<
    AnalysisFindingReason,
    | "live-at-all-normal-exits"
    | "live-at-some-normal-exit"
    | "must-freed-before-free"
    | "may-freed-before-free"
    | "must-freed-before-dereference"
    | "may-freed-before-dereference"
    | "pointer-size-used-for-pointee-allocation"
    | "maybe-null-before-dereference"
  >;
  readonly confidence: AnalysisFindingConfidence;
  readonly primaryRange: AnalysisFinding["primaryRange"];
  readonly ownerNodeId: string;
  readonly subject: string;
  readonly subjectVariableId: string;
  readonly evidence: readonly AnalysisFindingEvidence[];
}): AnalysisFinding {
  const evidence = deduplicateEvidence(input.evidence).sort(compareEvidence);
  return Object.freeze({
    id: `finding:${input.ruleId}:${input.reason}:${String(input.primaryRange.from)}:${String(input.primaryRange.to)}:${input.subjectVariableId}`,
    functionId: input.functionId,
    ruleId: input.ruleId,
    reason: input.reason,
    confidence: input.confidence,
    primaryRange: Object.freeze({ ...input.primaryRange }),
    ownerNodeId: input.ownerNodeId,
    subject: input.subject,
    subjectVariableId: input.subjectVariableId,
    evidence: Object.freeze(
      evidence.map((item) =>
        Object.freeze({ role: item.role, range: Object.freeze({ ...item.range }) }),
      ),
    ),
  });
}

function deduplicateEvidence(
  evidence: readonly AnalysisFindingEvidence[],
): AnalysisFindingEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.role}:${String(item.range.from)}:${String(item.range.to)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function compareEvidence(left: AnalysisFindingEvidence, right: AnalysisFindingEvidence): number {
  return (
    left.range.from - right.range.from ||
    left.range.to - right.range.to ||
    left.role.localeCompare(right.role)
  );
}

function compareEvents(left: MemoryEvent, right: MemoryEvent): number {
  return (
    left.range.from - right.range.from ||
    left.range.to - right.range.to ||
    left.kind.localeCompare(right.kind) ||
    left.id.localeCompare(right.id)
  );
}

function sameRange(left: CfgNode["range"], right: CfgNode["range"]): boolean {
  return left.from === right.from && left.to === right.to;
}

function assertAlignedInput(input: FunctionMemoryFindingsInput): void {
  if (
    input.memoryEvents.functionId !== input.cfg.id ||
    input.memoryTypestate.functionId !== input.cfg.id ||
    input.memoryEvents.functionRange.from !== input.cfg.range.from ||
    input.memoryEvents.functionRange.to !== input.cfg.range.to ||
    input.memoryTypestate.functionRange.from !== input.cfg.range.from ||
    input.memoryTypestate.functionRange.to !== input.cfg.range.to
  ) {
    throw new TypeError("memory findings function 输入未对齐");
  }
  if (
    input.memoryEvents.facts.length !== input.cfg.nodes.length ||
    input.memoryTypestate.facts.length !== input.cfg.nodes.length
  ) {
    throw new TypeError("memory findings facts 与 CFG 未对齐");
  }
  if (
    input.memoryEvents.handleVariableIds.length !==
      input.memoryTypestate.handleVariableIds.length ||
    input.memoryEvents.handleVariableIds.some(
      (variableId, index) => input.memoryTypestate.handleVariableIds[index] !== variableId,
    )
  ) {
    throw new TypeError("memory findings handle 顺序未对齐");
  }
}
