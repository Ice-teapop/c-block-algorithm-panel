import type { Node } from "web-tree-sitter";
import {
  textRange,
  type Block,
  type SourceDoc,
  type SymbolRecord,
  type TextRange,
} from "../core/model.js";
import type {
  DefUseDisabledReasonCode,
  DefUseTrackingMode,
  DefUseVariable,
  DefUseVariableKind,
  DefUseVariableStorage,
  FunctionDefUse,
  FunctionCfg,
} from "./model.js";

/** @internal Constructed only inside analyzeProgramCst's borrowed CST scope. */
export interface FunctionVariableInput {
  readonly functionNode: Node;
  readonly cfg: FunctionCfg;
  readonly document: SourceDoc;
}

interface DeclarationClassification {
  readonly storage: DefUseVariableStorage;
  readonly trackable: boolean;
}

const DISABLED_REASON_ORDER: readonly DefUseDisabledReasonCode[] = Object.freeze([
  "cfg-partial",
  "invalid-function-cst",
  "parse-error",
  "preprocessor",
  "projection-issue",
  "parse-concern",
  "raw-block",
  "missing-function-projection",
]);

export function collectFunctionDefUse(input: FunctionVariableInput): FunctionDefUse {
  const sourceLength = input.document.source.length;
  const functionRange = checkedNodeRange(input.functionNode, sourceLength);
  assertMatchingFunction(input.cfg, functionRange);
  const identifierNodes = new Map(
    input.functionNode
      .descendantsOfType("identifier")
      .filter((node) => isUsableNode(node, sourceLength))
      .map((node) => [rangeKey(checkedNodeRange(node, sourceLength)), node]),
  );
  const disabledReasons = collectDisabledReasons(input, functionRange);
  const status = disabledReasons.length === 0 ? "complete" : "disabled";
  const variables = input.document.symbols.symbols
    .filter(
      (symbol) =>
        (symbol.kind === "parameter" || symbol.kind === "local-variable") &&
        symbol.declarationRanges.some((range) => containsRange(functionRange, range)),
    )
    .map((symbol) =>
      buildVariable(symbol, functionRange, identifierNodes, input.document, status === "complete"),
    )
    .sort(
      (left, right) =>
        (left.declarationRanges[0]?.from ?? Number.POSITIVE_INFINITY) -
          (right.declarationRanges[0]?.from ?? Number.POSITIVE_INFINITY) ||
        left.name.localeCompare(right.name),
    );
  return Object.freeze({
    functionId: input.cfg.id,
    functionRange,
    status,
    disabledReasons,
    variables: Object.freeze(variables),
  });
}

function buildVariable(
  symbol: SymbolRecord,
  functionRange: TextRange,
  declarationNodes: ReadonlyMap<string, Node>,
  document: SourceDoc,
  functionIsTrackable: boolean,
): DefUseVariable {
  const declarationRanges = symbol.declarationRanges
    .filter((range) => containsRange(functionRange, range))
    .sort((left, right) => left.from - right.from || left.to - right.to);
  const first = declarationRanges[0];
  if (first === undefined) throw new Error("函数变量缺少声明 range");
  const classifications = declarationRanges.map((range) =>
    classifyStorage(declarationNodes.get(rangeKey(range))),
  );
  const storage = classifications.every(
    (candidate) => candidate.storage === classifications[0]?.storage,
  )
    ? (classifications[0]?.storage ?? "unknown")
    : "unknown";
  const occurrences = document.symbols.occurrences.filter(
    (occurrence) => occurrence.symbolId === symbol.id,
  );
  const bindingIsLocal = occurrences.every(
    (occurrence) =>
      occurrence.resolution === "local" && containsRange(functionRange, occurrence.range),
  );
  const declarationIsTrackable =
    functionIsTrackable &&
    declarationRanges.length === 1 &&
    classifications.every((classification) => classification.trackable) &&
    bindingIsLocal;
  const kind: DefUseVariableKind = symbol.kind === "parameter" ? "parameter" : "local";
  return Object.freeze({
    id: `variable:${kind}:${first.from}:${first.to}`,
    name: symbol.name,
    kind,
    storage,
    tracking: trackingMode(storage, symbol.confidence, declarationIsTrackable),
    declarationRanges: Object.freeze(declarationRanges),
    confidence: symbol.confidence,
  });
}

function classifyStorage(nameNode: Node | undefined): DeclarationClassification {
  if (nameNode === undefined) return Object.freeze({ storage: "unknown", trackable: false });
  let current = nameNode.parent;
  let sawArray = false;
  let sawPointer = false;
  let sawFunction = false;
  while (current !== null) {
    sawArray ||= current.type === "array_declarator";
    sawPointer ||= current.type === "pointer_declarator";
    sawFunction ||= current.type === "function_declarator";
    if (current.type === "parameter_declaration" || current.type === "declaration") {
      const baseStorage = storageFromType(current.childForFieldName("type"));
      const storage =
        sawFunction || (sawArray && sawPointer)
          ? "unknown"
          : sawArray
            ? baseStorage === "scalar"
              ? "array"
              : "unknown"
            : sawPointer
              ? "pointer"
              : baseStorage;
      return Object.freeze({ storage, trackable: declarationSyntaxIsTrackable(current) });
    }
    if (current.type === "function_definition") break;
    current = current.parent;
  }
  return Object.freeze({ storage: "unknown", trackable: false });
}

function collectDisabledReasons(
  input: FunctionVariableInput,
  functionRange: TextRange,
): readonly DefUseDisabledReasonCode[] {
  const reasons = new Set<DefUseDisabledReasonCode>();
  if (input.cfg.partial) reasons.add("cfg-partial");
  if (input.functionNode.type !== "function_definition") reasons.add("invalid-function-cst");
  if (
    input.functionNode.isError ||
    input.functionNode.hasError ||
    input.functionNode.descendantsOfType("ERROR").length > 0 ||
    input.document.parse.errorRanges.some((range) => rangesOverlap(functionRange, range)) ||
    input.document.parse.missingOffsets.some(
      (offset) => offset >= functionRange.from && offset <= functionRange.to,
    )
  ) {
    reasons.add("parse-error");
  }
  if (hasPreprocessorNode(input.functionNode)) reasons.add("preprocessor");
  if (input.document.issues.some((issue) => rangesOverlap(functionRange, issue.range))) {
    reasons.add("projection-issue");
  }
  if (
    input.document.concerns.some(
      (concern) =>
        rangesOverlap(functionRange, concern.blockRange) ||
        rangesOverlap(functionRange, concern.evidenceRange),
    )
  ) {
    reasons.add("parse-concern");
  }
  const functionBlock = findFunctionBlock(input.document.blocks, functionRange);
  if (functionBlock === null) {
    reasons.add("missing-function-projection");
  } else {
    collectBlockDisabledReasons(functionBlock, reasons);
  }
  return Object.freeze(DISABLED_REASON_ORDER.filter((reason) => reasons.has(reason)));
}

function hasPreprocessorNode(node: Node): boolean {
  return node.namedChildren.some(
    (child) => child.type.startsWith("preproc_") || hasPreprocessorNode(child),
  );
}

function findFunctionBlock(blocks: readonly Block[], range: TextRange): Block | null {
  for (const block of blocks) {
    if (
      block.kind === "syntax" &&
      block.role === "function" &&
      rangeKey(block.range) === rangeKey(range)
    ) {
      return block;
    }
    const nested = findFunctionBlock(block.children, range);
    if (nested !== null) return nested;
  }
  return null;
}

function collectBlockDisabledReasons(block: Block, reasons: Set<DefUseDisabledReasonCode>): void {
  if (block.kind === "raw") reasons.add("raw-block");
  if (block.kind === "syntax" && block.role === "preprocessor") reasons.add("preprocessor");
  block.children.forEach((child) => collectBlockDisabledReasons(child, reasons));
}

function assertMatchingFunction(cfg: FunctionCfg, range: TextRange): void {
  if (rangeKey(cfg.range) !== rangeKey(range)) {
    throw new TypeError("def-use functionNode 与 CFG 不属于同一函数");
  }
}

function declarationSyntaxIsTrackable(owner: Node): boolean {
  const disallowedQualifier = owner
    .descendantsOfType("type_qualifier")
    .some((qualifier) => qualifier.text === "volatile" || qualifier.text === "_Atomic");
  const disallowedStorage = owner
    .descendantsOfType("storage_class_specifier")
    .some((specifier) => specifier.text !== "auto" && specifier.text !== "register");
  const type = owner.childForFieldName("type");
  const atomicType =
    type?.type.includes("atomic") === true || type?.text.startsWith("_Atomic") === true;
  return !disallowedQualifier && !disallowedStorage && !atomicType;
}

function storageFromType(typeNode: Node | null): DefUseVariableStorage {
  if (typeNode === null) return "unknown";
  if (typeNode.type === "primitive_type" && typeNode.text === "void") return "unknown";
  if (typeNode.type === "struct_specifier" || typeNode.type === "union_specifier") {
    return "aggregate";
  }
  if (typeNode.type === "type_identifier") return "unknown";
  if (
    typeNode.type === "primitive_type" ||
    typeNode.type === "sized_type_specifier" ||
    typeNode.type === "enum_specifier"
  ) {
    return "scalar";
  }
  return "unknown";
}

function trackingMode(
  storage: DefUseVariableStorage,
  confidence: SymbolRecord["confidence"],
  declarationIsTrackable: boolean,
): DefUseTrackingMode {
  if (confidence !== "certain" || !declarationIsTrackable) return "untracked";
  if (storage === "scalar") return "precise";
  if (storage === "array") return "weak";
  return "untracked";
}

function checkedNodeRange(node: Node, sourceLength: number): TextRange {
  if (!isUsableNode(node, sourceLength)) {
    throw new RangeError(`def-use 节点 range 非法：[${node.startIndex}, ${node.endIndex})`);
  }
  return textRange(node.startIndex, node.endIndex);
}

function isUsableNode(node: Node, sourceLength: number): boolean {
  return (
    !node.isMissing &&
    Number.isSafeInteger(node.startIndex) &&
    Number.isSafeInteger(node.endIndex) &&
    node.startIndex >= 0 &&
    node.endIndex > node.startIndex &&
    node.endIndex <= sourceLength
  );
}

function containsRange(parent: TextRange, child: TextRange): boolean {
  return child.from >= parent.from && child.to <= parent.to;
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.from < right.to && right.from < left.to;
}

function rangeKey(range: TextRange): string {
  return `${range.from}:${range.to}`;
}
