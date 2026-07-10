declare const utf16OffsetBrand: unique symbol;

export type Utf16Offset = number & {
  readonly [utf16OffsetBrand]: "Utf16Offset";
};

export interface TextRange {
  readonly from: Utf16Offset;
  readonly to: Utf16Offset;
}

export type RawReason = "not-yet-structured" | "parse-error" | "unsupported-syntax";

interface BlockBase {
  readonly range: TextRange;
  readonly children: readonly Block[];
}

export interface SyntaxBlock extends BlockBase {
  readonly kind: "syntax";
  readonly role: "function" | "statement" | "declaration" | "preprocessor";
  readonly nodeType: string;
}

export interface RawBlock extends BlockBase {
  readonly kind: "raw";
  readonly reason: RawReason;
}

export type Block = SyntaxBlock | RawBlock;

export interface SyntaxAnchor {
  readonly nodeType: string;
  readonly range: TextRange;
}

export type CommentRelation = "leading" | "trailing" | "internal" | "detached";

export interface CommentAttachment {
  readonly relation: CommentRelation;
  readonly target: SyntaxAnchor | null;
  readonly movesWithTarget: boolean;
}

export interface CommentNode {
  readonly kind: "comment";
  readonly range: TextRange;
  readonly form: "line" | "block";
  readonly spansMultipleLines: boolean;
  readonly attachment: CommentAttachment;
}

export interface ParseSummary {
  readonly mode: "tree-sitter";
  readonly hasError: boolean;
  readonly errorRanges: readonly TextRange[];
  readonly missingOffsets: readonly Utf16Offset[];
}

export interface ProjectionIssue {
  readonly code: "parser-recovery" | "unsupported-function" | "non-trivia-gap";
  readonly range: TextRange;
  readonly message: string;
}

export type ParseConcernCode =
  "unknown-type-name" | "variable-used-as-type" | "typedef-used-as-call";

export interface ParseConcern {
  readonly code: ParseConcernCode;
  readonly confidence: "low";
  readonly blockRange: TextRange;
  readonly evidenceRange: TextRange;
  readonly message: string;
}

export type SymbolKind =
  | "parameter"
  | "local-variable"
  | "file-variable"
  | "enum-constant"
  | "function"
  | "typedef"
  | "object-macro"
  | "builtin-function"
  | "builtin-typedef"
  | "builtin-object-macro"
  | "unknown-external";

export interface SymbolRecord {
  /** Snapshot-local identity. It is intentionally unstable across reparses. */
  readonly id: string;
  readonly name: string;
  readonly kind: SymbolKind;
  readonly declarationRanges: readonly TextRange[];
  readonly confidence: "certain" | "low" | "unknown";
  readonly header?: string;
  readonly signatureText?: string;
  readonly valueText?: string;
  readonly description?: string;
}

export interface SymbolOccurrence {
  readonly symbolId: string;
  readonly range: TextRange;
  readonly role: "declaration" | "use";
  readonly resolution: "local" | "file" | "user-macro" | "builtin" | "unknown";
}

export interface SymbolSnapshot {
  readonly symbols: readonly SymbolRecord[];
  readonly occurrences: readonly SymbolOccurrence[];
}

export interface SourceDoc {
  readonly source: string;
  readonly range: TextRange;
  readonly blocks: readonly Block[];
  readonly comments: readonly CommentNode[];
  readonly parse: ParseSummary;
  readonly issues: readonly ProjectionIssue[];
  readonly concerns: readonly ParseConcern[];
  readonly symbols: SymbolSnapshot;
}

export interface BlockShape {
  readonly kind: Block["kind"];
  readonly range: readonly [number, number];
  readonly role?: SyntaxBlock["role"];
  readonly nodeType?: SyntaxBlock["nodeType"];
  readonly reason?: RawBlock["reason"];
  readonly children: readonly BlockShape[];
}

export interface CommentShape {
  readonly range: readonly [number, number];
  readonly form: CommentNode["form"];
  readonly spansMultipleLines: boolean;
  readonly relation: CommentRelation;
  readonly targetNodeType: string | null;
  readonly targetRange: readonly [number, number] | null;
  readonly movesWithTarget: boolean;
}

export interface ProjectionShape {
  readonly blocks: readonly BlockShape[];
  readonly comments: readonly CommentShape[];
  readonly hasError: boolean;
  readonly errorRanges: readonly (readonly [number, number])[];
  readonly missingOffsets: readonly number[];
}

export function utf16Offset(value: number): Utf16Offset {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`UTF-16 offset 必须是非负安全整数，实际 ${String(value)}`);
  }
  return value as Utf16Offset;
}

export function textRange(from: number, to: number): TextRange {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) {
    throw new RangeError(`range 必须是合法的 UTF-16 半开区间，实际 [${from}, ${to})`);
  }
  return Object.freeze({ from: utf16Offset(from), to: utf16Offset(to) });
}

export function syntaxAnchor(nodeType: string, range: TextRange): SyntaxAnchor {
  if (nodeType.length === 0) {
    throw new TypeError("syntax anchor 的 nodeType 不得为空");
  }
  return Object.freeze({ nodeType, range });
}
