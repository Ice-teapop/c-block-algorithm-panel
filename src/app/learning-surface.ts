import type { CAnalysisSnapshot } from "../core/index.js";
import {
  createLearningCatalog,
  type LearningCatalogStorage,
  type PresetBlockKind,
  type PresetBlockLifecycle,
  type PresetPortDefinition,
} from "../learning/index.js";
import {
  createBlockLibraryManager,
  type BlockLibraryManager,
} from "../ui/block-library-manager.js";
import {
  createBlockPalette,
  type BlockPalette,
  type BlockPaletteCategory,
} from "../ui/block-palette.js";
import type { AssemblyInsertIntent, BlockTree } from "../ui/block-tree.js";
import { createOnboardingTour } from "../ui/onboarding-tour.js";
import { createSoftwareLibrary, type SoftwareLibrary } from "../ui/software-library.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";
import { createAssemblyController, type AssemblyController } from "./assembly-controller.js";
import {
  validateLearningTemplateSource,
  type LearningTemplateAnalyzer,
} from "./learning-template-validator.js";
import type { StructureEditController } from "./structure-edit-controller.js";

export interface LearningSurfaceOptions {
  readonly elements: WorkbenchElements;
  readonly blockTree: BlockTree;
  readonly structureEdits: StructureEditController;
  readonly getAnalysis: () => CAnalysisSnapshot | null;
  readonly getAnalyzer: () => LearningTemplateAnalyzer | null;
  readonly storage?: LearningCatalogStorage | undefined;
  readonly onError: (error: Error) => void;
}

export interface LearningSurface {
  insert(intent: AssemblyInsertIntent): Promise<void>;
  resolvePreset(presetId: string): ResolvedLearningPreset | null;
  setSelectedInsertEnabled(enabled: boolean): void;
  startOnboardingIfNeeded(): void;
  destroy(): void;
}

export interface ResolvedLearningPreset {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly source: string | null;
  readonly blockKind: PresetBlockKind;
  readonly lifecycle: PresetBlockLifecycle;
  readonly ports: readonly PresetPortDefinition[];
}

export function createLearningSurface(options: LearningSurfaceOptions): LearningSurface {
  const storage = options.storage ?? browserStorage();
  const catalog = createLearningCatalog(storage === undefined ? {} : { storage });
  const assembly: AssemblyController = createAssemblyController({
    catalog,
    getAnalysis: options.getAnalysis,
    structureEdits: options.structureEdits,
    onError: options.onError,
  });
  let destroyed = false;

  const palette: BlockPalette = createBlockPalette(options.elements.blockPalette, catalog, {
    onTemplateDragStart: (templateId) => options.blockTree.setTemplateDrag(templateId),
    onTemplateDragEnd: () => options.blockTree.setTemplateDrag(null),
    onInsertSelected: (templateId) => {
      const target = options.blockTree.getSelectedEntry();
      if (target !== null) options.elements.showInspector("edit");
      void assembly.insertAfterSelected(templateId, target);
    },
  });

  const blockLibrary: BlockLibraryManager = createBlockLibraryManager(
    options.elements.getPageHost("block-library"),
    catalog,
    {
      validateSource(source) {
        const analyzer = options.getAnalyzer();
        if (analyzer === null) throw new Error("C 解析器尚未准备好");
        return validateLearningTemplateSource(analyzer, source);
      },
      confirmRetire(message) {
        return globalThis.confirm(message);
      },
      onCatalogChange() {
        palette.refresh();
      },
    },
  );

  let softwareLibrary: SoftwareLibrary | null = null;
  const onboarding = createOnboardingTour(options.elements.shell, {
    navigate: (pageId) => options.elements.showPage(pageId),
    getCurrentPage: () => options.elements.currentPage,
    prepareScene(scene) {
      if (scene.stepId === "library") softwareLibrary?.selectBranch("manual");
      options.elements.revealOnboardingStep(scene.stepId);
    },
    onClose: () => options.elements.finishOnboarding(),
  });
  softwareLibrary = createSoftwareLibrary(options.elements.getPageHost("software-library"), {
    onOpenFeature(pageId, targetId) {
      options.elements.showPage(pageId);
      globalThis.requestAnimationFrame(() => revealTourTarget(options.elements.shell, targetId));
    },
    onStartTour: () => onboarding.openFromLibrary(),
  });
  const onWorkbenchAction = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isRecord(detail) || typeof detail.branchId !== "string") {
      return;
    }
    if (detail.rootId === "library") softwareLibrary?.selectBranch(detail.branchId);
    else if (detail.rootId === "presets" && detail.branchId !== "custom-lifecycle") {
      palette.setCategory(detail.branchId as BlockPaletteCategory);
    }
  };
  options.elements.shell.addEventListener("workbench-action", onWorkbenchAction);
  const autoStartEnabled = globalThis.navigator?.webdriver !== true;

  return Object.freeze({
    insert(intent: AssemblyInsertIntent): Promise<void> {
      if (destroyed) return Promise.resolve();
      options.elements.showInspector("edit");
      return assembly.insert(intent);
    },
    setSelectedInsertEnabled(enabled: boolean): void {
      if (!destroyed) palette.setInsertEnabled(enabled);
    },
    resolvePreset(presetId: string) {
      if (destroyed) return null;
      const preset = catalog.getPreset(presetId);
      return preset === null
        ? null
        : Object.freeze({
            id: preset.id,
            version: preset.version,
            label: preset.label,
            source: preset.source,
            blockKind: preset.blockKind,
            lifecycle: preset.lifecycle,
            ports: Object.freeze(preset.ports.map((port) => Object.freeze({ ...port }))),
          });
    },
    startOnboardingIfNeeded(): void {
      if (!destroyed && autoStartEnabled) onboarding.startIfNeeded();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      options.elements.shell.removeEventListener("workbench-action", onWorkbenchAction);
      softwareLibrary?.destroy();
      softwareLibrary = null;
      onboarding.destroy();
      blockLibrary.destroy();
      palette.destroy();
      assembly.destroy();
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function revealTourTarget(root: HTMLElement, targetId: string): void {
  for (const target of root.querySelectorAll<HTMLElement>("[data-tour-target]")) {
    if (target.dataset.tourTarget !== targetId || target.hidden) continue;
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    return;
  }
}

function browserStorage(): LearningCatalogStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
