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
  readonly commands?: readonly CommandContribution[];
  readonly algorithmElements?: readonly AlgorithmElementDefinition[];
}

export interface WorkbenchModuleSnapshot {
  readonly manifest: WorkbenchModuleManifest;
  readonly inspectorViews: readonly InspectorViewContribution[];
  readonly commands: readonly CommandContribution[];
  readonly algorithmElements: readonly AlgorithmElementDefinition[];
}

export interface RegisteredInspectorView extends InspectorViewContribution {
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
  readonly commands: readonly RegisteredCommand[];
  readonly algorithmElements: readonly RegisteredAlgorithmElement[];
  readonly capabilities: readonly string[];
}

export type WorkbenchRegistryConflictKind =
  "module-id" | "inspector-view-id" | "command-id" | "algorithm-element-type";
