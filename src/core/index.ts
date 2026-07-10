export { assertSourceDocInvariants, nonTriviaGaps, rebuildFromCoverage } from "./invariants.js";
export type {
  Block,
  BlockShape,
  CommentAttachment,
  CommentNode,
  CommentRelation,
  CommentShape,
  ParseSummary,
  ProjectionIssue,
  ProjectionShape,
  RawBlock,
  RawReason,
  SourceDoc,
  SyntaxAnchor,
  SyntaxBlock,
  TextRange,
  Utf16Offset,
} from "./model.js";
export { textRange, utf16Offset } from "./model.js";
export { CParser, type CParserAssets } from "./parser.js";
export { projectCst } from "./projector.js";
export { projectionShape, renderSourceDoc } from "./render.js";
