export { applyEditPlan, applyTextPatches, createEditPlan, createTextPatch } from "./patch.js";
export type { EditApplication, EditDiff, EditPlan, TextPatch } from "./model.js";
export {
  planStructuredEdit,
  StructuredEditError,
  type BinaryOperatorEditRequest,
  type ForFieldsEditRequest,
  type IfConditionEditRequest,
  type LiteralEditRequest,
  type StructuredEditAnalyzer,
  type StructuredEditContext,
  type StructuredEditErrorCode,
  type StructuredEditPlan,
  type StructuredEditRequest,
} from "./engine.js";
export {
  BINARY_OPERATORS,
  BINARY_OPERATOR_PRECEDENCE,
  planBinaryOperatorPatches,
  precedence,
  type BinaryOperator,
} from "./operators.js";
export {
  extractEditTargets,
  type BinaryExpressionEditTarget,
  type EditTarget,
  type EditTargetSnapshot,
  type ForStatementEditTarget,
  type IfStatementEditTarget,
  type LiteralEditTarget,
  type LiteralKind,
} from "./targets.js";
