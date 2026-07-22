import { createBlockIndex, type BlockIndexEntry, type CAnalysisSnapshot } from "../core/index.js";
import type {
  LearningCatalog,
  PresetPlacementCondition,
  PresetSyntaxAncestorCapability,
  PresetSyntaxSlotKind,
} from "../learning/index.js";
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
  assertPlacementCompatible(entry.placement, analysis, intent.target);
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

function assertPlacementCompatible(
  placement: PresetPlacementCondition,
  analysis: CAnalysisSnapshot,
  target: BlockIndexEntry,
): void {
  const context = placementContext(analysis, target);
  if (context === null) return;
  if (!placement.acceptedSyntaxSlots.includes(context.slot)) {
    throw new Error("该积木不能放入当前 C 语句插槽");
  }
  if (
    placement.requiredAnyAncestorCapabilities.length > 0 &&
    !placement.requiredAnyAncestorCapabilities.some((capability) =>
      context.ancestors.has(capability),
    )
  ) {
    throw new Error("该积木需要位于匹配的循环或 switch 结构内");
  }
}

function placementContext(
  analysis: CAnalysisSnapshot,
  target: BlockIndexEntry,
): {
  readonly slot: PresetSyntaxSlotKind;
  readonly ancestors: ReadonlySet<PresetSyntaxAncestorCapability>;
} | null {
  const index = createBlockIndex(analysis.document);
  const current = index.entries.find(
    (candidate) =>
      candidate.block?.kind === "syntax" &&
      target.block?.kind === "syntax" &&
      candidate.block.nodeType === target.block.nodeType &&
      candidate.range.from === target.range.from &&
      candidate.range.to === target.range.to,
  );
  if (current === undefined) return null;
  const ancestors = new Set<PresetSyntaxAncestorCapability>();
  let parentIndex = current.parentIndex;
  let immediateParentType: string | null = null;
  while (parentIndex !== null) {
    const parent = index.entries[parentIndex];
    if (parent === undefined) break;
    if (parent.block?.kind === "syntax") {
      immediateParentType ??= parent.block.nodeType;
      if (isLoopNodeType(parent.block.nodeType)) ancestors.add("loop");
      if (isSwitchNodeType(parent.block.nodeType)) ancestors.add("switch");
    }
    parentIndex = parent.parentIndex;
  }
  const slot = syntaxSlotForParent(immediateParentType);
  return slot === null ? null : Object.freeze({ slot, ancestors });
}

function syntaxSlotForParent(nodeType: string | null): PresetSyntaxSlotKind | null {
  if (nodeType === "function_definition") return "function-body";
  if (nodeType !== null && isLoopNodeType(nodeType)) return "loop-body";
  if (nodeType !== null && isSwitchNodeType(nodeType)) return "switch-case";
  if (nodeType === "if_statement" || nodeType === "compound_statement") {
    return "compound-body";
  }
  return null;
}

function isLoopNodeType(nodeType: string): boolean {
  return (
    nodeType === "for_statement" || nodeType === "while_statement" || nodeType === "do_statement"
  );
}

function isSwitchNodeType(nodeType: string): boolean {
  return nodeType === "switch_statement" || nodeType === "case_statement";
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
