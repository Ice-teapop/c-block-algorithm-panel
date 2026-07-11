import type {
  DefUseDefinitionEffect,
  DefUseEffect,
  DefUseFact,
  DefUseVariable,
  FunctionCfg,
  LoopInductionResult,
  LoopPredicateFact,
  LoopPredicateReason,
  LoopPredicateResult,
  LoopRegion,
  LoopVariablePredicateFact,
  ReachingDefinitionFact,
} from "./model.js";

interface DefinitionSite {
  readonly definition: DefUseDefinitionEffect;
  readonly nodeId: string;
}

export interface LoopPredicateInput {
  readonly cfg: FunctionCfg;
  readonly variables: readonly DefUseVariable[];
  readonly facts: readonly DefUseFact[];
  readonly reachingDefinitions: readonly ReachingDefinitionFact[];
  readonly loopRegions: readonly LoopRegion[];
}

export function collectLoopPredicates(input: LoopPredicateInput): readonly LoopPredicateFact[] {
  const nodesById = new Map(input.cfg.nodes.map((node) => [node.id, node]));
  const factsByNodeId = new Map(input.facts.map((fact) => [fact.nodeId, fact]));
  const flowByNodeId = new Map(input.reachingDefinitions.map((fact) => [fact.nodeId, fact]));
  const definitionSites = new Map<string, DefinitionSite>();
  for (const fact of input.facts) {
    for (const effect of fact.effects) {
      if (effect.kind === "def") {
        definitionSites.set(effect.id, { definition: effect, nodeId: fact.nodeId });
      }
    }
  }

  return Object.freeze(
    input.loopRegions.map((loop) => {
      const memberIds = new Set(loop.nodeIds);
      const effects = loop.nodeIds.flatMap((nodeId) => {
        const node = nodesById.get(nodeId);
        return node?.reachable ? (factsByNodeId.get(nodeId)?.effects ?? []) : [];
      });
      const entryFlow = flowByNodeId.get(loop.entryNodeId);
      if (entryFlow === undefined) throw new TypeError(`loop entry 缺少 reaching fact：${loop.id}`);
      const relevantVariableIds = collectRelevantVariableIds(input.variables, effects, loop);
      const variables = relevantVariableIds.map((variableId): LoopVariablePredicateFact => {
        const variable = input.variables.find((candidate) => candidate.id === variableId);
        if (variable === undefined)
          throw new TypeError(`loop predicate 引用了未知变量：${variableId}`);
        const definitions = effects.filter(
          (effect): effect is DefUseDefinitionEffect =>
            effect.kind === "def" && effect.variableId === variableId,
        );
        const escapes = effects.filter(
          (effect) => effect.kind === "escape" && effect.variableId === variableId,
        );
        const definitionNodeIds = definitions.map((definition) => {
          const site = definitionSites.get(definition.id);
          if (site === undefined) throw new TypeError(`definition 缺少 site：${definition.id}`);
          return site.nodeId;
        });
        const escapeNodeIds = escapes.map((escape) => {
          const fact = input.facts.find((candidate) =>
            candidate.effects.some((effect) => effect.id === escape.id),
          );
          if (fact === undefined) throw new TypeError(`escape 缺少 site：${escape.id}`);
          return fact.nodeId;
        });
        const unavailable = unavailableReason(variable.id, entryFlow, escapes);
        const invariant = evaluateInvariant(
          unavailable,
          definitions,
          orderedNodeIds(input.cfg, [...definitionNodeIds, ...escapeNodeIds]),
        );
        const singleDefinition = evaluateSingleDefinition(
          unavailable,
          definitions,
          orderedNodeIds(input.cfg, definitionNodeIds),
        );
        const induction = evaluateInduction({
          input,
          loop,
          variable,
          definitions,
          unavailable,
          memberIds,
          entryFlow,
          definitionSites,
          factsByNodeId,
          flowByNodeId,
        });
        return Object.freeze({
          variableId,
          isLoopInvariant: invariant,
          singleDefIn: singleDefinition,
          isInductionVar: induction,
        });
      });
      return Object.freeze({ loopId: loop.id, variables: Object.freeze(variables) });
    }),
  );
}

function collectRelevantVariableIds(
  variables: readonly DefUseVariable[],
  effects: readonly DefUseEffect[],
  loop: LoopRegion,
): readonly string[] {
  if (loop.availability !== "analyzable") return [];
  const relevant = new Set(effects.map((effect) => effect.variableId));
  return variables
    .filter(
      (variable) =>
        relevant.has(variable.id) &&
        variable.storage === "scalar" &&
        variable.tracking === "precise",
    )
    .map((variable) => variable.id);
}

function unavailableReason(
  variableId: string,
  entryFlow: ReachingDefinitionFact,
  escapes: readonly DefUseEffect[],
): LoopPredicateReason | null {
  if (entryFlow.inEscapedVariableIds.includes(variableId) || escapes.length > 0) {
    return "escaped";
  }
  return null;
}

function evaluateInvariant(
  unavailable: LoopPredicateReason | null,
  definitions: readonly DefUseDefinitionEffect[],
  nodeIds: readonly string[],
): LoopPredicateResult {
  if (unavailable !== null) return freezeResult("unknown", unavailable, definitions, nodeIds);
  return definitions.length === 0
    ? freezeResult("yes", "no-definitions", definitions, nodeIds)
    : freezeResult("no", "has-definitions", definitions, nodeIds);
}

function evaluateSingleDefinition(
  unavailable: LoopPredicateReason | null,
  definitions: readonly DefUseDefinitionEffect[],
  nodeIds: readonly string[],
): LoopPredicateResult {
  if (unavailable !== null) return freezeResult("unknown", unavailable, definitions, nodeIds);
  if (definitions.length === 0) return freezeResult("no", "no-definitions", definitions, nodeIds);
  return definitions.length === 1
    ? freezeResult("yes", "single-definition", definitions, nodeIds)
    : freezeResult("no", "multiple-definitions", definitions, nodeIds);
}

function evaluateInduction(args: {
  readonly input: LoopPredicateInput;
  readonly loop: LoopRegion;
  readonly variable: DefUseVariable;
  readonly definitions: readonly DefUseDefinitionEffect[];
  readonly unavailable: LoopPredicateReason | null;
  readonly memberIds: ReadonlySet<string>;
  readonly entryFlow: ReachingDefinitionFact;
  readonly definitionSites: ReadonlyMap<string, DefinitionSite>;
  readonly factsByNodeId: ReadonlyMap<string, DefUseFact>;
  readonly flowByNodeId: ReadonlyMap<string, ReachingDefinitionFact>;
}): LoopInductionResult {
  const baseNodeIds = args.definitions
    .map((definition) => args.definitionSites.get(definition.id)?.nodeId)
    .filter((nodeId): nodeId is string => nodeId !== undefined);
  if (args.unavailable !== null) {
    return freezeInduction("unknown", args.unavailable, args.definitions, baseNodeIds, null, null);
  }
  if (args.definitions.length === 0) {
    return freezeInduction("no", "no-definitions", args.definitions, baseNodeIds, null, null);
  }
  if (args.definitions.length !== 1) {
    return freezeInduction("no", "multiple-definitions", args.definitions, baseNodeIds, null, null);
  }
  const definition = args.definitions[0]!;
  const site = args.definitionSites.get(definition.id);
  if (site === undefined) throw new TypeError(`definition 缺少 site：${definition.id}`);
  if (definition.strength !== "strong") {
    return freezeInduction("no", "weak-step", args.definitions, [site.nodeId], null, null);
  }
  if (definition.valueState !== "written" || definition.step === undefined) {
    return freezeInduction("no", "not-constant-step", args.definitions, [site.nodeId], null, null);
  }
  if (stepIsNested(args.loop, site.nodeId, args.input.loopRegions)) {
    return freezeInduction(
      "no",
      "nested-step",
      args.definitions,
      [site.nodeId],
      definition.id,
      signedDelta(definition),
    );
  }
  if (!stepSelfUseIsTracked(site.nodeId, definition, args.factsByNodeId, args.flowByNodeId)) {
    return freezeInduction(
      "unknown",
      "escaped",
      args.definitions,
      [site.nodeId],
      definition.id,
      signedDelta(definition),
    );
  }
  const externalDefinitions = args.entryFlow.inDefinitionEffectIds
    .map((definitionId) => args.definitionSites.get(definitionId))
    .filter(
      (candidate): candidate is DefinitionSite =>
        candidate !== undefined &&
        candidate.definition.variableId === args.variable.id &&
        !args.memberIds.has(candidate.nodeId),
    );
  if (externalDefinitions.length === 0) {
    return freezeInduction(
      "no",
      "no-external-definition",
      args.definitions,
      [site.nodeId],
      definition.id,
      signedDelta(definition),
    );
  }
  if (
    externalDefinitions.some(({ definition: external }) => external.valueState === "uninitialized")
  ) {
    return freezeInduction(
      "no",
      "uninitialized-entry",
      args.definitions,
      [site.nodeId],
      definition.id,
      signedDelta(definition),
    );
  }
  const latchSources = [
    ...new Set(
      args.input.cfg.edges
        .filter(
          (edge) =>
            edge.to === args.loop.conditionNodeId &&
            args.memberIds.has(edge.from) &&
            args.input.cfg.nodes.some((node) => node.id === edge.from && node.reachable),
        )
        .map((edge) => edge.from),
    ),
  ];
  if (latchSources.length === 0) {
    return freezeInduction(
      "no",
      "no-backedge",
      args.definitions,
      [site.nodeId],
      definition.id,
      signedDelta(definition),
    );
  }
  if (
    site.nodeId !== args.loop.conditionNodeId &&
    latchSources.some((latch) =>
      pathExistsWithoutStep(
        args.input.cfg,
        args.loop.entryNodeId,
        latch,
        site.nodeId,
        args.memberIds,
      ),
    )
  ) {
    return freezeInduction(
      "no",
      "step-not-on-every-backedge",
      args.definitions,
      orderedNodeIds(args.input.cfg, [site.nodeId, ...latchSources]),
      definition.id,
      signedDelta(definition),
    );
  }
  return freezeInduction(
    "yes",
    "induction-variable",
    args.definitions,
    orderedNodeIds(args.input.cfg, [site.nodeId, ...latchSources]),
    definition.id,
    signedDelta(definition),
  );
}

function stepSelfUseIsTracked(
  nodeId: string,
  definition: DefUseDefinitionEffect,
  factsByNodeId: ReadonlyMap<string, DefUseFact>,
  flowByNodeId: ReadonlyMap<string, ReachingDefinitionFact>,
): boolean {
  const fact = factsByNodeId.get(nodeId);
  const flow = flowByNodeId.get(nodeId);
  if (fact === undefined || flow === undefined) return false;
  const definitionIndex = fact.effects.findIndex((effect) => effect.id === definition.id);
  const selfUseIds = fact.effects
    .slice(0, definitionIndex)
    .filter((effect) => effect.kind === "use" && effect.variableId === definition.variableId)
    .map((effect) => effect.id);
  return selfUseIds.some(
    (useId) => flow.uses.find((use) => use.useEffectId === useId)?.availability === "tracked",
  );
}

function stepIsNested(loop: LoopRegion, stepNodeId: string, loops: readonly LoopRegion[]): boolean {
  return loops.some(
    (candidate) =>
      candidate.id !== loop.id &&
      strictlyContains(loop.range, candidate.range) &&
      candidate.nodeIds.includes(stepNodeId),
  );
}

function pathExistsWithoutStep(
  cfg: FunctionCfg,
  startNodeId: string,
  targetNodeId: string,
  stepNodeId: string,
  memberIds: ReadonlySet<string>,
): boolean {
  if (targetNodeId === stepNodeId || startNodeId === stepNodeId) return false;
  const queue = [startNodeId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || current === stepNodeId || visited.has(current)) continue;
    visited.add(current);
    if (current === targetNodeId) return true;
    cfg.edges
      .filter((edge) => edge.from === current && memberIds.has(edge.to) && edge.to !== stepNodeId)
      .forEach((edge) => queue.push(edge.to));
  }
  return false;
}

function signedDelta(definition: DefUseDefinitionEffect): number {
  if (definition.step === undefined) throw new TypeError("step definition 缺少 evidence");
  return definition.step.operator === "add" ? definition.step.delta : -definition.step.delta;
}

function freezeResult(
  verdict: LoopPredicateResult["verdict"],
  reason: LoopPredicateReason,
  definitions: readonly DefUseDefinitionEffect[],
  nodeIds: readonly string[],
): LoopPredicateResult {
  return Object.freeze({
    verdict,
    reason,
    definitionEffectIds: Object.freeze(definitions.map((definition) => definition.id)),
    nodeIds: Object.freeze([...nodeIds]),
  });
}

function freezeInduction(
  verdict: LoopInductionResult["verdict"],
  reason: LoopPredicateReason,
  definitions: readonly DefUseDefinitionEffect[],
  nodeIds: readonly string[],
  stepDefinitionEffectId: string | null,
  delta: number | null,
): LoopInductionResult {
  return Object.freeze({
    ...freezeResult(verdict, reason, definitions, nodeIds),
    stepDefinitionEffectId,
    delta,
  });
}

function orderedNodeIds(cfg: FunctionCfg, nodeIds: readonly string[]): readonly string[] {
  const values = new Set(nodeIds);
  return cfg.nodes.filter((node) => values.has(node.id)).map((node) => node.id);
}

function strictlyContains(parent: LoopRegion["range"], child: LoopRegion["range"]): boolean {
  return (
    child.from >= parent.from &&
    child.to <= parent.to &&
    (child.from !== parent.from || child.to !== parent.to)
  );
}
