import { fingerprintSource } from "../../../src/shared/source-snapshot.js";
import type { TraceUnsupportedReason } from "../../../src/shared/trace.js";

export interface TraceInstrumentation {
  readonly source: string;
  readonly protocolNonce: string;
  readonly instrumentedLines: readonly number[];
}

export type TraceInstrumentationResult =
  | { readonly ok: true; readonly value: TraceInstrumentation }
  | { readonly ok: false; readonly reason: TraceUnsupportedReason };

const FUNCTION_HEADER_PATTERN =
  /^\s*[A-Za-z_][A-Za-z0-9_\s*]*\b[A-Za-z_][A-Za-z0-9_]*\s*\([^;{}]*\)\s*\{\s*$/u;
const CONDITIONAL_PREFIX_PATTERN = /^\s*(?:else\s+)?(?:if|while)\s*\(/u;
const FOR_PREFIX_PATTERN = /^\s*for\s*\(/u;
const SWITCH_PATTERN = /\bswitch\s*\(/u;
const SWITCH_PREFIX_PATTERN = /^\s*switch\s*\(/u;
const CASE_PREFIX_PATTERN = /^\s*(?:case\b|default\b)/u;
const CASE_LABEL_PATTERN = /^\s*(?:case\b[^:]*|default)\s*:\s*$/u;
const PREPROCESSOR_CONTROL_PATTERN = /^\s*#\s*(?:if|ifdef|ifndef|elif|else|endif)\b/u;

interface SwitchContext {
  readonly lineNumber: number;
  readonly bodyDepth: number;
  defaultLine: number | null;
}

/**
 * Builds an in-memory shadow translation unit for a deliberately conservative C subset.
 * Unsupported layout is rejected instead of being rewritten heuristically.
 */
export function instrumentTraceSource(
  source: string,
  sourceFingerprint: string,
  sourceName: string,
  protocolNonce: string,
): TraceInstrumentationResult {
  if (fingerprintSource(source) !== sourceFingerprint) {
    return unsupported(
      "source-fingerprint-mismatch",
      null,
      "源码指纹与请求正文不一致；拒绝为过期源码生成轨迹。",
    );
  }
  if (!/^[A-Za-z0-9]{16,64}$/u.test(protocolNonce)) {
    throw new TypeError("Trace protocol nonce 必须是 16 到 64 位字母数字串");
  }

  const lines = source.split(/\r?\n/u);
  const maskedResult = maskSourceLines(lines);
  if (!maskedResult.ok) return maskedResult;
  const maskedLines = maskedResult.lines;
  const helper = `cb_trace_${protocolNonce}`;
  const branchHelper = `${helper}_branch`;
  const output: string[] = [
    traceRuntime(helper, branchHelper, protocolNonce),
    `#line 1 "${sourceName}"`,
  ];
  const instrumentedLines: number[] = [];
  let braceDepth = 0;
  let functionDepth: number | null = null;
  const switchStack: SwitchContext[] = [];

  for (const [index, originalLine] of lines.entries()) {
    const lineNumber = index + 1;
    const masked = maskedLines[index] ?? "";
    const trimmed = masked.trim();
    if (PREPROCESSOR_CONTROL_PATTERN.test(masked)) {
      return unsupported(
        "preprocessor-control",
        lineNumber,
        "首版 Trace 不改写条件预处理分支；请先展开或移除 #if 系列指令。",
      );
    }
    if (/\\\s*$/u.test(masked)) {
      return unsupported("line-continuation", lineNumber, "首版 Trace 不改写反斜杠续行。");
    }

    const opens = countCharacter(masked, "{");
    const closes = countCharacter(masked, "}");
    if (functionDepth === null && braceDepth === 0 && opens > 0) {
      if (FUNCTION_HEADER_PATTERN.test(masked) && opens === 1 && closes === 0) {
        functionDepth = 1;
        braceDepth = 1;
        output.push(originalLine, traceCall(helper, lineNumber, indentation(originalLine, 2)));
        instrumentedLines.push(lineNumber);
        continue;
      }
      output.push(originalLine);
      braceDepth += opens - closes;
      if (braceDepth < 0) {
        return unsupported("unbalanced-braces", lineNumber, "源码花括号不平衡。 ");
      }
      continue;
    }

    if (functionDepth === null) {
      output.push(originalLine);
      braceDepth += opens - closes;
      if (braceDepth < 0) {
        return unsupported("unbalanced-braces", lineNumber, "源码花括号不平衡。 ");
      }
      continue;
    }

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      output.push(originalLine);
    } else if (/^\s*\}\s*$/u.test(masked)) {
      output.push(originalLine);
    } else if (/^\s*\}\s*else\b/u.test(masked)) {
      return unsupported(
        "unsupported-control-layout",
        lineNumber,
        "请把结束花括号与 else 分成两行后再运行 Trace。",
      );
    } else if (SWITCH_PREFIX_PATTERN.test(masked)) {
      const rewritten = rewriteSwitch(originalLine, masked, lineNumber, helper);
      if (rewritten === null) {
        return unsupported(
          "unsupported-switch",
          lineNumber,
          "switch 必须在单行写完表达式并使用独立花括号块。",
        );
      }
      switchStack.push({ lineNumber, bodyDepth: braceDepth + 1, defaultLine: null });
      output.push(rewritten);
      instrumentedLines.push(lineNumber);
    } else if (SWITCH_PATTERN.test(masked)) {
      return unsupported(
        "unsupported-switch",
        lineNumber,
        "switch 必须独占控制行；嵌入其他语句的布局不会被猜测性改写。",
      );
    } else if (CONDITIONAL_PREFIX_PATTERN.test(masked)) {
      const rewritten = rewriteConditional(originalLine, masked, lineNumber, branchHelper);
      if (rewritten === null) {
        return unsupported(
          "unsupported-control-layout",
          lineNumber,
          "if/else if/while 必须在单行写完条件并使用独立花括号块。",
        );
      }
      output.push(rewritten);
      instrumentedLines.push(lineNumber);
    } else if (/^\s*else\s*\{\s*$/u.test(masked) || /^\s*do\s*\{\s*$/u.test(masked)) {
      output.push(originalLine, traceCall(helper, lineNumber, indentation(originalLine, 2)));
      instrumentedLines.push(lineNumber);
    } else if (FOR_PREFIX_PATTERN.test(masked)) {
      const rewritten = rewriteFor(originalLine, masked, lineNumber, branchHelper);
      if (rewritten === null) {
        return unsupported(
          "unsupported-control-layout",
          lineNumber,
          "for 必须在单行写完三个头部字段并使用独立花括号块。",
        );
      }
      output.push(rewritten);
      instrumentedLines.push(lineNumber);
    } else if (CASE_PREFIX_PATTERN.test(masked)) {
      if (!CASE_LABEL_PATTERN.test(masked) || masked.includes("...")) {
        return unsupported(
          "unsupported-switch",
          lineNumber,
          "case/default 必须独占一行；范围标签和含额外冒号的标签不安全。",
        );
      }
      const context = switchStack.at(-1);
      if (context === undefined || context.bodyDepth !== braceDepth) {
        return unsupported(
          "unsupported-switch",
          lineNumber,
          "case/default 必须直接属于当前 switch；嵌套块中的 Duff-style 标签不支持 Trace。",
        );
      }
      if (/^\s*default\b/u.test(masked)) {
        if (context.defaultLine !== null) {
          return unsupported(
            "unsupported-switch",
            lineNumber,
            "同一 switch 出现多个 default；拒绝生成有歧义的轨迹。",
          );
        }
        context.defaultLine = lineNumber;
      }
      output.push(originalLine, traceCall(helper, lineNumber, indentation(originalLine, 2)));
      instrumentedLines.push(lineNumber);
    } else if (/^\s*\{\s*$/u.test(masked)) {
      output.push(originalLine);
    } else if (opens !== 0 || closes !== 0) {
      return unsupported(
        "unsupported-statement-layout",
        lineNumber,
        "首版 Trace 要求语句与花括号分行，避免改变 C 语义。",
      );
    } else if (masked.trimEnd().endsWith(";")) {
      if (countCharacter(masked, ";") !== 1) {
        return unsupported(
          "unsupported-statement-layout",
          lineNumber,
          "首版 Trace 每行只接受一条完整 C 语句。",
        );
      }
      output.push(traceCall(helper, lineNumber, indentation(originalLine)), originalLine);
      instrumentedLines.push(lineNumber);
    } else {
      return unsupported(
        "unsupported-statement-layout",
        lineNumber,
        "检测到跨行或无法可靠定位的 C 语句；未生成猜测性轨迹。",
      );
    }

    braceDepth += opens - closes;
    if (braceDepth < 0) {
      return unsupported("unbalanced-braces", lineNumber, "源码花括号不平衡。 ");
    }
    while ((switchStack.at(-1)?.bodyDepth ?? -1) > braceDepth) {
      const completed = switchStack.pop();
      if (completed !== undefined && completed.defaultLine === null) {
        return unsupported(
          "unsupported-switch",
          completed.lineNumber,
          "无 default 的 switch 可能走隐式 miss 路径；当前 Trace 无法完整证明该分支。",
        );
      }
    }
    if (braceDepth === 0) functionDepth = null;
    else functionDepth = braceDepth;
  }

  if (braceDepth !== 0 || functionDepth !== null) {
    return unsupported("unbalanced-braces", lines.length, "源码花括号不平衡。 ");
  }
  if (instrumentedLines.length === 0) {
    return unsupported(
      "no-instrumentable-function",
      null,
      "没有找到符合保守布局规则的 C 函数，未生成轨迹。",
    );
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      source: output.join("\n"),
      protocolNonce,
      instrumentedLines: Object.freeze(instrumentedLines),
    }),
  });
}

function rewriteSwitch(
  original: string,
  masked: string,
  line: number,
  helper: string,
): string | null {
  const open = masked.indexOf("(");
  if (open < 0) return null;
  const close = matchingParenthesis(masked, open);
  if (close < 0 || !/^\s*\{\s*$/u.test(masked.slice(close + 1))) return null;
  const maskedExpression = masked.slice(open + 1, close);
  if (/[{};]/u.test(maskedExpression)) return null;
  const expression = original.slice(open + 1, close);
  if (expression.trim().length === 0) return null;
  return `${original.slice(0, open)}((${helper}(${String(line)}), (${expression})))${original.slice(close + 1)}`;
}

export function traceProtocolPrefix(protocolNonce: string): string {
  return `\u001eCBT:${protocolNonce}:`;
}

function traceRuntime(helper: string, branchHelper: string, nonce: string): string {
  return [
    "#include <stdio.h>",
    "#include <stdlib.h>",
    `static unsigned long long ${helper}_sequence = 0;`,
    `static void ${helper}(unsigned int line) {`,
    `  unsigned long long sequence = ++${helper}_sequence;`,
    `  if (fprintf(stderr, "\\036CBT:${nonce}:%llu:L:%u\\n", sequence, line) < 0 || fflush(stderr) != 0) _Exit(125);`,
    "}",
    `static int ${branchHelper}(unsigned int line, int value) {`,
    `  unsigned long long sequence = ++${helper}_sequence;`,
    `  int truth = value != 0;`,
    `  if (fprintf(stderr, "\\036CBT:${nonce}:%llu:B:%u:%d\\n", sequence, line, truth) < 0 || fflush(stderr) != 0) _Exit(125);`,
    "  return truth;",
    "}",
  ].join("\n");
}

function traceCall(helper: string, line: number, prefix: string): string {
  return `${prefix}${helper}(${String(line)});`;
}

function rewriteConditional(
  original: string,
  masked: string,
  line: number,
  branchHelper: string,
): string | null {
  const open = masked.indexOf("(");
  if (open < 0) return null;
  const close = matchingParenthesis(masked, open);
  if (close < 0 || !/^\s*\{\s*$/u.test(masked.slice(close + 1))) return null;
  const condition = original.slice(open + 1, close);
  if (condition.trim().length === 0) return null;
  return `${original.slice(0, open)}(${branchHelper}(${String(line)}, !!(${condition})))${original.slice(close + 1)}`;
}

function rewriteFor(
  original: string,
  masked: string,
  line: number,
  branchHelper: string,
): string | null {
  const open = masked.indexOf("(");
  if (open < 0) return null;
  const close = matchingParenthesis(masked, open);
  if (close < 0 || !/^\s*\{\s*$/u.test(masked.slice(close + 1))) return null;

  const separators = topLevelForSeparators(masked, open, close);
  if (separators === null) return null;
  const [initializerEnd, conditionEnd] = separators;
  const condition = original.slice(initializerEnd + 1, conditionEnd);
  const tracedCondition =
    condition.trim().length === 0
      ? `${branchHelper}(${String(line)}, 1)`
      : `${branchHelper}(${String(line)}, !!(${condition}))`;
  return `${original.slice(0, initializerEnd + 1)}${tracedCondition}${original.slice(conditionEnd)}`;
}

function topLevelForSeparators(
  masked: string,
  open: number,
  close: number,
): readonly [number, number] | null {
  const separators: number[] = [];
  let parenthesisDepth = 1;
  let bracketDepth = 0;
  for (let index = open + 1; index < close; index += 1) {
    const character = masked[index];
    if (character === "(") parenthesisDepth += 1;
    else if (character === ")") parenthesisDepth -= 1;
    else if (character === "[") bracketDepth += 1;
    else if (character === "]") bracketDepth -= 1;
    else if (character === ";" && parenthesisDepth === 1 && bracketDepth === 0) {
      separators.push(index);
    }
    if (parenthesisDepth < 1 || bracketDepth < 0) return null;
  }
  if (parenthesisDepth !== 1 || bracketDepth !== 0 || separators.length !== 2) return null;
  return Object.freeze([separators[0] as number, separators[1] as number]);
}

function matchingParenthesis(value: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

type MaskResult =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly reason: TraceUnsupportedReason };

function maskSourceLines(lines: readonly string[]): MaskResult {
  const maskedLines: string[] = [];
  let inBlockComment = false;
  for (const [index, line] of lines.entries()) {
    let masked = "";
    let quote: '"' | "'" | null = null;
    let escaped = false;
    for (let cursor = 0; cursor < line.length; cursor += 1) {
      const character = line[cursor] ?? "";
      const next = line[cursor + 1] ?? "";
      if (inBlockComment) {
        masked += " ";
        if (character === "*" && next === "/") {
          masked += " ";
          cursor += 1;
          inBlockComment = false;
        }
        continue;
      }
      if (quote !== null) {
        masked += " ";
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === "/" && next === "*") {
        masked += "  ";
        cursor += 1;
        inBlockComment = true;
      } else if (character === "/" && next === "/") {
        masked += " ".repeat(line.length - cursor);
        break;
      } else if (character === '"' || character === "'") {
        masked += " ";
        quote = character;
      } else {
        masked += character;
      }
    }
    if (inBlockComment || quote !== null || escaped) {
      return unsupported(
        "multiline-lexeme",
        index + 1,
        "首版 Trace 不改写跨行注释、字符串或字符字面量。",
      );
    }
    maskedLines.push(masked);
  }
  return Object.freeze({ ok: true, lines: Object.freeze(maskedLines) });
}

function indentation(line: string, extra = 0): string {
  const base = /^\s*/u.exec(line)?.[0] ?? "";
  return `${base}${" ".repeat(extra)}`;
}

function countCharacter(value: string, character: string): number {
  let count = 0;
  for (const candidate of value) if (candidate === character) count += 1;
  return count;
}

function unsupported(
  code: TraceUnsupportedReason["code"],
  line: number | null,
  message: string,
): { readonly ok: false; readonly reason: TraceUnsupportedReason } {
  return Object.freeze({
    ok: false,
    reason: Object.freeze({ code, line, message: message.trim() }),
  });
}
