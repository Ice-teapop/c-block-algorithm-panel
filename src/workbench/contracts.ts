/**
 * Static contribution contracts for the extensible workbench.
 *
 * These types deliberately describe discoverable capabilities only. They do
 * not carry executable plugin code, DOM nodes, Electron handles or an
 * algorithm graph representation.
 */

export interface WorkbenchModuleManifest {
  /** Stable, globally unique module identifier. */
  readonly id: string;
  /** Version of this module's public contribution contract. */
  readonly version: string;
  readonly label: string;
  /** Stable capability identifiers provided by this module. */
  readonly capabilities: readonly string[];
}

export interface InspectorViewContribution {
  /** Stable, globally unique inspector view identifier. */
  readonly id: string;
  readonly label: string;
  readonly order: number;
}

export interface DockGroupContribution {
  /** Stable, globally unique dock group identifier. */
  readonly id: string;
  readonly label: string;
  readonly order: number;
}

export interface DockMenuBranchContribution {
  /** Stable, globally unique branch identifier. */
  readonly id: string;
  readonly label: string;
  readonly actionId: string;
  readonly order: number;
}

export interface DockMenuContribution {
  /** Stable, globally unique root menu identifier. */
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly branches: readonly DockMenuBranchContribution[];
}

export type WorkbenchPanelRegion = "left" | "center" | "right" | "bottom" | "floating";

export interface PanelContribution {
  readonly id: string;
  readonly label: string;
  readonly region: WorkbenchPanelRegion;
  readonly order: number;
  readonly defaultVisible: boolean;
}

export interface LayoutPresetContribution {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly panelIds: readonly string[];
}

export interface WorkbenchPageContribution {
  /** Stable, globally unique workbench page identifier. */
  readonly id: string;
  readonly label: string;
  /** Identifier of a registered dock group. */
  readonly groupId: string;
  readonly order: number;
}

export interface CommandContribution {
  /** Stable, globally unique command identifier. */
  readonly id: string;
  readonly label: string;
  readonly order: number;
}

export interface AlgorithmElementDefinition {
  /** Stable, globally unique algorithm element type. */
  readonly type: string;
  /** Version of this element's descriptive contract. */
  readonly version: string;
  readonly label: string;
  readonly category: string;
}

export interface WorkbenchModuleDefinition {
  readonly manifest: WorkbenchModuleManifest;
  readonly inspectorViews?: readonly InspectorViewContribution[];
  readonly dockGroups?: readonly DockGroupContribution[];
  readonly dockMenus?: readonly DockMenuContribution[];
  readonly panels?: readonly PanelContribution[];
  readonly layoutPresets?: readonly LayoutPresetContribution[];
  readonly pages?: readonly WorkbenchPageContribution[];
  readonly commands?: readonly CommandContribution[];
  readonly algorithmElements?: readonly AlgorithmElementDefinition[];
}

export interface WorkbenchModuleSnapshot {
  readonly manifest: WorkbenchModuleManifest;
  readonly inspectorViews: readonly InspectorViewContribution[];
  readonly dockGroups: readonly DockGroupContribution[];
  readonly dockMenus: readonly DockMenuContribution[];
  readonly panels: readonly PanelContribution[];
  readonly layoutPresets: readonly LayoutPresetContribution[];
  readonly pages: readonly WorkbenchPageContribution[];
  readonly commands: readonly CommandContribution[];
  readonly algorithmElements: readonly AlgorithmElementDefinition[];
}

export interface RegisteredInspectorView extends InspectorViewContribution {
  readonly moduleId: string;
}

export interface RegisteredDockGroup extends DockGroupContribution {
  readonly moduleId: string;
}

export interface RegisteredDockMenu extends DockMenuContribution {
  readonly moduleId: string;
}

export interface RegisteredPanel extends PanelContribution {
  readonly moduleId: string;
}

export interface RegisteredLayoutPreset extends LayoutPresetContribution {
  readonly moduleId: string;
}

export interface RegisteredWorkbenchPage extends WorkbenchPageContribution {
  readonly moduleId: string;
}

export interface RegisteredCommand extends CommandContribution {
  readonly moduleId: string;
}

export interface RegisteredAlgorithmElement extends AlgorithmElementDefinition {
  readonly moduleId: string;
}

export interface WorkbenchRegistrySnapshot {
  readonly modules: readonly WorkbenchModuleSnapshot[];
  readonly inspectorViews: readonly RegisteredInspectorView[];
  readonly dockGroups: readonly RegisteredDockGroup[];
  readonly dockMenus: readonly RegisteredDockMenu[];
  readonly panels: readonly RegisteredPanel[];
  readonly layoutPresets: readonly RegisteredLayoutPreset[];
  readonly pages: readonly RegisteredWorkbenchPage[];
  readonly commands: readonly RegisteredCommand[];
  readonly algorithmElements: readonly RegisteredAlgorithmElement[];
  readonly capabilities: readonly string[];
}

export type WorkbenchRegistryConflictKind =
  | "module-id"
  | "inspector-view-id"
  | "dock-group-id"
  | "dock-menu-id"
  | "dock-menu-branch-id"
  | "panel-id"
  | "layout-preset-id"
  | "page-id"
  | "command-id"
  | "algorithm-element-type";
