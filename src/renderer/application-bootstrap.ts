import {
  loadLearningCatalogStorage,
  type LoadedLearningCatalogStorage,
} from "../app/learning-catalog-disk-storage.js";
import { createLearningSurface, type LearningSurface } from "../app/learning-surface.js";
import type { SourceImportController } from "../app/source-import-controller.js";
import type { StructureEditController } from "../app/structure-edit-controller.js";
import type { WorkspaceController } from "../app/workspace-controller.js";
import type { CAnalysisSnapshot, CParser } from "../core/index.js";
import type { FoaLessonDefinition } from "../tutorials/foa-curriculum.js";
import type { PanelApi } from "../shared/api.js";
import type { BlockTree } from "../ui/block-tree.js";
import type { StartupLoader } from "../ui/startup-loader.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";
import { createBrowserCParser } from "./c-parser.js";

export interface ApplicationBootstrapOptions {
  readonly elements: WorkbenchElements;
  readonly startupLoader: StartupLoader;
  readonly api: PanelApi;
  readonly blockTree: BlockTree;
  readonly structureEdits: StructureEditController;
  readonly sourceImport: SourceImportController;
  readonly workspace: Pick<WorkspaceController, "initialize">;
  readonly getAnalysis: () => CAnalysisSnapshot | null;
  readonly isDestroyed: () => boolean;
  readonly onStartGuidedLesson: () => void;
  readonly onOpenFoaWorkspace: (lesson: FoaLessonDefinition) => void;
  readonly onReady: (
    parser: CParser,
    learningSurface: LearningSurface,
    catalogStorage: LoadedLearningCatalogStorage,
  ) => void;
  readonly onLearningError: (error: Error) => void;
}

export async function initializeWorkbenchApplication(
  options: ApplicationBootstrapOptions,
): Promise<void> {
  const { elements, startupLoader, sourceImport } = options;
  const localized = (zh: string, en: string): string =>
    elements.shell.dataset.locale === "en" ? en : zh;
  const parserReadyCopy = Object.freeze({
    zh: "C 解析器已加载 · 等待打开工作区条目",
    en: "C parser loaded · waiting for a workspace entry",
  });
  const importReadyCopy = Object.freeze({
    zh: "可新建本地条目，或打开、拖入、粘贴现有 .c 文件。",
    en: "Create a local entry, or open, drop, or paste an existing .c file.",
  });
  let parser: CParser | null = null;
  let catalogStorage: LoadedLearningCatalogStorage | null = null;
  try {
    startupLoader.advance("parser");
    parser = await createBrowserCParser();
    if (options.isDestroyed()) return;
    catalogStorage = await loadLearningCatalogStorage(options.api, {
      onStatus: (status) => {
        elements.importStatus.dataset.catalogState = status.state;
      },
    });
    if (options.isDestroyed()) return;
    const readyParser = parser;
    const learningSurface = createLearningSurface({
      elements,
      blockTree: options.blockTree,
      structureEdits: options.structureEdits,
      getAnalysis: options.getAnalysis,
      getAnalyzer: () => readyParser,
      storage: catalogStorage.storage,
      traceApi: options.api,
      onStartGuidedLesson: options.onStartGuidedLesson,
      onOpenFoaWorkspace: options.onOpenFoaWorkspace,
      onError: options.onLearningError,
    });
    options.onReady(readyParser, learningSurface, catalogStorage);
    parser = null;
    catalogStorage = null;
    startupLoader.advance("parser-ready");
    sourceImport.setEnabled(true);
    startupLoader.advance("source");
    elements.parserStatus.textContent = localized(parserReadyCopy.zh, parserReadyCopy.en);
    elements.parserStatus.dataset.state = "ready";
    await options.workspace.initialize();
    if (options.isDestroyed()) return;
    sourceImport.setStatus(localized(importReadyCopy.zh, importReadyCopy.en), "ready");
    const onLocaleChange = (): void => {
      if (
        elements.parserStatus.textContent === parserReadyCopy.zh ||
        elements.parserStatus.textContent === parserReadyCopy.en
      ) {
        elements.parserStatus.textContent = localized(parserReadyCopy.zh, parserReadyCopy.en);
      }
      if (
        elements.importStatus.textContent === importReadyCopy.zh ||
        elements.importStatus.textContent === importReadyCopy.en
      ) {
        sourceImport.setStatus(localized(importReadyCopy.zh, importReadyCopy.en), "ready");
      }
    };
    elements.shell.addEventListener("workbench-locale-change", onLocaleChange, { once: false });
    startupLoader.complete();
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : localized("未知错误", "unknown error");
    startupLoader.fail(localized(`启动失败：${detail}`, `Startup failed: ${detail}`));
    elements.parserStatus.textContent = localized(
      `C 解析器不可用：${detail}`,
      `C parser unavailable: ${detail}`,
    );
    elements.parserStatus.dataset.state = "error";
    sourceImport.setStatus(
      localized(
        "解析器初始化失败，源码工作台已停用。",
        "Parser initialization failed; the source workbench is disabled.",
      ),
      "error",
    );
  } finally {
    parser?.dispose();
    catalogStorage?.destroy();
  }
}
