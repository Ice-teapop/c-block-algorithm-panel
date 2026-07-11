import type {
  AlgorithmElementDefinition,
  CommandContribution,
  DockGroupContribution,
  DockMenuBranchContribution,
  DockMenuContribution,
  InspectorViewContribution,
  LayoutPresetContribution,
  PanelContribution,
  RegisteredAlgorithmElement,
  RegisteredCommand,
  RegisteredDockGroup,
  RegisteredDockMenu,
  RegisteredInspectorView,
  RegisteredLayoutPreset,
  RegisteredPanel,
  RegisteredWorkbenchPage,
  WorkbenchModuleDefinition,
  WorkbenchModuleManifest,
  WorkbenchModuleSnapshot,
  WorkbenchPageContribution,
  WorkbenchRegistryConflictKind,
  WorkbenchRegistrySnapshot,
} from "./contracts.js";

const STABLE_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const VERSION_PATTERN =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/u;

export class WorkbenchRegistryConflictError extends Error {
  readonly kind: WorkbenchRegistryConflictKind;
  readonly identifier: string;

  constructor(kind: WorkbenchRegistryConflictKind, identifier: string) {
    super(`工作台注册冲突：${kind} “${identifier}” 已存在`);
    this.name = "WorkbenchRegistryConflictError";
    this.kind = kind;
    this.identifier = identifier;
  }
}

/**
 * Deterministic registry for static workbench contribution metadata.
 *
 * Registration snapshots its input and is atomic for a batch. Query results
 * never expose mutable caller-owned objects.
 */
export class WorkbenchModuleRegistry {
  readonly #modules = new Map<string, WorkbenchModuleSnapshot>();
  readonly #inspectorViewOwners = new Map<string, string>();
  readonly #dockGroupOwners = new Map<string, string>();
  readonly #dockMenuOwners = new Map<string, string>();
  readonly #dockMenuBranchOwners = new Map<string, string>();
  readonly #panelOwners = new Map<string, string>();
  readonly #layoutPresetOwners = new Map<string, string>();
  readonly #pageOwners = new Map<string, string>();
  readonly #commandOwners = new Map<string, string>();
  readonly #algorithmElementOwners = new Map<string, string>();

  register(definition: WorkbenchModuleDefinition): this {
    return this.registerAll([definition]);
  }

  registerAll(definitions: readonly WorkbenchModuleDefinition[]): this {
    const modules = definitions.map((definition) => normalizeModule(definition));

    const moduleIds = new Set(this.#modules.keys());
    const inspectorViewIds = new Set(this.#inspectorViewOwners.keys());
    const dockGroupIds = new Set(this.#dockGroupOwners.keys());
    const dockMenuIds = new Set(this.#dockMenuOwners.keys());
    const dockMenuBranchIds = new Set(this.#dockMenuBranchOwners.keys());
    const panelIds = new Set(this.#panelOwners.keys());
    const layoutPresetIds = new Set(this.#layoutPresetOwners.keys());
    const pageIds = new Set(this.#pageOwners.keys());
    const commandIds = new Set(this.#commandOwners.keys());
    const algorithmElementTypes = new Set(this.#algorithmElementOwners.keys());

    for (const module of modules) {
      claim(moduleIds, "module-id", module.manifest.id);
      for (const view of module.inspectorViews) {
        claim(inspectorViewIds, "inspector-view-id", view.id);
      }
      for (const group of module.dockGroups) {
        claim(dockGroupIds, "dock-group-id", group.id);
      }
      for (const menu of module.dockMenus) {
        claim(dockMenuIds, "dock-menu-id", menu.id);
        for (const branch of menu.branches) {
          claim(dockMenuBranchIds, "dock-menu-branch-id", branch.id);
        }
      }
      for (const panel of module.panels) {
        claim(panelIds, "panel-id", panel.id);
      }
      for (const preset of module.layoutPresets) {
        claim(layoutPresetIds, "layout-preset-id", preset.id);
      }
      for (const page of module.pages) {
        claim(pageIds, "page-id", page.id);
      }
      for (const command of module.commands) {
        claim(commandIds, "command-id", command.id);
      }
      for (const element of module.algorithmElements) {
        claim(algorithmElementTypes, "algorithm-element-type", element.type);
      }
    }

    for (const module of modules) {
      for (const page of module.pages) {
        if (!dockGroupIds.has(page.groupId)) {
          throw new TypeError(`工作台页面 “${page.id}” 引用了未注册 Dock 分组 “${page.groupId}”`);
        }
      }
      for (const preset of module.layoutPresets) {
        for (const panelId of preset.panelIds) {
          if (!panelIds.has(panelId)) {
            throw new TypeError(`布局预设 “${preset.id}” 引用了未注册面板 “${panelId}”`);
          }
        }
      }
    }

    for (const module of modules) {
      this.#modules.set(module.manifest.id, module);
      for (const view of module.inspectorViews) {
        this.#inspectorViewOwners.set(view.id, module.manifest.id);
      }
      for (const group of module.dockGroups) {
        this.#dockGroupOwners.set(group.id, module.manifest.id);
      }
      for (const menu of module.dockMenus) {
        this.#dockMenuOwners.set(menu.id, module.manifest.id);
        for (const branch of menu.branches) {
          this.#dockMenuBranchOwners.set(branch.id, module.manifest.id);
        }
      }
      for (const panel of module.panels) {
        this.#panelOwners.set(panel.id, module.manifest.id);
      }
      for (const preset of module.layoutPresets) {
        this.#layoutPresetOwners.set(preset.id, module.manifest.id);
      }
      for (const page of module.pages) {
        this.#pageOwners.set(page.id, module.manifest.id);
      }
      for (const command of module.commands) {
        this.#commandOwners.set(command.id, module.manifest.id);
      }
      for (const element of module.algorithmElements) {
        this.#algorithmElementOwners.set(element.type, module.manifest.id);
      }
    }

    return this;
  }

  hasModule(moduleId: string): boolean {
    return this.#modules.has(moduleId);
  }

  hasCapability(capability: string): boolean {
    return this.findModulesByCapability(capability).length > 0;
  }

  findModulesByCapability(capability: string): readonly WorkbenchModuleSnapshot[] {
    assertStableIdentifier(capability, "capability");
    return Object.freeze(
      sortedModules(this.#modules.values()).filter((module) =>
        module.manifest.capabilities.includes(capability),
      ),
    );
  }

  snapshot(): WorkbenchRegistrySnapshot {
    const modules = Object.freeze(sortedModules(this.#modules.values()));
    const inspectorViews = Object.freeze(
      modules
        .flatMap((module) =>
          module.inspectorViews.map((view) =>
            Object.freeze({ moduleId: module.manifest.id, ...view }),
          ),
        )
        .sort(compareOrderedContribution),
    );
    const dockGroups: readonly RegisteredDockGroup[] = Object.freeze(
      modules
        .flatMap((module) =>
          module.dockGroups.map((group) =>
            Object.freeze({ moduleId: module.manifest.id, ...group }),
          ),
        )
        .sort(compareOrderedContribution),
    );
    const dockMenus: readonly RegisteredDockMenu[] = Object.freeze(
      modules
        .flatMap((module) =>
          module.dockMenus.map((menu) => Object.freeze({ moduleId: module.manifest.id, ...menu })),
        )
        .sort(compareOrderedContribution),
    );
    const panels: readonly RegisteredPanel[] = Object.freeze(
      modules
        .flatMap((module) =>
          module.panels.map((panel) => Object.freeze({ moduleId: module.manifest.id, ...panel })),
        )
        .sort(comparePanelContributions),
    );
    const layoutPresets: readonly RegisteredLayoutPreset[] = Object.freeze(
      modules
        .flatMap((module) =>
          module.layoutPresets.map((preset) =>
            Object.freeze({ moduleId: module.manifest.id, ...preset }),
          ),
        )
        .sort(compareOrderedContribution),
    );
    const dockGroupOrder = new Map(dockGroups.map((group) => [group.id, group.order]));
    const pages: readonly RegisteredWorkbenchPage[] = Object.freeze(
      modules
        .flatMap((module) =>
          module.pages.map((page) => Object.freeze({ moduleId: module.manifest.id, ...page })),
        )
        .sort((left, right) => comparePages(left, right, dockGroupOrder)),
    );
    const commands = Object.freeze(
      modules
        .flatMap((module) =>
          module.commands.map((command) =>
            Object.freeze({ moduleId: module.manifest.id, ...command }),
          ),
        )
        .sort(compareOrderedContribution),
    );
    const algorithmElements: readonly RegisteredAlgorithmElement[] = Object.freeze(
      modules
        .flatMap((module) =>
          module.algorithmElements.map((element) =>
            Object.freeze({ moduleId: module.manifest.id, ...element }),
          ),
        )
        .sort(
          (left, right) =>
            left.category.localeCompare(right.category, "en") ||
            left.type.localeCompare(right.type, "en"),
        ),
    );
    const capabilities = Object.freeze(
      [...new Set(modules.flatMap((module) => module.manifest.capabilities))].sort(compareText),
    );

    return Object.freeze({
      modules,
      inspectorViews,
      dockGroups,
      dockMenus,
      panels,
      layoutPresets,
      pages,
      commands,
      algorithmElements,
      capabilities,
    });
  }
}

function normalizeModule(definition: WorkbenchModuleDefinition): WorkbenchModuleSnapshot {
  if (definition === null || typeof definition !== "object") {
    throw new TypeError("工作台模块定义必须是对象");
  }

  const manifest = normalizeManifest(definition.manifest);
  const inspectorViews = Object.freeze(
    (definition.inspectorViews ?? []).map(normalizeInspectorView).sort(compareOrderedContribution),
  );
  const dockGroups = Object.freeze(
    (definition.dockGroups ?? []).map(normalizeDockGroup).sort(compareOrderedContribution),
  );
  const dockMenus = Object.freeze(
    (definition.dockMenus ?? []).map(normalizeDockMenu).sort(compareOrderedContribution),
  );
  const panels = Object.freeze(
    (definition.panels ?? []).map(normalizePanel).sort(comparePanelContributions),
  );
  const layoutPresets = Object.freeze(
    (definition.layoutPresets ?? []).map(normalizeLayoutPreset).sort(compareOrderedContribution),
  );
  const pages = Object.freeze(
    (definition.pages ?? []).map(normalizePage).sort(comparePageMetadata),
  );
  const commands = Object.freeze(
    (definition.commands ?? []).map(normalizeCommand).sort(compareOrderedContribution),
  );
  const algorithmElements = Object.freeze(
    (definition.algorithmElements ?? [])
      .map(normalizeAlgorithmElement)
      .sort(
        (left, right) =>
          left.category.localeCompare(right.category, "en") ||
          left.type.localeCompare(right.type, "en"),
      ),
  );

  return Object.freeze({
    manifest,
    inspectorViews,
    dockGroups,
    dockMenus,
    panels,
    layoutPresets,
    pages,
    commands,
    algorithmElements,
  });
}

function normalizeManifest(manifest: WorkbenchModuleManifest): WorkbenchModuleManifest {
  if (manifest === null || typeof manifest !== "object") {
    throw new TypeError("工作台模块 manifest 必须是对象");
  }
  const id = assertStableIdentifier(manifest.id, "module id");
  const version = assertVersion(manifest.version, "module version");
  const label = assertLabel(manifest.label, "module label");
  if (!Array.isArray(manifest.capabilities)) {
    throw new TypeError("module capabilities 必须是数组");
  }
  const capabilities = manifest.capabilities.map((capability) =>
    assertStableIdentifier(capability, "capability"),
  );
  assertNoDuplicates(capabilities, "capability");

  return Object.freeze({
    id,
    version,
    label,
    capabilities: Object.freeze(capabilities.sort(compareText)),
  });
}

function normalizeInspectorView(view: InspectorViewContribution): InspectorViewContribution {
  return Object.freeze({
    id: assertStableIdentifier(view.id, "inspector view id"),
    label: assertLabel(view.label, "inspector view label"),
    order: assertOrder(view.order),
  });
}

function normalizeDockGroup(group: DockGroupContribution): DockGroupContribution {
  return Object.freeze({
    id: assertStableIdentifier(group.id, "dock group id"),
    label: assertLabel(group.label, "dock group label"),
    order: assertOrder(group.order),
  });
}

function normalizeDockMenu(menu: DockMenuContribution): DockMenuContribution {
  if (menu === null || typeof menu !== "object" || !Array.isArray(menu.branches)) {
    throw new TypeError("Dock menu 必须提供 branches 数组");
  }
  const branches = menu.branches.map(normalizeDockMenuBranch).sort(compareOrderedContribution);
  assertNoDuplicates(
    branches.map((branch) => branch.id),
    "Dock menu branch id",
  );
  return Object.freeze({
    id: assertStableIdentifier(menu.id, "dock menu id"),
    label: assertLabel(menu.label, "dock menu label"),
    order: assertOrder(menu.order),
    branches: Object.freeze(branches),
  });
}

function normalizeDockMenuBranch(branch: DockMenuBranchContribution): DockMenuBranchContribution {
  return Object.freeze({
    id: assertStableIdentifier(branch.id, "dock menu branch id"),
    label: assertLabel(branch.label, "dock menu branch label"),
    actionId: assertStableIdentifier(branch.actionId, "dock menu branch action id"),
    order: assertOrder(branch.order),
  });
}

function normalizePanel(panel: PanelContribution): PanelContribution {
  if (!["left", "center", "right", "bottom", "floating"].includes(panel.region)) {
    throw new TypeError(`panel region 无效：${String(panel.region)}`);
  }
  if (typeof panel.defaultVisible !== "boolean") {
    throw new TypeError("panel defaultVisible 必须是布尔值");
  }
  return Object.freeze({
    id: assertStableIdentifier(panel.id, "panel id"),
    label: assertLabel(panel.label, "panel label"),
    region: panel.region,
    order: assertOrder(panel.order),
    defaultVisible: panel.defaultVisible,
  });
}

function normalizeLayoutPreset(preset: LayoutPresetContribution): LayoutPresetContribution {
  if (!Array.isArray(preset.panelIds)) throw new TypeError("layout preset panelIds 必须是数组");
  const panelIds = preset.panelIds.map((panelId) =>
    assertStableIdentifier(panelId, "layout preset panel id"),
  );
  assertNoDuplicates(panelIds, "layout preset panel id");
  return Object.freeze({
    id: assertStableIdentifier(preset.id, "layout preset id"),
    label: assertLabel(preset.label, "layout preset label"),
    order: assertOrder(preset.order),
    panelIds: Object.freeze(panelIds),
  });
}

function normalizePage(page: WorkbenchPageContribution): WorkbenchPageContribution {
  return Object.freeze({
    id: assertStableIdentifier(page.id, "workbench page id"),
    label: assertLabel(page.label, "workbench page label"),
    groupId: assertStableIdentifier(page.groupId, "workbench page group id"),
    order: assertOrder(page.order),
  });
}

function normalizeCommand(command: CommandContribution): CommandContribution {
  return Object.freeze({
    id: assertStableIdentifier(command.id, "command id"),
    label: assertLabel(command.label, "command label"),
    order: assertOrder(command.order),
  });
}

function normalizeAlgorithmElement(
  element: AlgorithmElementDefinition,
): AlgorithmElementDefinition {
  return Object.freeze({
    type: assertStableIdentifier(element.type, "algorithm element type"),
    version: assertVersion(element.version, "algorithm element version"),
    label: assertLabel(element.label, "algorithm element label"),
    category: assertStableIdentifier(element.category, "algorithm element category"),
  });
}

function claim(
  identifiers: Set<string>,
  kind: WorkbenchRegistryConflictKind,
  identifier: string,
): void {
  if (identifiers.has(identifier)) {
    throw new WorkbenchRegistryConflictError(kind, identifier);
  }
  identifiers.add(identifier);
}

function assertStableIdentifier(value: string, field: string): string {
  if (typeof value !== "string" || !STABLE_IDENTIFIER_PATTERN.test(value)) {
    throw new TypeError(`${field} 必须是稳定的小写标识符，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

function assertVersion(value: string, field: string): string {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new TypeError(`${field} 必须是语义化版本，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

function assertLabel(value: string, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${field} 必须是非空且无首尾空白的文本`);
  }
  return value;
}

function assertOrder(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`contribution order 必须是安全整数，实际 ${String(value)}`);
  }
  return value;
}

function assertNoDuplicates(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) {
    throw new TypeError(`${field} 不得重复`);
  }
}

function sortedModules(modules: Iterable<WorkbenchModuleSnapshot>): WorkbenchModuleSnapshot[] {
  return [...modules].sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id, "en"),
  );
}

function compareOrderedContribution(
  left:
    | InspectorViewContribution
    | DockGroupContribution
    | DockMenuContribution
    | DockMenuBranchContribution
    | PanelContribution
    | LayoutPresetContribution
    | CommandContribution
    | RegisteredInspectorView
    | RegisteredDockGroup
    | RegisteredDockMenu
    | RegisteredPanel
    | RegisteredLayoutPreset
    | RegisteredCommand,
  right:
    | InspectorViewContribution
    | DockGroupContribution
    | DockMenuContribution
    | DockMenuBranchContribution
    | PanelContribution
    | LayoutPresetContribution
    | CommandContribution
    | RegisteredInspectorView
    | RegisteredDockGroup
    | RegisteredDockMenu
    | RegisteredPanel
    | RegisteredLayoutPreset
    | RegisteredCommand,
): number {
  return left.order - right.order || left.id.localeCompare(right.id, "en");
}

function comparePanelContributions(
  left: PanelContribution | RegisteredPanel,
  right: PanelContribution | RegisteredPanel,
): number {
  return (
    left.region.localeCompare(right.region, "en") ||
    left.order - right.order ||
    left.id.localeCompare(right.id, "en")
  );
}

function comparePageMetadata(
  left: WorkbenchPageContribution,
  right: WorkbenchPageContribution,
): number {
  return (
    left.groupId.localeCompare(right.groupId, "en") ||
    left.order - right.order ||
    left.id.localeCompare(right.id, "en")
  );
}

function comparePages(
  left: RegisteredWorkbenchPage,
  right: RegisteredWorkbenchPage,
  groupOrder: ReadonlyMap<string, number>,
): number {
  return (
    requireGroupOrder(groupOrder, left.groupId) - requireGroupOrder(groupOrder, right.groupId) ||
    left.groupId.localeCompare(right.groupId, "en") ||
    left.order - right.order ||
    left.id.localeCompare(right.id, "en")
  );
}

function requireGroupOrder(groupOrder: ReadonlyMap<string, number>, groupId: string): number {
  const order = groupOrder.get(groupId);
  if (order === undefined) throw new Error(`缺少 Dock 分组顺序：${groupId}`);
  return order;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
