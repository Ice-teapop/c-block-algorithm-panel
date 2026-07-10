import { assertInsertableStatementFragment, type CAnalysisSnapshot } from "../core/index.js";

export const MAX_LEARNING_TEMPLATE_SOURCE_LENGTH = 16 * 1024;

export interface LearningTemplateAnalyzer {
  analyze(source: string, revision: number): CAnalysisSnapshot;
}

export interface ValidatedLearningTemplateSource {
  readonly nodeType: string;
  readonly fragmentKind: "statement" | "control";
}

const CONTROL_NODE_TYPES = new Set([
  "do_statement",
  "for_statement",
  "if_statement",
  "switch_statement",
  "while_statement",
]);

/**
 * Validates a custom catalog fragment without granting it any write authority.
 * The real insertion still goes through the M3b exact-patch and full-reparse gate.
 */
export function validateLearningTemplateSource(
  analyzer: LearningTemplateAnalyzer,
  source: string,
): ValidatedLearningTemplateSource {
  if (typeof analyzer?.analyze !== "function") {
    throw new TypeError("自定义积木验证器缺少 C 分析能力");
  }
  if (typeof source !== "string" || source.length > MAX_LEARNING_TEMPLATE_SOURCE_LENGTH) {
    throw new TypeError(
      `自定义积木源码不得超过 ${String(MAX_LEARNING_TEMPLATE_SOURCE_LENGTH)} 个字符`,
    );
  }
  if (source.includes("\0")) throw new TypeError("自定义积木源码不能包含 NUL");
  assertInsertableStatementFragment(source);

  const adapted = source.split(/\r\n|\r|\n/u).join("\n  ");
  const prefix = "void c_block_template_probe(void) {\n  ";
  const wrapper = `${prefix}${adapted}\n}\n`;
  const bodyRange = Object.freeze({
    from: prefix.indexOf("{"),
    to: wrapper.lastIndexOf("}") + 1,
  });
  const analysis = analyzer.analyze(wrapper, 0);
  if (
    analysis.document.parse.hasError ||
    analysis.document.parse.errorRanges.length > 0 ||
    analysis.document.parse.missingOffsets.length > 0
  ) {
    throw new TypeError("自定义积木必须是可完整解析的 C 语句或控制结构");
  }

  const direct = analysis.statementEdits.statements.filter(
    (target) =>
      target.parentMode === "statement-list" &&
      target.parentNodeType === "compound_statement" &&
      target.parentRange.from === bodyRange.from &&
      target.parentRange.to === bodyRange.to,
  );
  const target = direct[0];
  if (
    direct.length !== 1 ||
    target === undefined ||
    target.blocker !== null ||
    wrapper.slice(target.range.from, target.range.to) !== adapted
  ) {
    throw new TypeError("自定义积木必须只包含一个顶层 C 语句或控制结构");
  }

  return Object.freeze({
    nodeType: target.nodeType,
    fragmentKind: CONTROL_NODE_TYPES.has(target.nodeType) ? "control" : "statement",
  });
}
