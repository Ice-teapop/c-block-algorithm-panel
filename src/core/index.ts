export { assertSourceDocInvariants, nonTriviaGaps, rebuildFromCoverage } from "./invariants.js";
export { blockToRange, createBlockIndex, offsetToBlock } from "./block-index.js";
export type { BlockIndex, BlockIndexEntry } from "./block-index.js";
export type {
  Block,
  BlockShape,
  CommentAttachment,
  CommentNode,
  CommentRelation,
  CommentShape,
  ParseSummary,
  ParseConcern,
  ParseConcernCode,
  ProjectionIssue,
  ProjectionShape,
  RawBlock,
  RawReason,
  SourceDoc,
  SymbolKind,
  SymbolOccurrence,
  SymbolRecord,
  SymbolSnapshot,
  SyntaxAnchor,
  SyntaxBlock,
  TextRange,
  Utf16Offset,
} from "./model.js";
export { textRange, utf16Offset } from "./model.js";
export { CParser, type CParserAssets } from "./parser.js";
export { projectCst } from "./projector.js";
export { projectStatementBlocks } from "./statement-projector.js";
export type { StatementProjectionFacts } from "./statement-projector.js";
export { projectionShape, renderSourceDoc } from "./render.js";
export { projectSymbols, rangesForSymbol, symbolAt } from "./symbols.js";
export type { SymbolProjection } from "./symbols.js";
export {
  BUILTIN_FUNCTIONS,
  BUILTIN_OBJECT_MACROS,
  BUILTIN_TYPEDEFS,
  findBuiltinFunction,
  findBuiltinObjectMacro,
  findBuiltinTypedef,
} from "./builtins.js";
