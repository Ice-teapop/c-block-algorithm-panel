import type { BlockIndexEntry, CAnalysisSnapshot } from "../core/index.js";
import type { LearningCatalog } from "../learning/index.js";
import type { AssemblyInsertIntent } from "../ui/block-tree.js";
import type { StructureEditRequest } from "../ui/structure-edit-panel.js";
import type { StructureEditController } from "./structure-edit-controller.js";
import { structureEditSelectionForBlock } from "./structure-edit-selection.js";

export interface AssemblyControllerOptions {
  readonly catalog: LearningCatalog;
  readonly getAnalysis: () => CAnalysisSnapshot | null;
  readonly structureEdits: StructureEditController;
  readonly onError: (error: Error) => void;
}

export interface AssemblyController {
  insert(intent: AssemblyInsertIntent): Promise<void>;
  insertAfterSelected(templateId: string, target: BlockIndexEntry | null): Promise<void>;
  destroy(): void;
}

export function buildAssemblyInsertRequest(
  catalog: LearningCatalog,
  analysis: CAnalysisSnapshot,
  intent: AssemblyInsertIntent,
): StructureEditRequest {
  const entry = catalog.getEntry(intent.templateId);
  if (entry === null || entry.kind !== "template") {
    throw new Error(`积木模板不存在：${intent.templateId}`);
  }
  if (entry.lifecycle !== "active" || !catalog.canInstantiate(entry.id)) {
    throw new Error(`积木模板当前不可用于新插入：${entry.label}`);
  }
  const selection = structureEditSelectionForBlock(analysis, intent.target);
  if (selection === null) {
    throw new Error("请把积木放到可编辑语句旁的明确插槽中");
  }
  const statement = selection?.statement;
  if (
    statement === undefined ||
    statement.parentMode !== "statement-list" ||
    statement.blocker !== null
  ) {
    throw new Error("请把积木放到可编辑语句旁的明确插槽中");
  }
  return Object.freeze({
    kind: "insert-statement",
    baseRevision: selection.revision,
    targetId: statement.id,
    expectedTargetText: statement.text,
    position: intent.position,
    statementText: entry.source,
  });
}

export function createAssemblyController(options: AssemblyControllerOptions): AssemblyController {
  if (
    typeof options?.catalog?.getEntry !== "function" ||
    typeof options.getAnalysis !== "function" ||
    typeof options.structureEdits?.run !== "function" ||
    typeof options.onError !== "function"
  ) {
    throw new TypeError("assembly controller options 不完整");
  }
  let destroyed = false;

  const insert = async (intent: AssemblyInsertIntent): Promise<void> => {
    try {
      assertActive(destroyed);
      const analysis = options.getAnalysis();
      if (analysis === null) throw new Error("C 解析器尚未准备好");
      await options.structureEdits.run(
        buildAssemblyInsertRequest(options.catalog, analysis, intent),
      );
    } catch (error: unknown) {
      if (!destroyed) options.onError(asError(error));
    }
  };

  return Object.freeze({
    insert,
    insertAfterSelected(templateId: string, target: BlockIndexEntry | null): Promise<void> {
      if (target === null) {
        options.onError(new Error("先在组装画布中选择一条语句，再点击插入"));
        return Promise.resolve();
      }
      return insert(Object.freeze({ templateId, target, position: "after" }));
    },
    destroy(): void {
      destroyed = true;
    },
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error("无法插入积木");
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("AssemblyController 已销毁");
}
