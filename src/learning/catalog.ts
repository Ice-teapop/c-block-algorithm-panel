import {
  DEFAULT_LEARNING_CATALOG_STORAGE_KEY,
  LEARNING_CATALOG_SCHEMA_VERSION,
  LearningCatalogError,
  type CatalogLearningTemplate,
  type CatalogPresetBlock,
  type CatalogVirtualPresetBlock,
  type LearningCatalogEntry,
  type LearningCatalogSnapshot,
  type LearningCatalogStorage,
  type LearningCatalogStorageStatus,
  type LearningFragmentKind,
  type LearningStageDefinition,
  type LearningTemplateDefinition,
  type LearningTemplateDeprecation,
  type LifecycleChangeInput,
  type PresetAlternativeVersion,
  type PresetBlockExplanation,
  type PresetBlockScenario,
  type PresetPlacementCondition,
  type PresetPortDefinition,
  type PresetProvidedSyntaxSlot,
  type PresetSourceBlockDefinition,
  type PresetSyntaxAncestorCapability,
  type PresetSyntaxSlotKind,
  type PresetVirtualBlockDefinition,
  type RetiredLearningTemplateTombstone,
} from "./contracts.js";
import {
  BUILTIN_LEARNING_STAGES,
  BUILTIN_LEARNING_TEMPLATES,
  BUILTIN_VIRTUAL_PRESETS,
} from "./builtins.js";

const STABLE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const VERSION_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;
const CONTROL_FRAGMENT_PATTERN = /^(?:if|for|while|do|switch)\b/u;
const MAX_TEMPLATE_SOURCE_LENGTH = 64 * 1024;
const PRESET_SYNTAX_SLOT_KINDS: ReadonlySet<PresetSyntaxSlotKind> = new Set([
  "function-body",
  "compound-body",
  "loop-body",
  "switch-case",
]);
const PRESET_SYNTAX_ANCESTOR_CAPABILITIES: ReadonlySet<PresetSyntaxAncestorCapability> = new Set([
  "loop",
  "switch",
]);

export interface LearningCatalogOptions {
  readonly stages?: readonly LearningStageDefinition[];
  readonly builtinTemplates?: readonly LearningTemplateDefinition[];
  readonly builtinVirtualPresets?: readonly PresetVirtualBlockDefinition[];
  readonly storage?: LearningCatalogStorage;
  readonly storageKey?: string;
}

export interface LearningCatalog {
  snapshot(): LearningCatalogSnapshot;
  getEntry(id: string): LearningCatalogEntry | null;
  getPreset(id: string): CatalogPresetBlock | null;
  listPlaceablePresets(): readonly CatalogPresetBlock[];
  canPlacePreset(id: string): boolean;
  listInstantiable(): readonly CatalogLearningTemplate[];
  canInstantiate(id: string): boolean;
  createCustom(definition: LearningTemplateDefinition): CatalogLearningTemplate;
  updateCustom(definition: LearningTemplateDefinition): CatalogLearningTemplate;
  deprecateCustom(id: string, input: LifecycleChangeInput): CatalogLearningTemplate;
  reactivateCustom(id: string): CatalogLearningTemplate;
  /** Deletes only the custom definition and persists a tombstone; generated source is untouched. */
  retireCustom(id: string, input: LifecycleChangeInput): RetiredLearningTemplateTombstone;
}

interface StoredCatalogDocument {
  readonly schemaVersion: typeof LEARNING_CATALOG_SCHEMA_VERSION;
  readonly revision: number;
  readonly templates: readonly CatalogLearningTemplate[];
  readonly tombstones: readonly RetiredLearningTemplateTombstone[];
}

interface LoadedCustomState {
  readonly revision: number;
  readonly status: LearningCatalogStorageStatus;
  readonly templates: Map<string, CatalogLearningTemplate>;
  readonly tombstones: Map<string, RetiredLearningTemplateTombstone>;
}

export function createLearningCatalog(options: LearningCatalogOptions = {}): LearningCatalog {
  const stages = normalizeStages(options.stages ?? BUILTIN_LEARNING_STAGES);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const builtinTemplates = new Map<string, CatalogLearningTemplate>();
  for (const definition of options.builtinTemplates ?? BUILTIN_LEARNING_TEMPLATES) {
    const template = normalizeTemplate(definition, "builtin", "active", stageById);
    claimTemplateId(builtinTemplates, template.id);
    builtinTemplates.set(template.id, template);
  }
  const builtinVirtualPresets = new Map<string, CatalogVirtualPresetBlock>();
  const virtualDefinitions =
    options.builtinVirtualPresets ??
    BUILTIN_VIRTUAL_PRESETS.filter((definition) => stageById.has(definition.stage));
  for (const definition of virtualDefinitions) {
    const preset = normalizeVirtualPreset(definition, stageById);
    if (builtinTemplates.has(preset.id) || builtinVirtualPresets.has(preset.id)) {
      throw catalogError("DUPLICATE_TEMPLATE_ID", `预设 id ${preset.id} 重复`);
    }
    builtinVirtualPresets.set(preset.id, preset);
  }

  const storage = options.storage;
  const storageKey = normalizeStorageKey(
    options.storageKey ?? DEFAULT_LEARNING_CATALOG_STORAGE_KEY,
  );
  const loaded = loadCustomState(
    storage,
    storageKey,
    builtinTemplates,
    builtinVirtualPresets,
    stageById,
  );
  let customTemplates = loaded.templates;
  let tombstones = loaded.tombstones;
  let revision = loaded.revision;
  let storageStatus = loaded.status;

  const allTemplateIds = (
    custom: ReadonlyMap<string, CatalogLearningTemplate>,
    retired: ReadonlyMap<string, RetiredLearningTemplateTombstone>,
  ): Set<string> =>
    new Set([
      ...builtinTemplates.keys(),
      ...builtinVirtualPresets.keys(),
      ...custom.keys(),
      ...retired.keys(),
    ]);

  const commit = (
    nextTemplates: Map<string, CatalogLearningTemplate>,
    nextTombstones: Map<string, RetiredLearningTemplateTombstone>,
  ): void => {
    validateCustomState(
      nextTemplates,
      nextTombstones,
      builtinTemplates,
      builtinVirtualPresets,
      stageById,
    );
    const nextRevision = nextSafeRevision(revision);
    const document = storedDocument(nextRevision, nextTemplates, nextTombstones);
    if (storage !== undefined) {
      try {
        storage.setItem(storageKey, JSON.stringify(document));
      } catch (cause) {
        throw catalogError("STORAGE_WRITE_FAILED", "自定义积木目录无法持久化", cause);
      }
    }
    customTemplates = nextTemplates;
    tombstones = nextTombstones;
    revision = nextRevision;
    storageStatus = storage === undefined ? "memory" : "loaded";
  };

  const requireCustomTemplate = (id: string): CatalogLearningTemplate => {
    assertStableIdentifier(id, "template id");
    if (builtinTemplates.has(id) || builtinVirtualPresets.has(id)) {
      throw catalogError("BUILTIN_IMMUTABLE", `内置积木 ${id} 不可修改或删除`);
    }
    if (tombstones.has(id)) {
      throw catalogError("TEMPLATE_RETIRED", `自定义积木 ${id} 已退休`);
    }
    const template = customTemplates.get(id);
    if (template === undefined) {
      throw catalogError("TEMPLATE_NOT_FOUND", `找不到自定义积木 ${id}`);
    }
    return template;
  };

  const snapshot = (): LearningCatalogSnapshot => {
    const templates = sortTemplates(
      [...builtinTemplates.values(), ...customTemplates.values()],
      stages,
    );
    const retired = sortTombstones([...tombstones.values()], stages);
    const presets = sortPresets([...templates, ...builtinVirtualPresets.values()], stages);
    return Object.freeze({
      schemaVersion: LEARNING_CATALOG_SCHEMA_VERSION,
      revision,
      storageStatus,
      stages,
      templates: Object.freeze(templates),
      presets: Object.freeze(presets),
      tombstones: Object.freeze(retired),
    });
  };

  return Object.freeze({
    snapshot,
    getEntry(id: string): LearningCatalogEntry | null {
      assertStableIdentifier(id, "template id");
      return builtinTemplates.get(id) ?? customTemplates.get(id) ?? tombstones.get(id) ?? null;
    },
    getPreset(id: string): CatalogPresetBlock | null {
      assertStableIdentifier(id, "preset id");
      return (
        builtinTemplates.get(id) ?? customTemplates.get(id) ?? builtinVirtualPresets.get(id) ?? null
      );
    },
    listPlaceablePresets(): readonly CatalogPresetBlock[] {
      return Object.freeze(snapshot().presets.filter((preset) => preset.lifecycle === "active"));
    },
    canPlacePreset(id: string): boolean {
      const preset =
        builtinTemplates.get(id) ?? customTemplates.get(id) ?? builtinVirtualPresets.get(id);
      return preset?.lifecycle === "active";
    },
    listInstantiable(): readonly CatalogLearningTemplate[] {
      return Object.freeze(
        snapshot().templates.filter((template) => template.lifecycle === "active"),
      );
    },
    canInstantiate(id: string): boolean {
      const entry = builtinTemplates.get(id) ?? customTemplates.get(id) ?? tombstones.get(id);
      return entry?.kind === "template" && entry.lifecycle === "active";
    },
    createCustom(definition: LearningTemplateDefinition): CatalogLearningTemplate {
      const template = normalizeTemplate(definition, "custom", "active", stageById);
      assertCustomId(template.id);
      if (allTemplateIds(customTemplates, tombstones).has(template.id)) {
        throw catalogError("DUPLICATE_TEMPLATE_ID", `积木 id ${template.id} 已存在`);
      }
      const nextTemplates = new Map(customTemplates).set(template.id, template);
      commit(nextTemplates, new Map(tombstones));
      return template;
    },
    updateCustom(definition: LearningTemplateDefinition): CatalogLearningTemplate {
      const current = requireCustomTemplate(definition.id);
      if (current.lifecycle !== "active") {
        throw catalogError("INVALID_LIFECYCLE", "弃用积木必须先重新启用再修改");
      }
      const template = normalizeTemplate(definition, "custom", "active", stageById);
      assertCustomId(template.id);
      const nextTemplates = new Map(customTemplates).set(template.id, template);
      commit(nextTemplates, new Map(tombstones));
      return template;
    },
    deprecateCustom(id: string, input: LifecycleChangeInput): CatalogLearningTemplate {
      const current = requireCustomTemplate(id);
      const deprecation = normalizeLifecycleChange(input);
      const deprecated = normalizeTemplate(current, "custom", "deprecated", stageById, deprecation);
      const nextTemplates = new Map(customTemplates).set(id, deprecated);
      commit(nextTemplates, new Map(tombstones));
      return deprecated;
    },
    reactivateCustom(id: string): CatalogLearningTemplate {
      const current = requireCustomTemplate(id);
      if (current.lifecycle !== "deprecated") {
        throw catalogError("INVALID_LIFECYCLE", `自定义积木 ${id} 当前不是弃用状态`);
      }
      const active = normalizeTemplate(current, "custom", "active", stageById);
      const nextTemplates = new Map(customTemplates).set(id, active);
      commit(nextTemplates, new Map(tombstones));
      return active;
    },
    retireCustom(id: string, input: LifecycleChangeInput): RetiredLearningTemplateTombstone {
      const current = requireCustomTemplate(id);
      const change = normalizeLifecycleChange(input);
      assertNoInboundReplacement(id, customTemplates, tombstones);
      const tombstone = freezeTombstone({
        id: current.id,
        lastVersion: current.version,
        label: current.label,
        category: current.category,
        stage: current.stage,
        description: current.description,
        reason: change.reason,
        ...(change.replacementId === undefined
          ? current.deprecation?.replacementId === undefined
            ? {}
            : { replacementId: current.deprecation.replacementId }
          : { replacementId: change.replacementId }),
      });
      const nextTemplates = new Map(customTemplates);
      nextTemplates.delete(id);
      const nextTombstones = new Map(tombstones).set(id, tombstone);
      commit(nextTemplates, nextTombstones);
      return tombstone;
    },
  });
}

function normalizeStages(
  definitions: readonly LearningStageDefinition[],
): readonly LearningStageDefinition[] {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw catalogError("INVALID_STAGE", "学习阶段列表不得为空");
  }
  const stages = definitions.map((definition) => {
    if (!isRecord(definition) || !Array.isArray(definition.prerequisites)) {
      throw catalogError("INVALID_STAGE", "学习阶段定义无效");
    }
    const order = definition.order;
    const prerequisites = definition.prerequisites.map((id) =>
      assertStableIdentifier(id, "stage prerequisite"),
    );
    assertNoDuplicates(prerequisites, "stage prerequisite");
    if (typeof order !== "number" || !Number.isSafeInteger(order)) {
      throw catalogError("INVALID_STAGE", "学习阶段 order 必须是安全整数");
    }
    return Object.freeze({
      id: assertStableIdentifier(definition.id, "stage id"),
      version: assertVersion(definition.version, "stage version"),
      label: assertText(definition.label, "stage label"),
      order,
      prerequisites: Object.freeze([...prerequisites].sort(compareText)),
      description: assertText(definition.description, "stage description"),
    });
  });
  const byId = new Map<string, LearningStageDefinition>();
  for (const stage of stages) {
    if (byId.has(stage.id)) throw catalogError("INVALID_STAGE", `学习阶段 ${stage.id} 重复`);
    byId.set(stage.id, stage);
  }
  for (const stage of stages) {
    for (const prerequisite of stage.prerequisites) {
      if (!byId.has(prerequisite)) {
        throw catalogError("UNKNOWN_STAGE", `阶段 ${stage.id} 引用了未知先修阶段 ${prerequisite}`);
      }
    }
  }
  assertAcyclic(
    stages.map((stage) => ({ id: stage.id, edges: stage.prerequisites })),
    "STAGE_CYCLE",
    "学习阶段先修关系存在环",
  );
  return Object.freeze(
    [...stages].sort((left, right) => left.order - right.order || compareText(left.id, right.id)),
  );
}

function normalizeTemplate(
  definition: LearningTemplateDefinition,
  origin: CatalogLearningTemplate["origin"],
  lifecycle: CatalogLearningTemplate["lifecycle"],
  stageById: ReadonlyMap<string, LearningStageDefinition>,
  deprecation?: LearningTemplateDeprecation,
): CatalogLearningTemplate {
  if (!isRecord(definition)) throw catalogError("INVALID_TEMPLATE", "积木模板必须是对象");
  const stage = assertStableIdentifier(definition.stage, "template stage");
  if (!stageById.has(stage)) {
    throw catalogError("UNKNOWN_STAGE", `积木 ${String(definition.id)} 引用了未知阶段 ${stage}`);
  }
  const id = assertStableIdentifier(definition.id, "template id");
  const version = assertVersion(definition.version, "template version");
  const description = assertText(definition.description, "template description");
  const fragmentKind = assertFragmentKind(definition.fragmentKind);
  const source = normalizeTemplateSource(definition.source, fragmentKind);
  const preset = definition as Partial<PresetSourceBlockDefinition>;
  return Object.freeze({
    kind: "template",
    origin,
    lifecycle,
    id,
    version,
    label: assertText(definition.label, "template label"),
    category: assertStableIdentifier(definition.category, "template category"),
    stage,
    source,
    description,
    fragmentKind,
    blockKind: assertSourceBlockKind(preset.blockKind ?? fragmentKind),
    ports: normalizePorts(preset.ports, defaultSourcePorts()),
    placement: normalizePlacement(preset.placement, "function-body"),
    explanation: normalizeExplanation(preset.explanation, description),
    scenarios: normalizeScenarios(preset.scenarios, id, description),
    alternatives: normalizeAlternatives(preset.alternatives, fragmentKind),
    ...(lifecycle === "deprecated"
      ? { deprecation: deprecation ?? normalizeStoredDeprecation(definition) }
      : {}),
  });
}

function normalizeVirtualPreset(
  definition: PresetVirtualBlockDefinition,
  stageById: ReadonlyMap<string, LearningStageDefinition>,
): CatalogVirtualPresetBlock {
  if (!isRecord(definition)) throw catalogError("INVALID_TEMPLATE", "虚拟预设必须是对象");
  const id = assertStableIdentifier(definition.id, "preset id");
  const stage = assertStableIdentifier(definition.stage, "preset stage");
  if (!stageById.has(stage)) {
    throw catalogError("UNKNOWN_STAGE", `预设 ${id} 引用了未知阶段 ${stage}`);
  }
  if (definition.source !== null || definition.fragmentKind !== null) {
    throw catalogError("INVALID_TEMPLATE", `虚拟预设 ${id} 不得携带 C 源码`);
  }
  if (definition.blockKind !== "virtual") {
    throw catalogError("INVALID_TEMPLATE", `虚拟预设 ${id} 的 blockKind 必须是 virtual`);
  }
  const description = assertText(definition.description, "preset description");
  return Object.freeze({
    kind: "virtual-preset",
    origin: "builtin",
    lifecycle: assertPresetLifecycle(definition.lifecycle),
    id,
    version: assertVersion(definition.version, "preset version"),
    label: assertText(definition.label, "preset label"),
    category: assertStableIdentifier(definition.category, "preset category"),
    stage,
    source: null,
    description,
    fragmentKind: null,
    blockKind: "virtual",
    ports: normalizePorts(definition.ports),
    placement: normalizePlacement(definition.placement, "flow-canvas"),
    explanation: normalizeExplanation(definition.explanation, description),
    scenarios: normalizeScenarios(definition.scenarios, id, description),
    alternatives: normalizeAlternatives(definition.alternatives, null),
  });
}

function normalizeTemplateSource(source: unknown, fragmentKind: unknown): string {
  if (
    typeof source !== "string" ||
    source.trim().length === 0 ||
    source.length > MAX_TEMPLATE_SOURCE_LENGTH ||
    source.includes("\0") ||
    source.trimStart().startsWith("#")
  ) {
    throw catalogError("INVALID_TEMPLATE", "模板源码必须是非空、无 NUL 的 C 语句或控制片段");
  }
  const trimmed = source.trim();
  if (fragmentKind === "statement" && !trimmed.endsWith(";")) {
    throw catalogError("INVALID_TEMPLATE", "statement 模板必须以分号结束");
  }
  if (fragmentKind === "control" && !CONTROL_FRAGMENT_PATTERN.test(trimmed)) {
    throw catalogError("INVALID_TEMPLATE", "control 模板必须以 C 控制语句开头");
  }
  return source;
}

function assertSourceBlockKind(value: unknown): "statement" | "control" | "function" | "module" {
  if (value !== "statement" && value !== "control" && value !== "function" && value !== "module") {
    throw catalogError(
      "INVALID_TEMPLATE",
      "source preset blockKind 必须是 statement、control、function 或 module",
    );
  }
  return value;
}

function assertPresetLifecycle(value: unknown): "active" | "deprecated" {
  if (value !== "active" && value !== "deprecated") {
    throw catalogError("INVALID_LIFECYCLE", "内置预设 lifecycle 必须是 active 或 deprecated");
  }
  return value;
}

function defaultSourcePorts(): readonly PresetPortDefinition[] {
  return Object.freeze([
    Object.freeze({
      id: "control.in",
      label: "进入",
      direction: "input" as const,
      channel: "control" as const,
      cardinality: "one" as const,
    }),
    Object.freeze({
      id: "control.next",
      label: "下一步",
      direction: "output" as const,
      channel: "control" as const,
      cardinality: "one" as const,
    }),
  ]);
}

function normalizePorts(
  value: unknown,
  fallback?: readonly PresetPortDefinition[],
): readonly PresetPortDefinition[] {
  const input = value === undefined ? fallback : value;
  if (!Array.isArray(input) || input.length === 0) {
    throw catalogError("INVALID_TEMPLATE", "preset ports 必须是非空数组");
  }
  const ids = new Set<string>();
  const ports = input.map((candidate) => {
    if (!isRecord(candidate)) throw catalogError("INVALID_TEMPLATE", "preset port 必须是对象");
    const id = assertStableIdentifier(candidate.id, "preset port id");
    if (ids.has(id)) throw catalogError("INVALID_TEMPLATE", `preset port ${id} 重复`);
    ids.add(id);
    const direction = candidate.direction;
    const channel = candidate.channel;
    const cardinality = candidate.cardinality;
    if (direction !== "input" && direction !== "output") {
      throw catalogError("INVALID_TEMPLATE", `preset port ${id} direction 无效`);
    }
    if (channel !== "control" && channel !== "data") {
      throw catalogError("INVALID_TEMPLATE", `preset port ${id} channel 无效`);
    }
    if (cardinality !== "one" && cardinality !== "many") {
      throw catalogError("INVALID_TEMPLATE", `preset port ${id} cardinality 无效`);
    }
    return Object.freeze({
      id,
      label: assertText(candidate.label, "preset port label"),
      direction,
      channel,
      cardinality,
      ...(candidate.dataType === undefined
        ? {}
        : { dataType: assertStableIdentifier(candidate.dataType, "preset port dataType") }),
      ...(candidate.branch === undefined
        ? {}
        : { branch: assertStableIdentifier(candidate.branch, "preset port branch") }),
    });
  });
  return Object.freeze(ports);
}

function normalizePlacement(
  value: unknown,
  expectedScope: PresetPlacementCondition["scope"],
): PresetPlacementCondition {
  if (value === undefined) {
    return Object.freeze({
      scope: expectedScope,
      allowedParentNodeTypes: Object.freeze(
        expectedScope === "function-body" ? ["compound_statement"] : [],
      ),
      requiresHeaders: Object.freeze([]),
      requiresSymbols: Object.freeze([]),
      acceptedSyntaxSlots:
        expectedScope === "function-body"
          ? Object.freeze([...PRESET_SYNTAX_SLOT_KINDS])
          : Object.freeze([]),
      requiredAnyAncestorCapabilities: Object.freeze([]),
      providedSyntaxSlots: Object.freeze([]),
    });
  }
  if (!isRecord(value) || value.scope !== expectedScope) {
    throw catalogError("INVALID_TEMPLATE", `preset placement scope 必须是 ${expectedScope}`);
  }
  return Object.freeze({
    scope: expectedScope,
    allowedParentNodeTypes: normalizeIdentifierList(
      value.allowedParentNodeTypes,
      "placement allowed parent",
    ),
    requiresHeaders: normalizeIdentifierList(value.requiresHeaders, "placement header"),
    requiresSymbols: normalizeIdentifierList(value.requiresSymbols, "placement symbol"),
    acceptedSyntaxSlots: normalizeSyntaxSlotKinds(
      value.acceptedSyntaxSlots,
      expectedScope === "function-body" ? [...PRESET_SYNTAX_SLOT_KINDS] : [],
    ),
    requiredAnyAncestorCapabilities: normalizeAncestorCapabilities(
      value.requiredAnyAncestorCapabilities,
    ),
    providedSyntaxSlots: normalizeProvidedSyntaxSlots(value.providedSyntaxSlots),
  });
}

function normalizeAncestorCapabilities(value: unknown): readonly PresetSyntaxAncestorCapability[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw catalogError("INVALID_TEMPLATE", "placement ancestor capabilities 必须是数组");
  }
  const seen = new Set<PresetSyntaxAncestorCapability>();
  return Object.freeze(
    value.map((candidate) => {
      if (
        typeof candidate !== "string" ||
        !PRESET_SYNTAX_ANCESTOR_CAPABILITIES.has(candidate as PresetSyntaxAncestorCapability)
      ) {
        throw catalogError("INVALID_TEMPLATE", `未知 ancestor capability：${String(candidate)}`);
      }
      const capability = candidate as PresetSyntaxAncestorCapability;
      if (seen.has(capability)) {
        throw catalogError("INVALID_TEMPLATE", `ancestor capability ${capability} 重复`);
      }
      seen.add(capability);
      return capability;
    }),
  );
}

function normalizeSyntaxSlotKinds(
  value: unknown,
  fallback: readonly PresetSyntaxSlotKind[],
): readonly PresetSyntaxSlotKind[] {
  const input = value === undefined ? fallback : value;
  if (!Array.isArray(input)) {
    throw catalogError("INVALID_TEMPLATE", "placement accepted syntax slots 必须是数组");
  }
  const seen = new Set<PresetSyntaxSlotKind>();
  const slots = input.map((candidate) => {
    if (
      typeof candidate !== "string" ||
      !PRESET_SYNTAX_SLOT_KINDS.has(candidate as PresetSyntaxSlotKind)
    ) {
      throw catalogError("INVALID_TEMPLATE", `未知 syntax slot：${String(candidate)}`);
    }
    const slot = candidate as PresetSyntaxSlotKind;
    if (seen.has(slot)) throw catalogError("INVALID_TEMPLATE", `syntax slot ${slot} 重复`);
    seen.add(slot);
    return slot;
  });
  return Object.freeze(slots);
}

function normalizeProvidedSyntaxSlots(value: unknown): readonly PresetProvidedSyntaxSlot[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw catalogError("INVALID_TEMPLATE", "placement provided syntax slots 必须是数组");
  }
  const ids = new Set<string>();
  return Object.freeze(
    value.map((candidate) => {
      if (!isRecord(candidate)) {
        throw catalogError("INVALID_TEMPLATE", "provided syntax slot 必须是对象");
      }
      const id = assertStableIdentifier(candidate.id, "provided syntax slot id");
      if (ids.has(id)) throw catalogError("INVALID_TEMPLATE", `provided syntax slot ${id} 重复`);
      ids.add(id);
      const kind = candidate.kind;
      if (typeof kind !== "string" || !PRESET_SYNTAX_SLOT_KINDS.has(kind as PresetSyntaxSlotKind)) {
        throw catalogError("INVALID_TEMPLATE", `provided syntax slot ${id} kind 无效`);
      }
      if (candidate.cardinality !== "one" && candidate.cardinality !== "many") {
        throw catalogError("INVALID_TEMPLATE", `provided syntax slot ${id} cardinality 无效`);
      }
      return Object.freeze({
        id,
        label: assertText(candidate.label, "provided syntax slot label"),
        kind: kind as PresetSyntaxSlotKind,
        cardinality: candidate.cardinality,
        ...(candidate.branch === undefined
          ? {}
          : { branch: assertStableIdentifier(candidate.branch, "provided syntax slot branch") }),
      });
    }),
  );
}

function normalizeExplanation(value: unknown, description: string): PresetBlockExplanation {
  if (value === undefined) {
    return Object.freeze({
      summary: description,
      principle: description,
      whenToUse: Object.freeze(["当算法步骤与该语义一致时使用。"]),
      pitfalls: Object.freeze(["连接前确认作用域、变量和分支前置条件。"]),
    });
  }
  if (!isRecord(value)) throw catalogError("INVALID_TEMPLATE", "preset explanation 必须是对象");
  return Object.freeze({
    summary: assertText(value.summary, "explanation summary"),
    principle: assertText(value.principle, "explanation principle"),
    whenToUse: normalizeTextList(value.whenToUse, "explanation whenToUse", true),
    pitfalls: normalizeTextList(value.pitfalls, "explanation pitfalls", true),
  });
}

function normalizeScenarios(
  value: unknown,
  presetId: string,
  description: string,
): readonly PresetBlockScenario[] {
  const input =
    value === undefined
      ? [
          {
            id: `${presetId}.case.default`,
            label: "默认案例",
            description,
            mode: "teaching",
            stdin: "",
            arguments: [],
          },
        ]
      : value;
  if (!Array.isArray(input) || input.length === 0) {
    throw catalogError("INVALID_TEMPLATE", "preset scenarios 必须是非空数组");
  }
  const ids = new Set<string>();
  const scenarios = input.map((candidate) => {
    if (!isRecord(candidate)) {
      throw catalogError("INVALID_TEMPLATE", "preset scenario 必须是对象");
    }
    const id = assertStableIdentifier(candidate.id, "scenario id");
    if (ids.has(id)) throw catalogError("INVALID_TEMPLATE", `scenario ${id} 重复`);
    ids.add(id);
    if (candidate.mode !== "teaching" && candidate.mode !== "real-run") {
      throw catalogError("INVALID_TEMPLATE", `scenario ${id} mode 无效`);
    }
    if (!Array.isArray(candidate.arguments)) {
      throw catalogError("INVALID_TEMPLATE", `scenario ${id} arguments 必须是数组`);
    }
    return Object.freeze({
      id,
      label: assertText(candidate.label, "scenario label"),
      description: assertText(candidate.description, "scenario description"),
      mode: candidate.mode,
      stdin: assertPayload(candidate.stdin, "scenario stdin"),
      arguments: Object.freeze(
        candidate.arguments.map((argument) => assertPayload(argument, "scenario argument")),
      ),
      ...(candidate.expectedOutput === undefined
        ? {}
        : { expectedOutput: assertPayload(candidate.expectedOutput, "scenario expectedOutput") }),
    });
  });
  return Object.freeze(scenarios);
}

function normalizeAlternatives(
  value: unknown,
  fragmentKind: LearningFragmentKind | null,
): readonly PresetAlternativeVersion[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw catalogError("INVALID_TEMPLATE", "preset alternatives 必须是数组");
  }
  const versions = new Set<string>();
  const alternatives = value.map((candidate) => {
    if (!isRecord(candidate)) {
      throw catalogError("INVALID_TEMPLATE", "preset alternative 必须是对象");
    }
    const version = assertVersion(candidate.version, "alternative version");
    if (versions.has(version)) {
      throw catalogError("INVALID_TEMPLATE", `alternative version ${version} 重复`);
    }
    versions.add(version);
    if (typeof candidate.recommended !== "boolean") {
      throw catalogError("INVALID_TEMPLATE", `alternative ${version} recommended 必须是 boolean`);
    }
    let source: string | null;
    if (fragmentKind === null) {
      if (candidate.source !== null) {
        throw catalogError("INVALID_TEMPLATE", "virtual alternative source 必须是 null");
      }
      source = null;
    } else {
      source = normalizeTemplateSource(candidate.source, fragmentKind);
    }
    return Object.freeze({
      version,
      label: assertText(candidate.label, "alternative label"),
      description: assertText(candidate.description, "alternative description"),
      source,
      recommended: candidate.recommended,
    });
  });
  return Object.freeze(alternatives);
}

function normalizeIdentifierList(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw catalogError("INVALID_TEMPLATE", `${field} 必须是数组`);
  const normalized = value.map((entry) => assertStableIdentifier(entry, field));
  if (new Set(normalized).size !== normalized.length) {
    throw catalogError("INVALID_TEMPLATE", `${field} 不得重复`);
  }
  return Object.freeze([...normalized].sort(compareText));
}

function normalizeTextList(
  value: unknown,
  field: string,
  requireNonEmpty: boolean,
): readonly string[] {
  if (!Array.isArray(value) || (requireNonEmpty && value.length === 0)) {
    throw catalogError("INVALID_TEMPLATE", `${field} 必须是非空数组`);
  }
  return Object.freeze(value.map((entry) => assertText(entry, field)));
}

function assertPayload(value: unknown, field: string): string {
  if (typeof value !== "string" || value.includes("\0") || value.length > 1024 * 1024) {
    throw catalogError("INVALID_TEMPLATE", `${field} 必须是小于 1 MiB 且无 NUL 的字符串`);
  }
  return value;
}

function normalizeLifecycleChange(input: LifecycleChangeInput): LearningTemplateDeprecation {
  if (!isRecord(input)) throw catalogError("INVALID_LIFECYCLE", "生命周期变更必须是对象");
  const reason = assertText(input.reason, "lifecycle reason");
  return Object.freeze({
    reason,
    ...(input.replacementId === undefined
      ? {}
      : { replacementId: assertStableIdentifier(input.replacementId, "replacement id") }),
  });
}

function normalizeStoredDeprecation(
  definition: LearningTemplateDefinition,
): LearningTemplateDeprecation {
  const value = (definition as Partial<CatalogLearningTemplate>).deprecation;
  if (value === undefined) {
    throw catalogError("INVALID_LIFECYCLE", "弃用积木缺少 deprecation 信息");
  }
  return normalizeLifecycleChange(value);
}

function validateCustomState(
  customTemplates: ReadonlyMap<string, CatalogLearningTemplate>,
  tombstones: ReadonlyMap<string, RetiredLearningTemplateTombstone>,
  builtinTemplates: ReadonlyMap<string, CatalogLearningTemplate>,
  builtinVirtualPresets: ReadonlyMap<string, CatalogVirtualPresetBlock>,
  stageById: ReadonlyMap<string, LearningStageDefinition>,
): void {
  const ids = new Set([...builtinTemplates.keys(), ...builtinVirtualPresets.keys()]);
  for (const template of customTemplates.values()) {
    assertCustomId(template.id);
    if (ids.has(template.id)) {
      throw catalogError("DUPLICATE_TEMPLATE_ID", `积木 id ${template.id} 重复`);
    }
    ids.add(template.id);
    if (!stageById.has(template.stage)) {
      throw catalogError("UNKNOWN_STAGE", `积木 ${template.id} 引用了未知阶段 ${template.stage}`);
    }
  }
  for (const tombstone of tombstones.values()) {
    assertCustomId(tombstone.id);
    if (ids.has(tombstone.id)) {
      throw catalogError("DUPLICATE_TEMPLATE_ID", `积木 id ${tombstone.id} 重复`);
    }
    ids.add(tombstone.id);
    if (!stageById.has(tombstone.stage)) {
      throw catalogError("UNKNOWN_STAGE", `退休积木 ${tombstone.id} 引用了未知阶段`);
    }
  }

  const live = new Map([...builtinTemplates, ...customTemplates]);
  const edges: { id: string; edges: readonly string[] }[] = [];
  for (const template of customTemplates.values()) {
    const replacement = template.deprecation?.replacementId;
    if (replacement !== undefined) {
      if (!live.has(replacement)) {
        throw catalogError(
          "UNKNOWN_REPLACEMENT",
          `积木 ${template.id} 的替代项 ${replacement} 不存在`,
        );
      }
      edges.push({ id: template.id, edges: [replacement] });
    } else {
      edges.push({ id: template.id, edges: [] });
    }
  }
  for (const tombstone of tombstones.values()) {
    if (tombstone.replacementId !== undefined && !live.has(tombstone.replacementId)) {
      throw catalogError(
        "UNKNOWN_REPLACEMENT",
        `退休积木 ${tombstone.id} 的替代项 ${tombstone.replacementId} 不存在`,
      );
    }
  }
  assertAcyclic(edges, "REPLACEMENT_CYCLE", "积木替代关系存在环");
}

function loadCustomState(
  storage: LearningCatalogStorage | undefined,
  storageKey: string,
  builtinTemplates: ReadonlyMap<string, CatalogLearningTemplate>,
  builtinVirtualPresets: ReadonlyMap<string, CatalogVirtualPresetBlock>,
  stageById: ReadonlyMap<string, LearningStageDefinition>,
): LoadedCustomState {
  if (storage === undefined) return emptyCustomState("memory");
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null) return emptyCustomState("empty");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.schemaVersion !== LEARNING_CATALOG_SCHEMA_VERSION) {
      throw new Error("schemaVersion 不受支持");
    }
    if (!Number.isSafeInteger(parsed.revision) || (parsed.revision as number) < 0) {
      throw new Error("revision 无效");
    }
    if (!Array.isArray(parsed.templates) || !Array.isArray(parsed.tombstones)) {
      throw new Error("目录数组缺失");
    }
    const templates = new Map<string, CatalogLearningTemplate>();
    for (const value of parsed.templates) {
      const template = parseStoredTemplate(value, stageById);
      claimTemplateId(templates, template.id);
      templates.set(template.id, template);
    }
    const tombstones = new Map<string, RetiredLearningTemplateTombstone>();
    for (const value of parsed.tombstones) {
      const tombstone = parseStoredTombstone(value, stageById);
      if (tombstones.has(tombstone.id)) throw new Error("tombstone id 重复");
      tombstones.set(tombstone.id, tombstone);
    }
    validateCustomState(templates, tombstones, builtinTemplates, builtinVirtualPresets, stageById);
    return {
      revision: parsed.revision as number,
      status: "loaded",
      templates,
      tombstones,
    };
  } catch {
    return emptyCustomState("degraded");
  }
}

function parseStoredTemplate(
  value: unknown,
  stageById: ReadonlyMap<string, LearningStageDefinition>,
): CatalogLearningTemplate {
  if (
    !isRecord(value) ||
    value.kind !== "template" ||
    value.origin !== "custom" ||
    (value.lifecycle !== "active" && value.lifecycle !== "deprecated")
  ) {
    throw new Error("stored template 无效");
  }
  const template = normalizeTemplate(
    value as unknown as LearningTemplateDefinition,
    "custom",
    value.lifecycle,
    stageById,
    value.lifecycle === "deprecated"
      ? normalizeLifecycleChange(value.deprecation as LifecycleChangeInput)
      : undefined,
  );
  assertCustomId(template.id);
  return template;
}

function parseStoredTombstone(
  value: unknown,
  stageById: ReadonlyMap<string, LearningStageDefinition>,
): RetiredLearningTemplateTombstone {
  if (
    !isRecord(value) ||
    value.kind !== "tombstone" ||
    value.origin !== "custom" ||
    value.lifecycle !== "retired"
  ) {
    throw new Error("stored tombstone 无效");
  }
  const stage = assertStableIdentifier(value.stage, "tombstone stage");
  if (!stageById.has(stage)) throw new Error("tombstone stage 不存在");
  const tombstone = freezeTombstone({
    id: assertStableIdentifier(value.id, "tombstone id"),
    lastVersion: assertVersion(value.lastVersion, "tombstone version"),
    label: assertText(value.label, "tombstone label"),
    category: assertStableIdentifier(value.category, "tombstone category"),
    stage,
    description: assertText(value.description, "tombstone description"),
    reason: assertText(value.reason, "tombstone reason"),
    ...(value.replacementId === undefined
      ? {}
      : { replacementId: assertStableIdentifier(value.replacementId, "replacement id") }),
  });
  assertCustomId(tombstone.id);
  return tombstone;
}

function freezeTombstone(input: {
  readonly id: string;
  readonly lastVersion: string;
  readonly label: string;
  readonly category: string;
  readonly stage: string;
  readonly description: string;
  readonly reason: string;
  readonly replacementId?: string;
}): RetiredLearningTemplateTombstone {
  return Object.freeze({
    kind: "tombstone",
    origin: "custom",
    lifecycle: "retired",
    ...input,
  });
}

function storedDocument(
  revision: number,
  templates: ReadonlyMap<string, CatalogLearningTemplate>,
  tombstones: ReadonlyMap<string, RetiredLearningTemplateTombstone>,
): StoredCatalogDocument {
  return Object.freeze({
    schemaVersion: LEARNING_CATALOG_SCHEMA_VERSION,
    revision,
    templates: Object.freeze([...templates.values()].sort((a, b) => compareText(a.id, b.id))),
    tombstones: Object.freeze([...tombstones.values()].sort((a, b) => compareText(a.id, b.id))),
  });
}

function emptyCustomState(status: LearningCatalogStorageStatus): LoadedCustomState {
  return { revision: 0, status, templates: new Map(), tombstones: new Map() };
}

function assertNoInboundReplacement(
  id: string,
  templates: ReadonlyMap<string, CatalogLearningTemplate>,
  tombstones: ReadonlyMap<string, RetiredLearningTemplateTombstone>,
): void {
  const owner =
    [...templates.values()].find((entry) => entry.deprecation?.replacementId === id)?.id ??
    [...tombstones.values()].find((entry) => entry.replacementId === id)?.id;
  if (owner !== undefined) {
    throw catalogError("TEMPLATE_REFERENCED", `积木 ${id} 仍被 ${owner} 作为替代项引用`);
  }
}

function sortTemplates(
  templates: readonly CatalogLearningTemplate[],
  stages: readonly LearningStageDefinition[],
): CatalogLearningTemplate[] {
  const order = new Map(stages.map((stage, index) => [stage.id, index]));
  return [...templates].sort(
    (left, right) =>
      (order.get(left.stage) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.stage) ?? Number.MAX_SAFE_INTEGER) ||
      compareText(left.category, right.category) ||
      compareText(left.id, right.id),
  );
}

function sortPresets(
  presets: readonly CatalogPresetBlock[],
  stages: readonly LearningStageDefinition[],
): CatalogPresetBlock[] {
  const order = new Map(stages.map((stage, index) => [stage.id, index]));
  return [...presets].sort(
    (left, right) =>
      (order.get(left.stage) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.stage) ?? Number.MAX_SAFE_INTEGER) ||
      compareText(left.category, right.category) ||
      compareText(left.id, right.id),
  );
}

function sortTombstones(
  entries: readonly RetiredLearningTemplateTombstone[],
  stages: readonly LearningStageDefinition[],
): RetiredLearningTemplateTombstone[] {
  const order = new Map(stages.map((stage, index) => [stage.id, index]));
  return [...entries].sort(
    (left, right) =>
      (order.get(left.stage) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.stage) ?? Number.MAX_SAFE_INTEGER) || compareText(left.id, right.id),
  );
}

function assertAcyclic(
  nodes: readonly { readonly id: string; readonly edges: readonly string[] }[],
  code: "STAGE_CYCLE" | "REPLACEMENT_CYCLE",
  message: string,
): void {
  const edgesById = new Map(nodes.map((node) => [node.id, node.edges]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string): void => {
    if (state.get(id) === "visiting") throw catalogError(code, message);
    if (state.get(id) === "done") return;
    state.set(id, "visiting");
    for (const edge of edgesById.get(id) ?? []) {
      if (edgesById.has(edge)) visit(edge);
    }
    state.set(id, "done");
  };
  for (const id of edgesById.keys()) visit(id);
}

function claimTemplateId(
  templates: ReadonlyMap<string, CatalogLearningTemplate>,
  id: string,
): void {
  if (templates.has(id)) throw catalogError("DUPLICATE_TEMPLATE_ID", `积木 id ${id} 重复`);
}

function assertCustomId(id: string): void {
  if (!id.startsWith("custom.")) {
    throw catalogError("CUSTOM_ID_REQUIRED", "自定义积木 id 必须以 custom. 开头");
  }
}

function assertStableIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !STABLE_IDENTIFIER_PATTERN.test(value)) {
    throw catalogError("INVALID_TEMPLATE", `${field} 必须是稳定的小写标识符`);
  }
  return value;
}

function assertVersion(value: unknown, field: string): string {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw catalogError("INVALID_TEMPLATE", `${field} 必须是语义化版本`);
  }
  return value;
}

function assertText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw catalogError("INVALID_TEMPLATE", `${field} 必须是无首尾空白的非空文本`);
  }
  return value;
}

function assertFragmentKind(value: unknown): "statement" | "control" {
  if (value !== "statement" && value !== "control") {
    throw catalogError("INVALID_TEMPLATE", "fragmentKind 必须是 statement 或 control");
  }
  return value;
}

function assertNoDuplicates(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw catalogError("INVALID_STAGE", `${field} 不得重复`);
  }
}

function normalizeStorageKey(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("learning catalog storageKey 必须是非空字符串");
  }
  return value;
}

function nextSafeRevision(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) {
    throw new RangeError("learning catalog revision 已达到安全上限");
  }
  return revision + 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function catalogError(
  code: ConstructorParameters<typeof LearningCatalogError>[0],
  message: string,
  cause?: unknown,
): LearningCatalogError {
  return new LearningCatalogError(code, message, cause === undefined ? undefined : { cause });
}
