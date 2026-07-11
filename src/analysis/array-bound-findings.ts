import type {
  AnalysisFinding,
  AnalysisFindingEvidence,
  ArrayAccessFact,
  CfgNode,
  DefUseDefinitionEffect,
  DefUseUseEffect,
  DefUseVariable,
  FunctionCfg,
  FunctionDefUse,
  LoopConditionComparisonFact,
  LoopConditionFact,
  LoopPredicateFact,
  LoopRegion,
  ReachingDefinitionUse,
} from "./model.js";

export interface ArrayBoundFindingInput {
  readonly cfg: FunctionCfg;
  readonly defUse: FunctionDefUse;
}

interface AnalysisIndex {
  readonly nodesById: ReadonlyMap<string, CfgNode>;
  readonly variablesById: ReadonlyMap<string, DefUseVariable>;
  readonly definitionsById: ReadonlyMap<string, DefUseDefinitionEffect>;
  readonly definitionNodeById: ReadonlyMap<string, string>;
  readonly conditionByLoopId: ReadonlyMap<string, LoopConditionFact>;
  readonly predicateByLoopId: ReadonlyMap<string, LoopPredicateFact>;
  readonly factsByNodeId: ReadonlyMap<string, FunctionDefUse["facts"][number]>;
  readonly flowByNodeId: ReadonlyMap<string, FunctionDefUse["reachingDefinitions"][number]>;
}

interface LoopContext {
  readonly region: LoopRegion;
  readonly condition: LoopConditionFact;
  readonly predicate: LoopPredicateFact;
}

interface RuntimeOrigin {
  readonly variableId: string;
  readonly range: DefUseDefinitionEffect["range"];
}

/**
 * Publishes the three deliberately narrow array-bound rules from M5a.
 *
 * The collector consumes only frozen CFG/def-use facts. Ambiguous control, non-direct indices,
 * nested loops, address formation and conditional evaluation remain silent.
 */
export function collectArrayBoundFindings(
  input: ArrayBoundFindingInput,
): readonly AnalysisFinding[] {
  const index = buildIndex(input);
  const suppressedAccessIds = new Set<string>();
  const findings: AnalysisFinding[] = [];

  findings.push(...collectOffByOneFindings(input, index, suppressedAccessIds));
  findings.push(...collectIndexMismatchFindings(input, index, suppressedAccessIds));
  findings.push(...collectRuntimeBoundFindings(input, index, suppressedAccessIds));

  return Object.freeze(findings);
}

function collectOffByOneFindings(
  input: ArrayBoundFindingInput,
  index: AnalysisIndex,
  suppressedAccessIds: Set<string>,
): readonly AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  for (const region of input.defUse.loopRegions) {
    const context = loopContext(index, region);
    if (!isSimpleLoop(input.defUse.loopRegions, context) || region.kind === "do-while") continue;
    const comparison = context.condition.comparisons[0];
    if (
      comparison === undefined ||
      context.condition.comparisons.length !== 1 ||
      comparison.operator !== "<=" ||
      comparison.left.kind !== "variable" ||
      comparison.right.kind !== "literal"
    ) {
      continue;
    }
    const controllerId = comparison.left.variableId;
    const controller = index.variablesById.get(controllerId);
    const predicate = context.predicate.variables.find(
      (candidate) => candidate.variableId === controllerId,
    );
    const zeroInitializer = context.condition.zeroInitializers.find(
      (candidate) => candidate.variableId === controllerId,
    );
    const stepDefinition =
      predicate?.isInductionVar.stepDefinitionEffectId === null ||
      predicate?.isInductionVar.stepDefinitionEffectId === undefined
        ? undefined
        : index.definitionsById.get(predicate.isInductionVar.stepDefinitionEffectId);
    if (
      controller === undefined ||
      controller.kind !== "local" ||
      controller.storage !== "scalar" ||
      controller.tracking !== "precise" ||
      zeroInitializer === undefined ||
      context.condition.zeroInitializers.filter(
        (candidate) => candidate.variableId === controllerId,
      ).length !== 1 ||
      predicate?.isInductionVar.verdict !== "yes" ||
      predicate.isInductionVar.delta !== 1 ||
      stepDefinition?.step === undefined
    ) {
      continue;
    }

    for (const shape of input.defUse.arrayShapes) {
      const dimension = shape.dimensions[0];
      if (dimension === undefined || dimension.extent !== comparison.right.value) continue;
      const candidates = input.defUse.arrayAccesses.filter(
        (access) =>
          access.variableId === shape.variableId &&
          eligibleLoopAccess(access, region, input.cfg) &&
          access.indices[0]?.directVariableId === controllerId &&
          (region.kind === "for" ||
            access.expressionRange.from < stepDefinition.step!.expressionRange.from),
      );
      const access = candidates[0];
      const variable = index.variablesById.get(shape.variableId);
      const owner = access === undefined ? null : primaryOwnerForNodeId(input.cfg, access.nodeId);
      if (access === undefined || variable === undefined || owner === null) continue;
      candidates.forEach((candidate) => suppressedAccessIds.add(candidate.id));
      findings.push(
        freezeFinding({
          functionId: input.cfg.id,
          ruleId: "loop-off-by-one",
          reason: "inclusive-bound-reaches-fixed-extent",
          confidence: "certain",
          primaryRange: comparison.operatorRange,
          ownerNodeId: primaryOwnerForNodeId(input.cfg, region.conditionNodeId)?.id ?? owner.id,
          subject: variable.name,
          subjectVariableId: variable.id,
          evidence: [
            { role: "bound", range: dimension.extentRange },
            { role: "definition", range: zeroInitializer.valueRange },
            { role: "condition", range: comparison.range },
            { role: "index", range: access.indices[0]!.indexRange },
            { role: "use", range: access.expressionRange },
            { role: "definition", range: stepDefinition.step.expressionRange },
          ],
        }),
      );
    }
  }
  return findings;
}

function collectIndexMismatchFindings(
  input: ArrayBoundFindingInput,
  index: AnalysisIndex,
  suppressedAccessIds: Set<string>,
): readonly AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  for (const access of input.defUse.arrayAccesses) {
    if (suppressedAccessIds.has(access.id) || !basicDynamicAccess(access)) continue;
    const region = innermostLoopForAccess(input.defUse.loopRegions, access);
    const context = region === null ? null : loopContext(index, region);
    if (region === null || context === null || !isSimpleLoop(input.defUse.loopRegions, context))
      continue;
    const indexVariableId = access.indices[0]?.directVariableId;
    if (indexVariableId === null || indexVariableId === undefined) continue;

    const controllerComparisons = new Map<string, LoopConditionComparisonFact>();
    for (const comparison of context.condition.comparisons) {
      for (const variableId of comparisonVariableIds(comparison)) {
        const predicate = context.predicate.variables.find(
          (candidate) => candidate.variableId === variableId,
        );
        if (
          predicate?.isInductionVar.verdict === "yes" &&
          predicate.isInductionVar.delta !== null &&
          comparisonDirectionMatches(comparison, variableId, predicate.isInductionVar.delta)
        ) {
          controllerComparisons.set(variableId, comparison);
        }
      }
    }
    if (controllerComparisons.size !== 1) continue;
    const [controllerId, comparison] = [...controllerComparisons][0]!;
    if (
      controllerId === indexVariableId ||
      context.condition.comparisons.some((candidate) =>
        comparisonMentionsVariable(candidate, indexVariableId),
      ) ||
      enclosingConditionConstrainsIndex(input.defUse, index, region, access, indexVariableId)
    ) {
      continue;
    }
    const variable = index.variablesById.get(access.variableId);
    const owner = primaryOwnerForNodeId(input.cfg, access.nodeId);
    if (variable === undefined || owner === null) continue;
    suppressedAccessIds.add(access.id);
    findings.push(
      freezeFinding({
        functionId: input.cfg.id,
        ruleId: "loop-index-mismatch",
        reason: "loop-condition-does-not-constrain-index",
        confidence: "hint",
        primaryRange: access.indices[0]!.indexRange,
        ownerNodeId: owner.id,
        subject: variable.name,
        subjectVariableId: variable.id,
        evidence: [
          { role: "condition", range: comparison.range },
          { role: "index", range: access.indices[0]!.indexRange },
        ],
      }),
    );
  }
  return findings;
}

function collectRuntimeBoundFindings(
  input: ArrayBoundFindingInput,
  index: AnalysisIndex,
  suppressedAccessIds: ReadonlySet<string>,
): readonly AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  for (const access of input.defUse.arrayAccesses) {
    if (
      suppressedAccessIds.has(access.id) ||
      access.execution !== "always" ||
      access.control === "conditional" ||
      access.mode !== "value"
    ) {
      continue;
    }
    const indexFact = access.indices[0];
    const indexVariableId = indexFact?.directVariableId;
    const shape = input.defUse.arrayShapes.find(
      (candidate) => candidate.variableId === access.variableId,
    );
    const dimension = shape?.dimensions[0];
    if (indexFact === undefined || indexVariableId == null || dimension === undefined) continue;

    const region = innermostLoopForAccess(input.defUse.loopRegions, access);
    const context = region === null ? null : loopContext(index, region);
    if (context !== null && !isSimpleLoop(input.defUse.loopRegions, context)) continue;
    if (context !== null && provesFixedBounds(context, indexVariableId, dimension.extent)) continue;

    const directOrigins = runtimeOriginsAtRange(
      input,
      index,
      access.nodeId,
      indexVariableId,
      indexFact.indexRange,
    );
    const loopBound =
      context === null ? null : runtimeLoopBoundOrigin(input, index, context, indexVariableId);
    const origins = directOrigins.length > 0 ? directOrigins : (loopBound?.origins ?? []);
    if (origins.length === 0) continue;

    const variable = index.variablesById.get(access.variableId);
    const owner = primaryOwnerForNodeId(input.cfg, access.nodeId);
    if (variable === undefined || owner === null) continue;
    findings.push(
      freezeFinding({
        functionId: input.cfg.id,
        ruleId: "runtime-bound-check",
        reason: "runtime-index-without-proven-bound",
        confidence: "hint",
        primaryRange: indexFact.indexRange,
        ownerNodeId: owner.id,
        subject: variable.name,
        subjectVariableId: variable.id,
        evidence: dedupeEvidence([
          { role: "bound", range: dimension.extentRange },
          ...origins.map((origin) => ({ role: "definition" as const, range: origin.range })),
          ...(loopBound === null
            ? []
            : [{ role: "condition" as const, range: loopBound.comparison.range }]),
          { role: "index", range: indexFact.indexRange },
        ]),
      }),
    );
  }
  return findings;
}

function buildIndex(input: ArrayBoundFindingInput): AnalysisIndex {
  const definitionsById = new Map<string, DefUseDefinitionEffect>();
  const definitionNodeById = new Map<string, string>();
  for (const fact of input.defUse.facts) {
    for (const effect of fact.effects) {
      if (effect.kind !== "def") continue;
      definitionsById.set(effect.id, effect);
      definitionNodeById.set(effect.id, fact.nodeId);
    }
  }
  return {
    nodesById: new Map(input.cfg.nodes.map((node) => [node.id, node])),
    variablesById: new Map(input.defUse.variables.map((variable) => [variable.id, variable])),
    definitionsById,
    definitionNodeById,
    conditionByLoopId: new Map(
      input.defUse.loopConditions.map((condition) => [condition.loopId, condition]),
    ),
    predicateByLoopId: new Map(
      input.defUse.loopPredicates.map((predicate) => [predicate.loopId, predicate]),
    ),
    factsByNodeId: new Map(input.defUse.facts.map((fact) => [fact.nodeId, fact])),
    flowByNodeId: new Map(input.defUse.reachingDefinitions.map((flow) => [flow.nodeId, flow])),
  };
}

function loopContext(index: AnalysisIndex, region: LoopRegion): LoopContext | null {
  const condition = index.conditionByLoopId.get(region.id);
  const predicate = index.predicateByLoopId.get(region.id);
  return condition === undefined || predicate === undefined
    ? null
    : { region, condition, predicate };
}

function isSimpleLoop(
  regions: readonly LoopRegion[],
  context: LoopContext | null,
): context is LoopContext {
  return (
    context !== null &&
    context.region.availability === "analyzable" &&
    context.condition.bodyControl === "straight-line" &&
    !regions.some(
      (candidate) =>
        candidate.id !== context.region.id && candidate.parentLoopId === context.region.id,
    )
  );
}

function eligibleLoopAccess(
  access: ArrayAccessFact,
  region: LoopRegion,
  cfg: FunctionCfg,
): boolean {
  const node = cfg.nodes.find((candidate) => candidate.id === access.nodeId);
  return (
    access.execution === "always" &&
    access.control === "loop-dependent" &&
    access.mode === "value" &&
    node?.reachable === true &&
    region.nodeIds.includes(access.nodeId) &&
    access.nodeId !== region.conditionNodeId &&
    access.nodeId !== region.initializerNodeId &&
    access.nodeId !== region.updateNodeId
  );
}

function basicDynamicAccess(access: ArrayAccessFact): boolean {
  return (
    access.execution === "always" &&
    access.control === "loop-dependent" &&
    access.mode === "value" &&
    access.indices[0]?.directVariableId !== null
  );
}

function innermostLoopForAccess(
  regions: readonly LoopRegion[],
  access: ArrayAccessFact,
): LoopRegion | null {
  return (
    regions
      .filter(
        (region) =>
          region.nodeIds.includes(access.nodeId) &&
          access.nodeId !== region.conditionNodeId &&
          access.nodeId !== region.initializerNodeId &&
          access.nodeId !== region.updateNodeId,
      )
      .sort(
        (left, right) =>
          left.range.to - left.range.from - (right.range.to - right.range.from) ||
          right.range.from - left.range.from,
      )[0] ?? null
  );
}

function comparisonVariableIds(comparison: LoopConditionComparisonFact): readonly string[] {
  return Object.freeze(
    [comparison.left, comparison.right]
      .filter((operand) => operand.kind === "variable")
      .map((operand) => operand.variableId),
  );
}

function comparisonMentionsVariable(
  comparison: LoopConditionComparisonFact,
  variableId: string,
): boolean {
  return comparisonVariableIds(comparison).includes(variableId);
}

function comparisonDirectionMatches(
  comparison: LoopConditionComparisonFact,
  variableId: string,
  delta: number,
): boolean {
  const onLeft = comparison.left.kind === "variable" && comparison.left.variableId === variableId;
  const onRight =
    comparison.right.kind === "variable" && comparison.right.variableId === variableId;
  if (delta > 0) {
    return (
      (onLeft && (comparison.operator === "<" || comparison.operator === "<=")) ||
      (onRight && (comparison.operator === ">" || comparison.operator === ">="))
    );
  }
  if (delta < 0) {
    return (
      (onLeft && (comparison.operator === ">" || comparison.operator === ">=")) ||
      (onRight && (comparison.operator === "<" || comparison.operator === "<="))
    );
  }
  return false;
}

function enclosingConditionConstrainsIndex(
  defUse: FunctionDefUse,
  index: AnalysisIndex,
  selected: LoopRegion,
  access: ArrayAccessFact,
  variableId: string,
): boolean {
  return defUse.loopRegions.some((candidate) => {
    if (
      candidate.id === selected.id ||
      !candidate.nodeIds.includes(access.nodeId) ||
      !containsRange(candidate.range, selected.range)
    ) {
      return false;
    }
    return (
      index.conditionByLoopId
        .get(candidate.id)
        ?.comparisons.some((comparison) => comparisonMentionsVariable(comparison, variableId)) ??
      false
    );
  });
}

function provesFixedBounds(context: LoopContext, variableId: string, extent: number): boolean {
  const predicate = context.predicate.variables.find(
    (candidate) => candidate.variableId === variableId,
  );
  const zeroStart =
    context.condition.zeroInitializers.some((candidate) => candidate.variableId === variableId) &&
    predicate?.isInductionVar.verdict === "yes" &&
    (predicate.isInductionVar.delta ?? 0) > 0;
  const explicitLower = context.condition.comparisons.some((comparison) => {
    const normalized = literalBoundFor(comparison, variableId);
    return normalized?.side === "lower" && normalized.inclusive
      ? normalized.value >= 0
      : normalized?.side === "lower" && normalized.value >= -1;
  });
  const upper = context.condition.comparisons.some((comparison) => {
    const normalized = literalBoundFor(comparison, variableId);
    if (normalized?.side !== "upper") return false;
    return normalized.inclusive ? normalized.value < extent : normalized.value <= extent;
  });
  return (zeroStart || explicitLower) && upper;
}

function literalBoundFor(
  comparison: LoopConditionComparisonFact,
  variableId: string,
): {
  readonly side: "lower" | "upper";
  readonly inclusive: boolean;
  readonly value: number;
} | null {
  const inclusive = comparison.operator === "<=" || comparison.operator === ">=";
  if (
    comparison.left.kind === "variable" &&
    comparison.left.variableId === variableId &&
    comparison.right.kind === "literal"
  ) {
    return comparison.operator === "<" || comparison.operator === "<="
      ? { side: "upper", inclusive, value: comparison.right.value }
      : { side: "lower", inclusive, value: comparison.right.value };
  }
  if (
    comparison.right.kind === "variable" &&
    comparison.right.variableId === variableId &&
    comparison.left.kind === "literal"
  ) {
    return comparison.operator === "<" || comparison.operator === "<="
      ? { side: "lower", inclusive, value: comparison.left.value }
      : { side: "upper", inclusive, value: comparison.left.value };
  }
  return null;
}

function runtimeOriginsAtRange(
  input: ArrayBoundFindingInput,
  index: AnalysisIndex,
  nodeId: string,
  variableId: string,
  range: DefUseUseEffect["range"],
): readonly RuntimeOrigin[] {
  const variable = index.variablesById.get(variableId);
  const fact = index.factsByNodeId.get(nodeId);
  const flow = index.flowByNodeId.get(nodeId);
  const uses = fact?.effects.filter(
    (effect): effect is DefUseUseEffect =>
      effect.kind === "use" &&
      effect.variableId === variableId &&
      containsRange(range, effect.range),
  );
  const resolutions = uses?.flatMap(
    (use) => flow?.uses.filter((resolution) => resolution.useEffectId === use.id) ?? [],
  );
  const definitions = (resolutions ?? []).flatMap((resolution) =>
    runtimeDefinitionsForResolution(index, variable, resolution),
  );
  return uniqueRuntimeOrigins(definitions);
}

function runtimeDefinitionsForResolution(
  index: AnalysisIndex,
  variable: DefUseVariable | undefined,
  resolution: ReachingDefinitionUse,
): readonly RuntimeOrigin[] {
  if (resolution.availability !== "tracked") return [];
  return resolution.definitionEffectIds.flatMap((definitionId) => {
    const definition = index.definitionsById.get(definitionId);
    if (
      definition === undefined ||
      (definition.origin === "call-argument"
        ? definition.valueState !== "written" && definition.valueState !== "maybe-written"
        : definition.valueState !== "written") ||
      (definition.origin !== "call-argument" &&
        !(definition.origin === "parameter" && variable?.kind === "parameter"))
    ) {
      return [];
    }
    return [{ variableId: definition.variableId, range: definition.range }];
  });
}

function runtimeLoopBoundOrigin(
  input: ArrayBoundFindingInput,
  index: AnalysisIndex,
  context: LoopContext,
  indexVariableId: string,
): {
  readonly comparison: LoopConditionComparisonFact;
  readonly origins: readonly RuntimeOrigin[];
} | null {
  const controller = context.predicate.variables.find(
    (candidate) => candidate.variableId === indexVariableId,
  );
  if (controller?.isInductionVar.verdict !== "yes") return null;
  for (const comparison of context.condition.comparisons) {
    if (!comparisonMentionsVariable(comparison, indexVariableId)) continue;
    const other = [comparison.left, comparison.right].find(
      (operand) => operand.kind === "variable" && operand.variableId !== indexVariableId,
    );
    if (other?.kind !== "variable") continue;
    const origins = runtimeOriginsAtRange(
      input,
      index,
      context.region.conditionNodeId,
      other.variableId,
      other.range,
    );
    if (origins.length > 0) return { comparison, origins };
  }
  return null;
}

function uniqueRuntimeOrigins(origins: readonly RuntimeOrigin[]): readonly RuntimeOrigin[] {
  const seen = new Set<string>();
  return Object.freeze(
    origins.filter((origin) => {
      const key = `${origin.variableId}:${String(origin.range.from)}:${String(origin.range.to)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

function primaryOwnerForNodeId(cfg: FunctionCfg, nodeId: string): CfgNode | null {
  const node = cfg.nodes.find((candidate) => candidate.id === nodeId);
  if (node === undefined) return null;
  if (node.ownership === "primary") return node;
  if (node.ownership !== "auxiliary") return null;
  return (
    cfg.nodes.find(
      (candidate) =>
        candidate.ownership === "primary" && sameRange(candidate.range, node.ownerBlockRange),
    ) ?? null
  );
}

function dedupeEvidence(
  evidence: readonly AnalysisFindingEvidence[],
): readonly AnalysisFindingEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((entry) => {
    const key = `${entry.role}:${String(entry.range.from)}:${String(entry.range.to)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function freezeFinding(
  input: Omit<AnalysisFinding, "id" | "evidence"> & {
    readonly evidence: readonly AnalysisFindingEvidence[];
  },
): AnalysisFinding {
  const subjectKey = input.subjectVariableId ?? input.subject ?? "none";
  return Object.freeze({
    id: `finding:${input.ruleId}:${input.reason}:${String(input.primaryRange.from)}:${String(input.primaryRange.to)}:${subjectKey}`,
    functionId: input.functionId,
    ruleId: input.ruleId,
    reason: input.reason,
    confidence: input.confidence,
    primaryRange: Object.freeze({ ...input.primaryRange }),
    ownerNodeId: input.ownerNodeId,
    subject: input.subject,
    subjectVariableId: input.subjectVariableId,
    evidence: Object.freeze(
      input.evidence.map((entry) =>
        Object.freeze({ role: entry.role, range: Object.freeze({ ...entry.range }) }),
      ),
    ),
  });
}

function containsRange(
  parent: { readonly from: number; readonly to: number },
  child: { readonly from: number; readonly to: number },
): boolean {
  return child.from >= parent.from && child.to <= parent.to;
}

function sameRange(
  left: { readonly from: number; readonly to: number },
  right: { readonly from: number; readonly to: number },
): boolean {
  return left.from === right.from && left.to === right.to;
}
