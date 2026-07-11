import type { FunctionCfg, LoopAvailability, LoopKind, LoopRegion } from "./model.js";

interface LoopDraft {
  readonly id: string;
  readonly kind: LoopKind;
  readonly range: LoopRegion["range"];
  readonly conditionNodeId: string;
  readonly entryNodeId: string;
  readonly initializerNodeId: string | null;
  readonly updateNodeId: string | null;
  readonly nodeIds: readonly string[];
  readonly availability: LoopAvailability;
}

export function collectLoopRegions(cfg: FunctionCfg): readonly LoopRegion[] {
  const drafts = cfg.nodes
    .filter(
      (node) =>
        node.nodeType === "while_statement" ||
        node.nodeType === "for_statement" ||
        node.nodeType === "do_condition",
    )
    .map((condition): LoopDraft => {
      const kind: LoopKind =
        condition.nodeType === "while_statement"
          ? "while"
          : condition.nodeType === "for_statement"
            ? "for"
            : "do-while";
      const range = kind === "do-while" ? condition.ownerBlockRange : condition.range;
      const initializer =
        kind === "for"
          ? (cfg.nodes.find(
              (node) =>
                node.nodeType === "for_initializer" && sameRange(node.ownerBlockRange, range),
            ) ?? null)
          : null;
      const update =
        kind === "for"
          ? (cfg.nodes.find(
              (node) => node.nodeType === "for_update" && sameRange(node.ownerBlockRange, range),
            ) ?? null)
          : null;
      const memberNodes = cfg.nodes.filter(
        (node) =>
          containsRange(range, node.range) &&
          !(node.nodeType === "for_initializer" && sameRange(node.ownerBlockRange, range)),
      );
      const memberIds = new Set(memberNodes.map((node) => node.id));
      const touchesGoto = cfg.edges.some(
        (edge) => edge.kind === "goto" && (memberIds.has(edge.from) || memberIds.has(edge.to)),
      );
      const doEntry =
        kind === "do-while"
          ? cfg.edges.find((edge) => edge.from === condition.id && edge.kind === "branch-true")?.to
          : undefined;
      const entryNodeId = doEntry ?? condition.id;
      const entryReachable = cfg.nodes.find((node) => node.id === entryNodeId)?.reachable ?? false;
      const availability: LoopAvailability = !entryReachable
        ? "unreachable"
        : touchesGoto
          ? "unsupported-control-flow"
          : "analyzable";
      return {
        id: `loop:${kind}:${String(range.from)}:${String(range.to)}`,
        kind,
        range,
        conditionNodeId: condition.id,
        entryNodeId,
        initializerNodeId: initializer?.id ?? null,
        updateNodeId: update?.id ?? null,
        nodeIds: Object.freeze(memberNodes.map((node) => node.id)),
        availability,
      };
    })
    .sort((left, right) => left.range.from - right.range.from || left.range.to - right.range.to);

  return Object.freeze(
    drafts.map((draft) => {
      const parent = drafts
        .filter(
          (candidate) =>
            candidate.id !== draft.id &&
            containsRange(candidate.range, draft.range) &&
            !sameRange(candidate.range, draft.range),
        )
        .sort(
          (left, right) =>
            rangeLength(left.range) - rangeLength(right.range) ||
            left.range.from - right.range.from,
        )[0];
      return Object.freeze({ ...draft, parentLoopId: parent?.id ?? null });
    }),
  );
}

function containsRange(parent: LoopRegion["range"], child: LoopRegion["range"]): boolean {
  return child.from >= parent.from && child.to <= parent.to;
}

function sameRange(left: LoopRegion["range"], right: LoopRegion["range"]): boolean {
  return left.from === right.from && left.to === right.to;
}

function rangeLength(range: LoopRegion["range"]): number {
  return range.to - range.from;
}
