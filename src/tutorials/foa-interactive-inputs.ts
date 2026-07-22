import type { FoaLocalizedText } from "./foa-contracts.js";
import { foaText } from "./foa-contracts.js";

export type FoaInteractiveInputGroup = "single" | "pair" | "sequence" | "special";

export type FoaInteractiveInputFieldKind = "integer" | "decimal" | "text" | "integer-sequence";

export interface FoaInteractiveInputField {
  readonly id: string;
  readonly kind: FoaInteractiveInputFieldKind;
  readonly label: FoaLocalizedText;
  readonly hint: FoaLocalizedText;
  readonly defaultValue: string;
}

export interface FoaInteractiveInputDefinition {
  readonly order: number;
  readonly group: FoaInteractiveInputGroup;
  readonly title: FoaLocalizedText;
  readonly description: FoaLocalizedText;
  readonly fields: readonly FoaInteractiveInputField[];
}

export interface FoaInteractiveRun {
  readonly order: number;
  readonly group: FoaInteractiveInputGroup;
  readonly stdin: string;
  readonly stdout: string;
  readonly summary: FoaLocalizedText;
  readonly eventDetails: readonly FoaLocalizedText[];
  readonly tokens: readonly string[];
  readonly outcome: "success" | "scan-failed" | "range-rejected";
  readonly exitStatus: 0 | 1;
}

export type FoaInteractiveInputResult =
  | { readonly ok: true; readonly run: FoaInteractiveRun }
  | {
      readonly ok: false;
      readonly fieldId: string;
      readonly message: FoaLocalizedText;
    };

const single = (
  order: number,
  kind: FoaInteractiveInputFieldKind,
  defaultValue: string,
  label: readonly [string, string],
  hint: readonly [string, string],
): FoaInteractiveInputDefinition =>
  definition(order, "single", [field("value", kind, defaultValue, label, hint)]);

const pair = (
  order: number,
  defaults: readonly [string, string],
  labels: readonly [readonly [string, string], readonly [string, string]],
  hints: readonly [readonly [string, string], readonly [string, string]],
): FoaInteractiveInputDefinition =>
  definition(order, "pair", [
    field("left", "integer", defaults[0], labels[0], hints[0]),
    field("right", "integer", defaults[1], labels[1], hints[1]),
  ]);

const sequence = (
  order: number,
  defaultValue: string,
  label: readonly [string, string],
  hint: readonly [string, string],
): FoaInteractiveInputDefinition =>
  definition(order, "sequence", [field("values", "integer-sequence", defaultValue, label, hint)]);

const countedSequence = (
  order: number,
  defaultCount: string,
  defaultValues: string,
  countHint: readonly [string, string],
  valuesHint: readonly [string, string],
): FoaInteractiveInputDefinition =>
  definition(order, "sequence", [
    field("count", "integer", defaultCount, ["元素数量", "Element count"], countHint),
    field("values", "integer-sequence", defaultValues, ["序列元素", "Sequence values"], valuesHint),
  ]);

const special = (
  order: number,
  kind: FoaInteractiveInputFieldKind,
  defaultValue: string,
  label: readonly [string, string],
  hint: readonly [string, string],
): FoaInteractiveInputDefinition =>
  definition(order, "special", [field("value", kind, defaultValue, label, hint)]);

const DEFINITIONS: Readonly<Record<number, FoaInteractiveInputDefinition>> = Object.freeze({
  9: special(
    9,
    "text",
    "41",
    ["输入 token", "Input token"],
    ["输入一个整数或故意输入无效文本。", "Enter an integer or deliberately try invalid text."],
  ),
  12: single(
    12,
    "decimal",
    "2",
    ["半径", "Radius"],
    ["有限且不小于 0。", "A finite value greater than or equal to 0."],
  ),
  13: pair(
    13,
    ["7", "3"],
    [
      ["被除数", "Numerator"],
      ["除数", "Denominator"],
    ],
    [
      ["32 位整数。", "A 32-bit integer."],
      ["不能为 0。", "Must not be zero."],
    ],
  ),
  14: pair(
    14,
    ["3", "8"],
    [
      ["左值", "Left value"],
      ["右值", "Right value"],
    ],
    [
      ["32 位整数。", "A 32-bit integer."],
      ["32 位整数。", "A 32-bit integer."],
    ],
  ),
  15: single(
    15,
    "integer",
    "10",
    ["待判断整数", "Integer to classify"],
    ["观察闭区间 [1, 10] 的两个短路条件。", "Observe both short-circuit checks for [1, 10]."],
  ),
  17: pair(
    17,
    ["-4", "-2"],
    [
      ["a", "a"],
      ["b", "b"],
    ],
    [
      ["第一个候选值。", "The first candidate."],
      ["第二个候选值。", "The second candidate."],
    ],
  ),
  18: single(
    18,
    "integer",
    "74",
    ["分数", "Score"],
    ["依次经过 80、70、60 三个阈值。", "Pass through the 80, 70, and 60 thresholds in order."],
  ),
  19: single(
    19,
    "decimal",
    "60000",
    ["收入", "Income"],
    ["有限且不小于 0。", "A finite value greater than or equal to 0."],
  ),
  20: single(
    20,
    "integer",
    "2",
    ["月份", "Month"],
    [
      "1–12 命中月份标签；其他整数进入源码的 default。",
      "Values 1–12 match month labels; other integers take the source default.",
    ],
  ),
  21: single(
    21,
    "integer",
    "0",
    ["count", "count"],
    ["尝试 0、负数和正数，观察守卫路径。", "Try zero, a negative value, and a positive value."],
  ),
  23: single(
    23,
    "integer",
    "5",
    ["n", "n"],
    [
      "输入 0 到 12，避免 32 位整数溢出。",
      "Enter 0 through 12 to stay within 32-bit integer range.",
    ],
  ),
  25: sequence(
    25,
    "3 4 -1",
    ["整数流", "Integer stream"],
    [
      "用空格或逗号分隔，并包含哨兵 -1；其后的值不会进入累加器。",
      "Separate with spaces or commas and include sentinel -1; later values are ignored.",
    ],
  ),
  26: single(
    26,
    "integer",
    "1203",
    ["整数", "Integer"],
    ["0 也会执行一次循环体。", "Zero still executes the loop body once."],
  ),
  27: countedSequence(
    27,
    "4",
    "2 4 6 8",
    ["输入 1 到 12。", "Enter 1 through 12."],
    ["元素个数必须与 count 完全一致。", "The number of values must exactly match count."],
  ),
  28: countedSequence(
    28,
    "5",
    "-4 -9 -2 -7 -3",
    ["输入 1 到 12。", "Enter 1 through 12."],
    [
      "元素个数必须与 count 一致；首值建立 maximum。",
      "The number of values must match count; the first establishes maximum.",
    ],
  ),
  29: special(
    29,
    "integer",
    "4",
    ["三角形行数", "Triangle rows"],
    [
      "输入 0 到 12；这是教学舞台的可视范围。",
      "Enter 0 through 12; this is the teaching stage's visual range.",
    ],
  ),
  30: single(
    30,
    "integer",
    "29",
    ["候选整数", "Candidate integer"],
    [
      "接受 32 位整数；长试除过程会折叠中间证据。",
      "Accepts a 32-bit integer; long trial division folds intermediate evidence.",
    ],
  ),
  31: pair(
    31,
    ["48", "18"],
    [
      ["a", "a"],
      ["b", "b"],
    ],
    [
      ["正整数。", "A positive integer."],
      ["正整数。", "A positive integer."],
    ],
  ),
  32: single(
    32,
    "integer",
    "6",
    ["函数实参", "Function argument"],
    [
      "输入 -46340 到 46340，避免平方溢出。",
      "Enter -46340 through 46340 to avoid square overflow.",
    ],
  ),
  34: single(
    34,
    "integer",
    "-9",
    ["传给 abs 的整数", "Integer passed to abs"],
    [
      "不接受 INT_MIN，因为其绝对值无法由 int 表示。",
      "INT_MIN is excluded because its magnitude cannot be represented by int.",
    ],
  ),
  50: special(
    50,
    "text",
    "11",
    ["读取内容", "Text to read"],
    [
      "输入整数或无效文本，观察 out 指针何时获得有效值。",
      "Enter an integer or invalid text and observe when the out pointer becomes valid.",
    ],
  ),
  52: countedSequence(
    52,
    "3",
    "9 8 7",
    [
      "输入 0 到 5；也可尝试越界数量观察容量门。",
      "Enter 0 through 5, or try an out-of-range count to observe the capacity gate.",
    ],
    [
      "有效 count 下，元素个数必须完全一致。",
      "For a valid count, the number of values must match exactly.",
    ],
  ),
  59: single(
    59,
    "integer",
    "3",
    ["星期索引", "Day index"],
    ["输入 0 到 6。", "Enter a value from 0 to 6."],
  ),
});

export const FOA_INTERACTIVE_INPUT_ORDERS = Object.freeze(
  Object.keys(DEFINITIONS)
    .map(Number)
    .sort((left, right) => left - right),
);

export function getFoaInteractiveInputDefinition(
  order: number,
): FoaInteractiveInputDefinition | null {
  return DEFINITIONS[order] ?? null;
}

export function evaluateFoaInteractiveInput(
  definitionValue: FoaInteractiveInputDefinition,
  values: Readonly<Record<string, string>>,
): FoaInteractiveInputResult {
  try {
    return Object.freeze({ ok: true, run: evaluate(definitionValue, values) });
  } catch (candidate) {
    if (candidate instanceof InputFault) {
      return Object.freeze({
        ok: false,
        fieldId: candidate.fieldId,
        message: candidate.localizedMessage,
      });
    }
    throw candidate;
  }
}

export function defaultFoaInteractiveRun(
  definitionValue: FoaInteractiveInputDefinition,
): FoaInteractiveRun {
  const values = Object.fromEntries(
    definitionValue.fields.map((item) => [item.id, item.defaultValue] as const),
  );
  const result = evaluateFoaInteractiveInput(definitionValue, values);
  if (!result.ok) {
    throw new RangeError(`FOA lesson ${String(definitionValue.order)} has invalid default input`);
  }
  return result.run;
}

function evaluate(
  definitionValue: FoaInteractiveInputDefinition,
  values: Readonly<Record<string, string>>,
): FoaInteractiveRun {
  const order = definitionValue.order;
  switch (order) {
    case 9:
      return scannerRun(order, definitionValue.group, required(values, "value"), false);
    case 12: {
      const radius = decimal(values, "value", -Number.MAX_VALUE, Number.MAX_VALUE);
      if (radius < 0) {
        return rejectedRun(order, definitionValue.group, `${numberText(radius)}\n`, [
          text(`读取 radius=${numberText(radius)}`, `Read radius=${numberText(radius)}`),
          text("检查 radius < 0", "Check radius < 0"),
          text("守卫成立，停止计算", "The guard succeeds and stops computation"),
          text("无 stdout，退出状态 1", "No stdout; exit status 1"),
        ]);
      }
      const volume = (4 / 3) * Math.PI * radius * radius * radius;
      if (!Number.isFinite(volume)) {
        fault(
          "value",
          "该半径会让教学计算溢出。",
          "This radius overflows the teaching calculation.",
        );
      }
      return run(
        order,
        definitionValue.group,
        `${numberText(radius)}\n`,
        `${volume.toFixed(2)}\n`,
        [
          text(`读取 radius=${numberText(radius)}`, `Read radius=${numberText(radius)}`),
          text(
            `计算 radius³=${numberText(radius ** 3)}`,
            `Compute radius³=${numberText(radius ** 3)}`,
          ),
          text("乘以 4π/3", "Multiply by 4π/3"),
          text(`输出 ${volume.toFixed(2)}`, `Output ${volume.toFixed(2)}`),
        ],
      );
    }
    case 13: {
      const numerator = integer(values, "left");
      const denominator = integer(values, "right");
      if (denominator === 0 || (numerator === -2_147_483_648 && denominator === -1)) {
        return rejectedRun(
          order,
          definitionValue.group,
          `${String(numerator)} ${String(denominator)}\n`,
          [
            text(
              `读取 ${String(numerator)} 与 ${String(denominator)}`,
              `Read ${String(numerator)} and ${String(denominator)}`,
            ),
            text(
              denominator === 0 ? "除数为 0" : "商超出 int",
              denominator === 0 ? "The denominator is zero" : "The quotient exceeds int",
            ),
            text("守卫拒绝该运算", "The guard rejects the operation"),
            text("无 stdout，退出状态 1", "No stdout; exit status 1"),
          ],
        );
      }
      const quotient = Math.trunc(numerator / denominator);
      const remainder = numerator - quotient * denominator;
      return run(
        order,
        definitionValue.group,
        `${String(numerator)} ${String(denominator)}\n`,
        `${String(quotient)} ${String(remainder)}\n`,
        [
          text(
            `读取 ${String(numerator)} 与 ${String(denominator)}`,
            `Read ${String(numerator)} and ${String(denominator)}`,
          ),
          text(`整数商 = ${String(quotient)}`, `Integer quotient = ${String(quotient)}`),
          text(`余数 = ${String(remainder)}`, `Remainder = ${String(remainder)}`),
          text(
            `输出 ${String(quotient)} ${String(remainder)}`,
            `Output ${String(quotient)} ${String(remainder)}`,
          ),
        ],
      );
    }
    case 14: {
      const left = integer(values, "left");
      const right = integer(values, "right");
      const result = left < right;
      return run(
        order,
        definitionValue.group,
        `${String(left)} ${String(right)}\n`,
        `${String(result)}\n`,
        [
          text(`左值 ${String(left)}`, `Left value ${String(left)}`),
          text(`${String(left)} < ${String(right)}`, `${String(left)} < ${String(right)}`),
          text(`关系结果 ${result ? "1" : "0"}`, `Relational result ${result ? "1" : "0"}`),
          text(`输出 ${String(result)}`, `Output ${String(result)}`),
        ],
      );
    }
    case 15: {
      const value = integer(values, "value");
      const lower = value >= 1;
      const upper = lower && value <= 10;
      const result = upper ? "inside" : "outside";
      return run(order, definitionValue.group, `${String(value)}\n`, `${result}\n`, [
        text(`输入 ${String(value)}`, `Input ${String(value)}`),
        text(
          `${String(value)} >= 1 → ${yesNo(lower)}`,
          `${String(value)} >= 1 → ${yesNoEn(lower)}`,
        ),
        text(
          lower ? `${String(value)} <= 10 → ${yesNo(upper)}` : "短路：不检查上界",
          lower
            ? `${String(value)} <= 10 → ${yesNoEn(upper)}`
            : "Short-circuit: upper bound not checked",
        ),
        text(`输出 ${result}`, `Output ${result}`),
      ]);
    }
    case 17: {
      const left = integer(values, "left");
      const right = integer(values, "right");
      const maximum = Math.max(left, right);
      return run(
        order,
        definitionValue.group,
        `${String(left)} ${String(right)}\n`,
        `${String(maximum)}\n`,
        [
          text(`候选 a=${String(left)}`, `Candidate a=${String(left)}`),
          text(
            `${String(left)} > ${String(right)} → ${yesNo(left > right)}`,
            `${String(left)} > ${String(right)} → ${yesNoEn(left > right)}`,
          ),
          text(`maximum 接收 ${String(maximum)}`, `maximum receives ${String(maximum)}`),
          text(`输出 ${String(maximum)}`, `Output ${String(maximum)}`),
        ],
      );
    }
    case 18: {
      const score = integer(values, "value");
      const grade = score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : "F";
      const matched =
        score >= 80
          ? "score >= 80"
          : score >= 70
            ? "score >= 70"
            : score >= 60
              ? "score >= 60"
              : "else";
      return run(order, definitionValue.group, `${String(score)}\n`, `${grade}\n`, [
        text(`输入分数 ${String(score)}`, `Input score ${String(score)}`),
        text("按 80 → 70 → 60 检查", "Check 80 → 70 → 60"),
        text(`首个命中：${matched}`, `First match: ${matched}`),
        text(`输出等级 ${grade}`, `Output grade ${grade}`),
      ]);
    }
    case 19: {
      const income = decimal(values, "value", -Number.MAX_VALUE, Number.MAX_VALUE);
      if (income < 0) {
        return rejectedRun(order, definitionValue.group, `${numberText(income)}\n`, [
          text(`收入 ${numberText(income)}`, `Income ${numberText(income)}`),
          text("检查 income < 0", "Check income < 0"),
          text("守卫成立，停止计税", "The guard succeeds and stops tax calculation"),
          text("无 stdout，退出状态 1", "No stdout; exit status 1"),
        ]);
      }
      const taxable = Math.max(0, income - 45_000);
      const tax = taxable * 0.3;
      return run(order, definitionValue.group, `${numberText(income)}\n`, `${tax.toFixed(2)}\n`, [
        text(`收入 ${numberText(income)}`, `Income ${numberText(income)}`),
        text(
          `${numberText(income)} > 45000 → ${yesNo(income > 45_000)}`,
          `${numberText(income)} > 45000 → ${yesNoEn(income > 45_000)}`,
        ),
        text(`应税部分 ${numberText(taxable)}`, `Taxable amount ${numberText(taxable)}`),
        text(`输出 ${tax.toFixed(2)}`, `Output ${tax.toFixed(2)}`),
      ]);
    }
    case 20: {
      const month = integer(values, "value");
      const days = month === 2 ? 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
      const lane = month === 2 ? "case 2" : days === 30 ? "case 4/6/9/11" : "default";
      return run(order, definitionValue.group, `${String(month)}\n`, `${String(days)}\n`, [
        text(`月份 ${String(month)}`, `Month ${String(month)}`),
        text(`命中 ${lane}`, `Match ${lane}`),
        text(`days = ${String(days)}，随后 break`, `days = ${String(days)}, then break`),
        text(`输出 ${String(days)}`, `Output ${String(days)}`),
      ]);
    }
    case 21: {
      const count = integer(values, "value");
      const valid = count > 0;
      return run(
        order,
        definitionValue.group,
        `${String(count)}\n`,
        valid ? `count=${String(count)}\n` : "invalid\n",
        [
          text(`读取 count=${String(count)}`, `Read count=${String(count)}`),
          text(`count <= 0 → ${yesNo(!valid)}`, `count <= 0 → ${yesNoEn(!valid)}`),
          text(
            valid ? "继续核心流程" : "守卫直接返回",
            valid ? "Continue to the core flow" : "Guard returns immediately",
          ),
          text(
            valid ? `输出 count=${String(count)}` : "输出 invalid",
            valid ? `Output count=${String(count)}` : "Output invalid",
          ),
        ],
      );
    }
    case 23: {
      const n = integer(values, "value", 0, 12);
      const factors = Array.from({ length: Math.max(0, n - 1) }, (_, index) => index + 2);
      const factorial = factors.reduce((product, value) => product * value, 1);
      return run(
        order,
        definitionValue.group,
        `${String(n)}\n`,
        `${String(factorial)}\n`,
        [
          text("result 从 1 开始", "result starts at 1"),
          text(
            factors.length === 0 ? "没有需要累乘的因子" : `因子 ${factors.join(" × ")}`,
            factors.length === 0 ? "No factors need multiplying" : `Factors ${factors.join(" × ")}`,
          ),
          text(
            `循环检查停在 i=${String(Math.max(2, n + 1))}`,
            `The loop check stops at i=${String(Math.max(2, n + 1))}`,
          ),
          text(`输出 ${String(factorial)}`, `Output ${String(factorial)}`),
        ],
        factors.map(String),
      );
    }
    case 25: {
      const sequenceValues = integerSequence(values, "values", 1, 12);
      const sentinelIndex = sequenceValues.indexOf(-1);
      if (sentinelIndex < 0)
        fault("values", "序列必须包含哨兵 -1。", "The sequence must include sentinel -1.");
      const consumed = sequenceValues.slice(0, sentinelIndex);
      const sum = checkedSum(consumed, "values");
      return run(
        order,
        definitionValue.group,
        `${sequenceValues.join(" ")}\n`,
        `${String(sum)}\n`,
        [
          text(
            `输入流 ${sequenceValues.join(" → ")}`,
            `Input stream ${sequenceValues.join(" → ")}`,
          ),
          text(
            `在 -1 前消费 ${String(consumed.length)} 项`,
            `Consume ${String(consumed.length)} items before -1`,
          ),
          text(
            `累加 ${consumed.length === 0 ? "∅" : consumed.join(" + ")} = ${String(sum)}`,
            `Accumulate ${consumed.length === 0 ? "∅" : consumed.join(" + ")} = ${String(sum)}`,
          ),
          text(`输出 ${String(sum)}`, `Output ${String(sum)}`),
        ],
        sequenceValues.map(String),
      );
    }
    case 26: {
      const value = integer(values, "value");
      const digits = Math.abs(value).toString().length;
      return run(
        order,
        definitionValue.group,
        `${String(value)}\n`,
        `${String(digits)}\n`,
        [
          text(`初值 ${String(value)}`, `Initial value ${String(value)}`),
          text("先执行 digits++", "Execute digits++ first"),
          text(`连续除以 10，共 ${String(digits)} 轮`, `Divide by 10 for ${String(digits)} rounds`),
          text(`输出位数 ${String(digits)}`, `Output digit count ${String(digits)}`),
        ],
        Math.abs(value).toString().split(""),
      );
    }
    case 27: {
      const count = integer(values, "count", 1, 12);
      const sequenceValues = integerSequence(values, "values", count, count);
      const sum = checkedSum(sequenceValues, "values");
      const average = sum / sequenceValues.length;
      const stdin = `${String(count)} ${sequenceValues.join(" ")}\n`;
      return run(
        order,
        definitionValue.group,
        stdin,
        `${average.toFixed(2)}\n`,
        [
          text(`count = ${String(count)}`, `count = ${String(count)}`),
          text(`依次读取 ${sequenceValues.join(" → ")}`, `Read ${sequenceValues.join(" → ")}`),
          text(`sum = ${String(sum)}`, `sum = ${String(sum)}`),
          text(`输出均值 ${average.toFixed(2)}`, `Output average ${average.toFixed(2)}`),
        ],
        sequenceValues.map(String),
      );
    }
    case 28: {
      const count = integer(values, "count", 1, 12);
      const sequenceValues = integerSequence(values, "values", count, count);
      let maximum = sequenceValues[0]!;
      const updates = [maximum];
      for (const value of sequenceValues.slice(1)) {
        if (value > maximum) {
          maximum = value;
          updates.push(maximum);
        }
      }
      const stdin = `${String(count)} ${sequenceValues.join(" ")}\n`;
      return run(
        order,
        definitionValue.group,
        stdin,
        `${String(maximum)}\n`,
        [
          text(
            `首值建立 maximum=${String(sequenceValues[0])}`,
            `First value establishes maximum=${String(sequenceValues[0])}`,
          ),
          text(
            `挑战者 ${sequenceValues.slice(1).join(" → ") || "∅"}`,
            `Challengers ${sequenceValues.slice(1).join(" → ") || "∅"}`,
          ),
          text(`maximum 履历 ${updates.join(" → ")}`, `maximum history ${updates.join(" → ")}`),
          text(`输出 ${String(maximum)}`, `Output ${String(maximum)}`),
        ],
        sequenceValues.map(String),
      );
    }
    case 29: {
      const rows = integer(values, "value", -2_147_483_648, 12);
      if (rows < 0) {
        return rejectedRun(order, definitionValue.group, `${String(rows)}\n`, [
          text(`rows = ${String(rows)}`, `rows = ${String(rows)}`),
          text("检查 rows < 0", "Check rows < 0"),
          text("守卫成立，不进入嵌套循环", "The guard succeeds; nested loops are skipped"),
          text("无 stdout，退出状态 1", "No stdout; exit status 1"),
        ]);
      }
      const lines = Array.from({ length: rows }, (_, index) => "*".repeat(index + 1));
      const stdout = rows === 0 ? "" : `${lines.join("\n")}\n`;
      return run(
        order,
        definitionValue.group,
        `${String(rows)}\n`,
        stdout,
        [
          text(`rows = ${String(rows)}`, `rows = ${String(rows)}`),
          text(`外层循环 ${String(rows)} 轮`, `Outer loop: ${String(rows)} rounds`),
          text(
            `内层总计写入 ${String((rows * (rows + 1)) / 2)} 个 *`,
            `Inner loops write ${String((rows * (rows + 1)) / 2)} stars`,
          ),
          text(
            rows === 0 ? "无输出行" : `形成 ${String(rows)} 行`,
            rows === 0 ? "No output rows" : `Produce ${String(rows)} rows`,
          ),
        ],
        lines,
      );
    }
    case 30: {
      const candidate = integer(values, "value");
      let divisor = 2;
      const tested: number[] = [];
      let prime = candidate >= 2;
      while (prime && divisor <= Math.trunc(candidate / divisor)) {
        tested.push(divisor);
        if (candidate % divisor === 0) prime = false;
        divisor += 1;
      }
      const result = prime ? "prime" : "composite";
      return run(
        order,
        definitionValue.group,
        `${String(candidate)}\n`,
        `${result}\n`,
        [
          text(`候选 n=${String(candidate)}`, `Candidate n=${String(candidate)}`),
          text(
            tested.length === 0 ? "无需进入试除循环" : `试除 ${tested.join(", ")}`,
            tested.length === 0 ? "No trial division needed" : `Try divisors ${tested.join(", ")}`,
          ),
          text(
            candidate < 2
              ? "n < 2，因此不是素数"
              : prime
                ? "未找到因子"
                : `找到因子 ${String(tested.at(-1))}`,
            candidate < 2
              ? "n < 2, so it is not prime"
              : prime
                ? "No factor found"
                : `Factor found: ${String(tested.at(-1))}`,
          ),
          text(`输出 ${result}`, `Output ${result}`),
        ],
        compactNumberEvidence(tested),
      );
    }
    case 31: {
      let left = integer(values, "left");
      let right = integer(values, "right");
      const originalLeft = left;
      const originalRight = right;
      if (left <= 0 || right <= 0) {
        return rejectedRun(order, definitionValue.group, `${String(left)} ${String(right)}\n`, [
          text(
            `读取 (${String(left)}, ${String(right)})`,
            `Read (${String(left)}, ${String(right)})`,
          ),
          text("检查 a <= 0 || b <= 0", "Check a <= 0 || b <= 0"),
          text("守卫拒绝该状态", "The guard rejects this state"),
          text("无 stdout，退出状态 1", "No stdout; exit status 1"),
        ]);
      }
      const remainders: number[] = [];
      while (right !== 0) {
        const remainder = left % right;
        remainders.push(remainder);
        left = right;
        right = remainder;
      }
      return run(
        order,
        definitionValue.group,
        `${String(originalLeft)} ${String(originalRight)}\n`,
        `${String(left)}\n`,
        [
          text(
            `寄存器 (${String(originalLeft)}, ${String(originalRight)})`,
            `Registers (${String(originalLeft)}, ${String(originalRight)})`,
          ),
          text(`余数 ${remainders.join(" → ")}`, `Remainders ${remainders.join(" → ")}`),
          text("每轮轮换 a=b, b=remainder", "Rotate a=b, b=remainder each round"),
          text(`输出 gcd=${String(left)}`, `Output gcd=${String(left)}`),
        ],
        remainders.map(String),
      );
    }
    case 32: {
      const value = integer(values, "value", -46_340, 46_340);
      const square = value * value;
      return run(order, definitionValue.group, `${String(value)}\n`, `${String(square)}\n`, [
        text(`实参 ${String(value)}`, `Argument ${String(value)}`),
        text(`形参 x=${String(value)}`, `Parameter x=${String(value)}`),
        text(`x * x = ${String(square)}`, `x * x = ${String(square)}`),
        text(`返回并输出 ${String(square)}`, `Return and output ${String(square)}`),
      ]);
    }
    case 34: {
      const value = integer(values, "value", -2_147_483_647, 2_147_483_647);
      const magnitude = Math.abs(value);
      return run(order, definitionValue.group, `${String(value)}\n`, `${String(magnitude)}\n`, [
        text(`传入 ${String(value)}`, `Pass ${String(value)}`),
        text("调用 abs 的公开契约", "Call abs through its public contract"),
        text(`返回 ${String(magnitude)}`, `Return ${String(magnitude)}`),
        text(`输出 ${String(magnitude)}`, `Output ${String(magnitude)}`),
      ]);
    }
    case 50:
      return scannerRun(order, definitionValue.group, required(values, "value"), true);
    case 52: {
      const count = integer(values, "count");
      if (count < 0 || count > 5) {
        return rejectedRun(order, definitionValue.group, `${String(count)}\n`, [
          text(`读取 count=${String(count)}`, `Read count=${String(count)}`),
          text(`${String(count)} 在 0..5 之外`, `${String(count)} is outside 0..5`),
          text("容量门拒绝，不写入任何槽位", "The capacity gate rejects it; no slots are written"),
          text("无 stdout，退出状态 1", "No stdout; exit status 1"),
        ]);
      }
      const sequenceValues = integerSequence(values, "values", count, count);
      const last = sequenceValues.at(-1) ?? 0;
      const stdin = count === 0 ? "0\n" : `${String(count)} ${sequenceValues.join(" ")}\n`;
      return run(
        order,
        definitionValue.group,
        stdin,
        `${String(last)}\n`,
        [
          text(`逻辑长度 ${String(count)}`, `Logical length ${String(count)}`),
          text(`${String(count)} <= 容量 5`, `${String(count)} <= capacity 5`),
          text(
            count === 0 ? "数组保持为空" : `写入 [${sequenceValues.join(", ")}]`,
            count === 0 ? "Array remains empty" : `Write [${sequenceValues.join(", ")}]`,
          ),
          text(`输出 ${String(last)}`, `Output ${String(last)}`),
        ],
        sequenceValues.map(String),
      );
    }
    case 59: {
      const index = integer(values, "value");
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
      if (index < 0 || index >= days.length) {
        return rejectedRun(order, definitionValue.group, `${String(index)}\n`, [
          text(`索引 ${String(index)}`, `Index ${String(index)}`),
          text(`0 <= ${String(index)} < 7 → 不成立`, `0 <= ${String(index)} < 7 → false`),
          text("不访问 days 数组", "Do not access the days array"),
          text("无 stdout，退出状态 1", "No stdout; exit status 1"),
        ]);
      }
      const day = days[index]!;
      return run(order, definitionValue.group, `${String(index)}\n`, `${day}\n`, [
        text(`索引 ${String(index)}`, `Index ${String(index)}`),
        text(`0 <= ${String(index)} < 7`, `0 <= ${String(index)} < 7`),
        text(`选择 days[${String(index)}]`, `Select days[${String(index)}]`),
        text(`输出 ${day}`, `Output ${day}`),
      ]);
    }
    default:
      throw new RangeError(`FOA lesson ${String(order)} has no interactive evaluator`);
  }
}

function scannerRun(
  order: number,
  group: FoaInteractiveInputGroup,
  rawValue: string,
  throughPointer: boolean,
): FoaInteractiveRun {
  const trimmed = rawValue.trim();
  const parsed = scanfIntegerPrefix(trimmed);
  const valid = parsed !== null;
  if (
    parsed !== null &&
    (throughPointer ? parsed < -1_073_741_824 || parsed > 1_073_741_823 : parsed === 2_147_483_647)
  ) {
    fault(
      "value",
      "该整数会让后续 C int 运算溢出，请换一个值。",
      "This integer overflows the subsequent C int operation; use another value.",
    );
  }
  const output = valid ? String(throughPointer ? parsed * 2 : parsed + 1) : "invalid";
  return run(
    order,
    group,
    `${trimmed}\n`,
    `${output}\n`,
    [
      text(`token “${trimmed || "∅"}”`, `Token “${trimmed || "∅"}”`),
      text(`scanf 返回 ${valid ? "1" : "0"}`, `scanf returns ${valid ? "1" : "0"}`),
      text(
        throughPointer
          ? valid
            ? `out 获得 ${String(parsed)}`
            : "out 保持无效"
          : valid
            ? `value=${String(parsed)}`
            : "value 未建立",
        throughPointer
          ? valid
            ? `out receives ${String(parsed)}`
            : "out remains invalid"
          : valid
            ? `value=${String(parsed)}`
            : "value is not established",
      ),
      text(`输出 ${output}`, `Output ${output}`),
    ],
    [],
    valid ? "success" : "scan-failed",
  );
}

function run(
  order: number,
  group: FoaInteractiveInputGroup,
  stdin: string,
  stdout: string,
  eventDetails: readonly FoaLocalizedText[],
  tokens: readonly string[] = [],
  outcome: FoaInteractiveRun["outcome"] = "success",
  exitStatus: FoaInteractiveRun["exitStatus"] = 0,
): FoaInteractiveRun {
  if (eventDetails.length < 2 || eventDetails.length > 32) {
    throw new RangeError(
      `FOA interactive lesson ${String(order)} requires two to 32 event details`,
    );
  }
  const compactOutput = stdout.length === 0 ? "∅" : stdout.trim().replaceAll("\n", " / ");
  return Object.freeze({
    order,
    group,
    stdin,
    stdout,
    summary: text(`当前输入将得到 ${compactOutput}`, `The current input produces ${compactOutput}`),
    eventDetails: Object.freeze([...eventDetails]),
    tokens: Object.freeze([...tokens]),
    outcome,
    exitStatus,
  });
}

function rejectedRun(
  order: number,
  group: FoaInteractiveInputGroup,
  stdin: string,
  eventDetails: readonly FoaLocalizedText[],
): FoaInteractiveRun {
  return run(order, group, stdin, "", eventDetails, [], "range-rejected", 1);
}

function definition(
  order: number,
  group: FoaInteractiveInputGroup,
  fields: readonly FoaInteractiveInputField[],
): FoaInteractiveInputDefinition {
  return Object.freeze({
    order,
    group,
    title: text("输入本轮案例", "Enter this run's input"),
    description: text(
      "输入只驱动当前教学舞台；可随时更换、回退或重新运行。",
      "The input drives only this teaching stage; you can change, rewind, or run it again.",
    ),
    fields: Object.freeze([...fields]),
  });
}

function field(
  id: string,
  kind: FoaInteractiveInputFieldKind,
  defaultValue: string,
  label: readonly [string, string],
  hint: readonly [string, string],
): FoaInteractiveInputField {
  return Object.freeze({
    id,
    kind,
    label: text(label[0], label[1]),
    hint: text(hint[0], hint[1]),
    defaultValue,
  });
}

function required(values: Readonly<Record<string, string>>, id: string): string {
  const value = values[id]?.trim() ?? "";
  if (value.length === 0) fault(id, "请输入一个值。", "Enter a value.");
  return value;
}

function integer(
  values: Readonly<Record<string, string>>,
  id: string,
  minimum = -2_147_483_648,
  maximum = 2_147_483_647,
): number {
  const raw = required(values, id);
  const parsed = strictInteger(raw);
  if (parsed === null || parsed < minimum || parsed > maximum) {
    fault(
      id,
      `请输入 ${String(minimum)} 到 ${String(maximum)} 之间的整数。`,
      `Enter an integer from ${String(minimum)} to ${String(maximum)}.`,
    );
  }
  return parsed;
}

function decimal(
  values: Readonly<Record<string, string>>,
  id: string,
  minimum: number,
  maximum: number,
): number {
  const raw = required(values, id);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u.test(raw)) {
    fault(id, "请输入普通十进制数字。", "Enter a plain decimal number.");
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    fault(
      id,
      `请输入 ${numberText(minimum)} 到 ${numberText(maximum)} 之间的有限数字。`,
      `Enter a finite number from ${numberText(minimum)} to ${numberText(maximum)}.`,
    );
  }
  return parsed;
}

function integerSequence(
  values: Readonly<Record<string, string>>,
  id: string,
  minimumLength: number,
  maximumLength: number,
): number[] {
  const raw = values[id]?.trim() ?? "";
  const parts = raw.length === 0 ? [] : raw.split(/[\s,]+/u);
  if (parts.length < minimumLength || parts.length > maximumLength) {
    fault(
      id,
      `请输入 ${String(minimumLength)} 到 ${String(maximumLength)} 个整数。`,
      `Enter ${String(minimumLength)} to ${String(maximumLength)} integers.`,
    );
  }
  const parsed = parts.map(strictInteger);
  if (parsed.some((value) => value === null || value < -2_147_483_648 || value > 2_147_483_647)) {
    fault(
      id,
      "序列只能包含以空格或逗号分隔的整数。",
      "The sequence may contain only space- or comma-separated integers.",
    );
  }
  return parsed as number[];
}

function checkedSum(values: readonly number[], fieldId: string): number {
  let total = 0;
  for (const value of values) {
    const next = total + value;
    if (next < -2_147_483_648 || next > 2_147_483_647) {
      fault(
        fieldId,
        "这组值会让 C int 累加溢出，请缩小数值。",
        "These values overflow C int accumulation; use smaller values.",
      );
    }
    total = next;
  }
  return total;
}

function scanfIntegerPrefix(value: string): number | null {
  const match = /^\s*([+-]?\d+)/u.exec(value);
  if (match === null) return null;
  const parsed = Number(match[1]);
  return Number.isSafeInteger(parsed) && parsed >= -2_147_483_648 && parsed <= 2_147_483_647
    ? parsed
    : null;
}

function compactNumberEvidence(values: readonly number[]): readonly string[] {
  if (values.length <= 8) return values.map(String);
  return [
    ...values.slice(0, 4).map(String),
    `… ${String(values.length - 6)} more …`,
    ...values.slice(-2).map(String),
  ];
}

function strictInteger(value: string): number | null {
  if (!/^[+-]?\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}

function yesNo(value: boolean): string {
  return value ? "成立" : "不成立";
}

function yesNoEn(value: boolean): string {
  return value ? "true" : "false";
}

function text(zh: string, en: string): FoaLocalizedText {
  return foaText(zh, en);
}

function fault(fieldId: string, zh: string, en: string): never {
  throw new InputFault(fieldId, text(zh, en));
}

class InputFault extends Error {
  readonly fieldId: string;
  readonly localizedMessage: FoaLocalizedText;

  constructor(fieldId: string, localizedMessage: FoaLocalizedText) {
    super(localizedMessage.en);
    this.name = "InputFault";
    this.fieldId = fieldId;
    this.localizedMessage = localizedMessage;
  }
}

if (
  FOA_INTERACTIVE_INPUT_ORDERS.length !== 23 ||
  new Set(FOA_INTERACTIVE_INPUT_ORDERS).size !== FOA_INTERACTIVE_INPUT_ORDERS.length
) {
  throw new RangeError("FOA interactive input registry must cover 23 unique lessons");
}
