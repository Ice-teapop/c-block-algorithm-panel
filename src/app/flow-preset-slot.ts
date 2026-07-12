import { applyTextPatches, createTextPatch, textRange, type TextPatch } from "../core/index.js";
import type { FlowProjection } from "../flow/index.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type { FlowCanvasDraftConnectionIntent } from "../ui/flow-canvas.js";

export interface FlowPresetSlotReplacement {
  readonly candidateSource: string;
  readonly patch: TextPatch;
  readonly targetNodeId: string;
}

/**
 * Resolves an explicit, compiling tutorial slot. Ordinary comments and empty statements are never
 * treated as slots: the marker must name the exact preset and the gesture must target its `;` node.
 */
export function planFlowPresetSlotReplacement(
  source: string,
  projection: FlowProjection,
  intent: FlowCanvasDraftConnectionIntent,
): FlowPresetSlotReplacement | null {
  if (intent.presetId === null || intent.sourceText === null) return null;
  const marker = `/* 补全任务 @preset-slot ${intent.presetId} */`;
  const markerStart = source.indexOf(marker);
  if (markerStart < 0) return null;
  if (source.indexOf(marker, markerStart + marker.length) >= 0) {
    throw new Error("同一预设存在多个补全插槽，拒绝歧义替换");
  }
  if (intent.sourceFingerprint !== fingerprintSource(source) || intent.edgeKind !== "next") {
    throw new Error("补全插槽连接不属于当前源码快照");
  }
  const lineStart = source.lastIndexOf("\n", markerStart - 1) + 1;
  const indent = source.slice(lineStart, markerStart);
  if (!/^[\t ]*$/u.test(indent)) throw new Error("补全插槽标记必须独占一行");
  const markerLineEnd = source.indexOf("\n", markerStart + marker.length);
  if (
    markerLineEnd < 0 ||
    source.slice(markerStart + marker.length, markerLineEnd).trim().length > 0
  ) {
    throw new Error("补全插槽标记行格式无效");
  }
  const placeholderFrom = markerLineEnd + 1;
  const placeholderLineEnd = source.indexOf("\n", placeholderFrom);
  const placeholderTo = placeholderLineEnd < 0 ? source.length : placeholderLineEnd;
  if (source.slice(placeholderFrom, placeholderTo).trim() !== ";") {
    throw new Error("补全插槽缺少可编译的空语句占位符");
  }
  const target = projection.nodes.find((node) => node.id === intent.toNodeId);
  if (
    target === undefined ||
    target.locked ||
    target.kind === "raw" ||
    target.sourceText.trim() !== ";" ||
    target.range.from < placeholderFrom ||
    target.range.to > placeholderTo ||
    !target.ports.some(
      (port) =>
        port.id === intent.toPortId &&
        port.direction === "input" &&
        port.channel === "control" &&
        port.editable,
    )
  ) {
    throw new Error("积木必须连接到对应补全插槽的控制输入端口");
  }
  const slotTo = placeholderLineEnd < 0 ? source.length : placeholderLineEnd + 1;
  const sourceText = intent.sourceText.trim();
  if (sourceText.length === 0 || sourceText.includes("\0")) {
    throw new Error("补全积木源码无效");
  }
  const replacement = `${sourceText
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n")}\n`;
  const patch = createTextPatch(textRange(lineStart, slotTo), replacement);
  return Object.freeze({
    candidateSource: applyTextPatches(source, [patch]).source,
    patch,
    targetNodeId: target.id,
  });
}
