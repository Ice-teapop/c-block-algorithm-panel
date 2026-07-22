import { foaText, type FoaLocalizedText } from "./foa-contracts.js";
import type { FoaInteractiveRun } from "./foa-interactive-inputs.js";
import {
  defineFoaCourseRuntimeEvidence,
  runtimeMemoryLink,
  runtimeStackFrame,
  runtimeText,
  runtimeToken,
  type FoaCourseRuntimeEvidence,
  type FoaRuntimeEvidenceSnapshot,
  type FoaRuntimeEvidenceSnapshotInput,
} from "./foa-runtime-evidence-contracts.js";
import { getFoaSceneMechanism, type FoaSceneMechanism } from "./foa-scene-mechanisms.js";
import { getFoaSceneProfile } from "./foa-scene-profiles.js";

export type {
  FoaCourseRuntimeEvidence,
  FoaRuntimeEvidenceMemoryLink,
  FoaRuntimeEvidenceSnapshot,
  FoaRuntimeEvidenceStackFrame,
  FoaRuntimeEvidenceToken,
} from "./foa-runtime-evidence-contracts.js";

export const FOA_INTERACTIVE_RUNTIME_EVIDENCE_ORDERS = Object.freeze([
  9, 12, 13, 14, 15, 17, 18, 19, 20, 21, 23, 25, 26, 27, 28, 29, 30, 31, 32, 34, 50, 52, 59,
] as const);

type FoaRuntimeTokenStatus = "pending" | "active" | "consumed" | "output";
type FoaRuntimeStackStatus = "active" | "returned";

interface StagedToken {
  readonly id: string;
  readonly value: string;
  readonly status: FoaRuntimeTokenStatus;
}

interface StagedStackFrame {
  readonly id: string;
  readonly label: FoaLocalizedText;
  readonly status: FoaRuntimeStackStatus;
}

interface StagedMemoryLink {
  readonly id: string;
  readonly fromFieldId: string;
  readonly toFieldId: string;
  readonly label: FoaLocalizedText;
}

type StateInput = Readonly<Record<string, FoaLocalizedText | string | number | boolean>>;
type FoaInteractiveRuntimeEvidenceFrame = FoaRuntimeEvidenceSnapshot;

interface FrameExtras {
  readonly tokens?: readonly StagedToken[];
  readonly stackFrames?: readonly StagedStackFrame[];
  readonly memoryLinks?: readonly StagedMemoryLink[];
  readonly branchOutcome?: boolean | null;
  readonly iteration?: number | null;
}

const PENDING = foaText("待执行", "Pending");
const UNAVAILABLE = foaText("不可用", "Unavailable");
const NO_OUTPUT = foaText("无输出", "No output");
const NOT_EVALUATED = foaText("未求值", "Not evaluated");

/**
 * Builds exact, course-authored runtime evidence from an evaluated interactive run. Every
 * supported lesson has an explicit case below; unsupported orders fail closed.
 */
export function createFoaInteractiveRuntimeEvidence(
  run: FoaInteractiveRun,
): FoaCourseRuntimeEvidence {
  assertRun(run);
  const mechanism = getFoaSceneMechanism(run.order);
  const frames = evidenceFrames(run, mechanism);
  assertEvidenceOutcome(run, frames);
  assertRuntimeTokens(run, frames);
  return Object.freeze({ order: run.order, frames });
}

function evidenceFrames(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaRuntimeEvidenceSnapshot[] {
  switch (run.order) {
    case 9:
      return scannerEvidence(run, mechanism, false);
    case 12:
      return sphereEvidence(run, mechanism);
    case 13:
      return quotientEvidence(run, mechanism);
    case 14:
      return comparisonEvidence(run, mechanism);
    case 15:
      return rangeEvidence(run, mechanism);
    case 17:
      return maximumPairEvidence(run, mechanism);
    case 18:
      return gradeEvidence(run, mechanism);
    case 19:
      return taxEvidence(run, mechanism);
    case 20:
      return monthEvidence(run, mechanism);
    case 21:
      return guardEvidence(run, mechanism);
    case 23:
      return factorialEvidence(run, mechanism);
    case 25:
      return sentinelEvidence(run, mechanism);
    case 26:
      return digitCountEvidence(run, mechanism);
    case 27:
      return averageEvidence(run, mechanism);
    case 28:
      return maximumScanEvidence(run, mechanism);
    case 29:
      return triangleEvidence(run, mechanism);
    case 30:
      return primeEvidence(run, mechanism);
    case 31:
      return euclidEvidence(run, mechanism);
    case 32:
      return squareCallEvidence(run, mechanism);
    case 34:
      return absoluteEvidence(run, mechanism);
    case 50:
      return scannerEvidence(run, mechanism, true);
    case 52:
      return boundedArrayEvidence(run, mechanism);
    case 59:
      return weekdayEvidence(run, mechanism);
    default:
      throw new RangeError(
        `FOA lesson ${String(run.order)} has no interactive runtime evidence case`,
      );
  }
}

function scannerEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
  throughPointer: boolean,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const raw = run.stdin.trim();
  const parsed = scanfIntegerPrefix(raw);
  const valid = parsed !== null;
  const expected = valid ? String(throughPointer ? parsed * 2 : parsed + 1) : "invalid";
  assertOutput(run, `${expected}\n`);
  const tokenFrames = tokenTimeline([raw.length === 0 ? "∅" : raw]);
  if (!throughPointer) {
    return buildFrames(run, mechanism, [
      frame(
        { inputToken: raw || "∅", scanCount: PENDING, value: UNAVAILABLE, stdout: PENDING },
        { tokens: tokenFrames[0] },
      ),
      frame(
        { inputToken: raw || "∅", scanCount: valid ? 1 : 0, value: UNAVAILABLE, stdout: PENDING },
        { tokens: tokenFrames[1], branchOutcome: valid },
      ),
      frame(
        {
          inputToken: raw || "∅",
          scanCount: valid ? 1 : 0,
          value: valid ? parsed : UNAVAILABLE,
          stdout: PENDING,
        },
        { tokens: tokenFrames[2], branchOutcome: valid },
      ),
      frame(
        {
          inputToken: raw || "∅",
          scanCount: valid ? 1 : 0,
          value: valid ? parsed : UNAVAILABLE,
          stdout: expected,
        },
        { tokens: tokenFrames[3], branchOutcome: valid },
      ),
    ]);
  }
  const link = memoryLink("scanner-out", "outPointer", "outValue", "成功写入", "Write on success");
  return buildFrames(run, mechanism, [
    frame(
      {
        token: raw || "∅",
        scanStatus: PENDING,
        outPointer: "out",
        outValidity: false,
        outValue: UNAVAILABLE,
      },
      { tokens: tokenFrames[0] },
    ),
    frame(
      {
        token: raw || "∅",
        scanStatus: valid ? 1 : 0,
        outPointer: "out",
        outValidity: false,
        outValue: UNAVAILABLE,
      },
      { tokens: tokenFrames[1], branchOutcome: valid },
    ),
    frame(
      {
        token: raw || "∅",
        scanStatus: valid ? 1 : 0,
        outPointer: "out",
        outValidity: valid,
        outValue: valid ? parsed : UNAVAILABLE,
      },
      { tokens: tokenFrames[2], memoryLinks: valid ? [link] : [], branchOutcome: valid },
    ),
    frame(
      {
        token: raw || "∅",
        scanStatus: valid ? 1 : 0,
        outPointer: "out",
        outValidity: valid,
        outValue: valid ? parsed : UNAVAILABLE,
      },
      { tokens: tokenFrames[3], memoryLinks: valid ? [link] : [], branchOutcome: valid },
    ),
  ]);
}

function sphereEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const radius = oneDecimal(run);
  const valid = radius >= 0;
  const cube = radius ** 3;
  const volume = (4 / 3) * Math.PI * cube;
  assertOutput(run, valid ? `${volume.toFixed(2)}\n` : "");
  const tokenFrames = tokenTimeline([numberText(radius), "4π/3"]);
  return buildFrames(run, mechanism, [
    frame({ radius, cube: PENDING, scale: PENDING, volume: PENDING }, { tokens: tokenFrames[0] }),
    frame(
      { radius, cube, scale: PENDING, volume: PENDING },
      { tokens: tokenFrames[1], branchOutcome: valid },
    ),
    frame(
      { radius, cube, scale: "4π/3", volume: valid ? volume.toFixed(2) : UNAVAILABLE },
      { tokens: tokenFrames[2], branchOutcome: valid },
    ),
    frame(
      { radius, cube, scale: "4π/3", volume: valid ? volume.toFixed(2) : NO_OUTPUT },
      { tokens: tokenFrames[3], branchOutcome: valid },
    ),
  ]);
}

function quotientEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [numerator, denominator] = exactIntegers(run, 2);
  const valid = denominator !== 0 && !(numerator === -2_147_483_648 && denominator === -1);
  const quotient = valid ? Math.trunc(numerator / denominator) : null;
  const remainder = valid && quotient !== null ? numerator - quotient * denominator : null;
  assertOutput(run, valid ? `${String(quotient)} ${String(remainder)}\n` : "");
  const tokenFrames = tokenTimeline([String(numerator), String(denominator)]);
  return buildFrames(run, mechanism, [
    frame(
      { numerator, denominator, quotient: PENDING, remainder: PENDING },
      { tokens: tokenFrames[0] },
    ),
    frame(
      { numerator, denominator, quotient: valid ? quotient! : UNAVAILABLE, remainder: PENDING },
      { tokens: tokenFrames[1], branchOutcome: valid },
    ),
    frame(
      {
        numerator,
        denominator,
        quotient: valid ? quotient! : UNAVAILABLE,
        remainder: valid ? remainder! : UNAVAILABLE,
      },
      { tokens: tokenFrames[2], branchOutcome: valid },
    ),
    frame(
      {
        numerator,
        denominator,
        quotient: valid ? quotient! : UNAVAILABLE,
        remainder: valid ? remainder! : NO_OUTPUT,
      },
      { tokens: tokenFrames[3], branchOutcome: valid },
    ),
  ]);
}

function comparisonEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [left, right] = exactIntegers(run, 2);
  const predicate = left < right;
  assertOutput(run, `${String(predicate)}\n`);
  return buildFrames(run, mechanism, [
    frame({ left, right, predicate: PENDING, truthValue: PENDING }),
    frame({ left, right, predicate, truthValue: PENDING }, { branchOutcome: predicate }),
    frame({ left, right, predicate, truthValue: predicate ? 1 : 0 }, { branchOutcome: predicate }),
    frame({ left, right, predicate, truthValue: predicate ? 1 : 0 }, { branchOutcome: predicate }),
  ]);
}

function rangeEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [value] = exactIntegers(run, 1);
  const lower = value >= 1;
  const upper = lower ? value <= 10 : null;
  const inside = lower && upper === true;
  const result = inside ? "inside" : "outside";
  assertOutput(run, `${result}\n`);
  return buildFrames(run, mechanism, [
    frame({ value, lowerClause: PENDING, upperClause: PENDING, rangeOutcome: PENDING }),
    frame(
      {
        value,
        lowerClause: lower,
        upperClause: lower ? PENDING : NOT_EVALUATED,
        rangeOutcome: PENDING,
      },
      { branchOutcome: lower },
    ),
    frame(
      {
        value,
        lowerClause: lower,
        upperClause: upper === null ? NOT_EVALUATED : upper,
        rangeOutcome: result,
      },
      { branchOutcome: inside },
    ),
    frame(
      {
        value,
        lowerClause: lower,
        upperClause: upper === null ? NOT_EVALUATED : upper,
        rangeOutcome: result,
      },
      { branchOutcome: inside },
    ),
  ]);
}

function maximumPairEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [a, b] = exactIntegers(run, 2);
  const comparison = a > b;
  const maximum = Math.max(a, b);
  assertOutput(run, `${String(maximum)}\n`);
  return buildFrames(run, mechanism, [
    frame({ a, b, comparison: PENDING, maximum: PENDING }),
    frame({ a, b, comparison, maximum: PENDING }, { branchOutcome: comparison }),
    frame({ a, b, comparison, maximum }, { branchOutcome: comparison }),
    frame({ a, b, comparison, maximum }, { branchOutcome: comparison }),
  ]);
}

function gradeEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [score] = exactIntegers(run, 1);
  const thresholds = [80, 70, 60];
  const threshold = thresholds.find((candidate) => score >= candidate) ?? null;
  const grade = threshold === 80 ? "A" : threshold === 70 ? "B" : threshold === 60 ? "C" : "F";
  assertOutput(run, `${grade}\n`);
  return buildFrames(run, mechanism, [
    frame({ score, threshold: PENDING, firstMatch: false, grade: PENDING }),
    frame(
      { score, threshold: 80, firstMatch: score >= 80, grade: score >= 80 ? "A" : PENDING },
      { branchOutcome: score >= 80 },
    ),
    frame(
      { score, threshold: threshold ?? "else", firstMatch: true, grade },
      { branchOutcome: threshold !== null },
    ),
    frame(
      { score, threshold: threshold ?? "else", firstMatch: true, grade },
      { branchOutcome: threshold !== null },
    ),
  ]);
}

function taxEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const income = oneDecimal(run);
  const valid = income >= 0;
  const overThreshold = valid && income > 45_000;
  const taxable = valid ? Math.max(0, income - 45_000) : null;
  const tax = taxable === null ? null : taxable * 0.3;
  assertOutput(run, valid && tax !== null ? `${tax.toFixed(2)}\n` : "");
  return buildFrames(run, mechanism, [
    frame({ income, thresholdTest: PENDING, taxable: PENDING, tax: PENDING }),
    frame(
      {
        income,
        thresholdTest: overThreshold,
        taxable: valid ? taxable! : UNAVAILABLE,
        tax: PENDING,
      },
      { branchOutcome: valid },
    ),
    frame(
      {
        income,
        thresholdTest: overThreshold,
        taxable: valid ? taxable! : UNAVAILABLE,
        tax: valid ? tax!.toFixed(2) : UNAVAILABLE,
      },
      { branchOutcome: overThreshold },
    ),
    frame(
      {
        income,
        thresholdTest: overThreshold,
        taxable: valid ? taxable! : UNAVAILABLE,
        tax: valid ? tax!.toFixed(2) : NO_OUTPUT,
      },
      { branchOutcome: valid },
    ),
  ]);
}

function monthEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [month] = exactIntegers(run, 1);
  const days = month === 2 ? 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  const lane = month === 2 ? "case 2" : days === 30 ? "case 4/6/9/11" : "default";
  assertOutput(run, `${String(days)}\n`);
  return buildFrames(run, mechanism, [
    frame({ month, caseLane: PENDING, days: PENDING, breakStatus: false }),
    frame(
      { month, caseLane: lane, days: PENDING, breakStatus: false },
      { branchOutcome: lane !== "default" },
    ),
    frame({ month, caseLane: lane, days, breakStatus: true }, { branchOutcome: true }),
    frame({ month, caseLane: lane, days, breakStatus: true }, { branchOutcome: true }),
  ]);
}

function guardEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [count] = exactIntegers(run, 1);
  const rejected = count <= 0;
  const output = rejected ? "invalid" : `count=${String(count)}`;
  assertOutput(run, `${output}\n`);
  return buildFrames(run, mechanism, [
    frame({ count, guard: PENDING, coreStatus: PENDING, stdout: PENDING }),
    frame(
      { count, guard: rejected, coreStatus: rejected ? "bypassed" : "enabled", stdout: PENDING },
      { branchOutcome: rejected },
    ),
    frame(
      { count, guard: rejected, coreStatus: rejected ? "bypassed" : "executed", stdout: PENDING },
      { branchOutcome: !rejected },
    ),
    frame(
      { count, guard: rejected, coreStatus: rejected ? "bypassed" : "executed", stdout: output },
      { branchOutcome: !rejected },
    ),
  ]);
}

function factorialEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [n] = exactIntegers(run, 1);
  const factors = Array.from({ length: Math.max(0, n - 1) }, (_, index) => index + 2);
  const result = factors.reduce((product, factor) => product * factor, 1);
  assertOutput(run, `${String(result)}\n`);
  const tokenFrames = tokenTimeline(verifiedTokens(run, factors.map(String)));
  const finalFactor = factors.at(-1) ?? 1;
  return buildFrames(run, mechanism, [
    frame(
      { n, factor: factors[0] ?? "∅", result: 1, invariant: "0..1" },
      { tokens: tokenFrames[0], iteration: 0 },
    ),
    frame(
      {
        n,
        factor: factors[0] ?? "∅",
        result: factors[0] ?? 1,
        invariant: factors.length === 0 ? "0..1" : `1..${String(factors[0])}`,
      },
      { tokens: tokenFrames[1], iteration: factors.length === 0 ? 0 : 1 },
    ),
    frame(
      { n, factor: finalFactor, result, invariant: `1..${String(Math.max(1, n))}` },
      { tokens: tokenFrames[2], iteration: factors.length },
    ),
    frame(
      { n, factor: finalFactor, result, invariant: `factorial(${String(n)})` },
      { tokens: tokenFrames[3], iteration: factors.length },
    ),
  ]);
}

function sentinelEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const values = exactIntegers(run);
  const sentinelIndex = values.indexOf(-1);
  if (sentinelIndex < 0)
    throw new RangeError("FOA lesson 25 runtime evidence requires sentinel -1");
  const consumed = values.slice(0, sentinelIndex);
  const sum = consumed.reduce((total, value) => total + value, 0);
  assertOutput(run, `${String(sum)}\n`);
  const tokenFrames = tokenTimeline(verifiedTokens(run, values.map(String)), sentinelIndex);
  return buildFrames(run, mechanism, [
    frame(
      { tokens: values.join(" "), currentToken: values[0] ?? "∅", sentinel: false, sum: 0 },
      { tokens: tokenFrames[0], iteration: 0 },
    ),
    frame(
      { tokens: values.join(" "), currentToken: consumed.at(-1) ?? -1, sentinel: false, sum },
      { tokens: tokenFrames[1], branchOutcome: false, iteration: consumed.length },
    ),
    frame(
      { tokens: values.join(" "), currentToken: -1, sentinel: true, sum },
      { tokens: tokenFrames[2], branchOutcome: true, iteration: sentinelIndex + 1 },
    ),
    frame(
      { tokens: values.join(" "), currentToken: -1, sentinel: true, sum },
      { tokens: tokenFrames[3], branchOutcome: true, iteration: sentinelIndex + 1 },
    ),
  ]);
}

function digitCountEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [original] = exactIntegers(run, 1);
  const absolute = Math.abs(original);
  const digits = absolute.toString().length;
  assertOutput(run, `${String(digits)}\n`);
  const firstQuotient = Math.trunc(absolute / 10);
  const tokenFrames = tokenTimeline(verifiedTokens(run, absolute.toString().split("")));
  return buildFrames(run, mechanism, [
    frame(
      { value: absolute, digits: 0, iteration: 0, condition: true },
      { tokens: tokenFrames[0], iteration: 0 },
    ),
    frame(
      { value: firstQuotient, digits: 1, iteration: 1, condition: firstQuotient !== 0 },
      { tokens: tokenFrames[1], branchOutcome: firstQuotient !== 0, iteration: 1 },
    ),
    frame(
      { value: 0, digits, iteration: digits, condition: false },
      { tokens: tokenFrames[2], branchOutcome: false, iteration: digits },
    ),
    frame(
      { value: 0, digits, iteration: digits, condition: false },
      { tokens: tokenFrames[3], branchOutcome: false, iteration: digits },
    ),
  ]);
}

function averageEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [count, ...values] = exactIntegers(run);
  if (values.length !== count)
    throw new RangeError("FOA lesson 27 count does not match its values");
  const sum = values.reduce((total, value) => total + value, 0);
  const average = sum / count;
  assertOutput(run, `${average.toFixed(2)}\n`);
  const tokenFrames = tokenTimeline(verifiedTokens(run, values.map(String)));
  return buildFrames(run, mechanism, [
    frame(
      { count, readIndex: 0, sum: 0, average: PENDING },
      { tokens: tokenFrames[0], iteration: 0 },
    ),
    frame(
      { count, readIndex: Math.min(1, count), sum: values[0] ?? 0, average: PENDING },
      { tokens: tokenFrames[1], iteration: Math.min(1, count) },
    ),
    frame(
      { count, readIndex: count, sum, average: average.toFixed(2) },
      { tokens: tokenFrames[2], iteration: count },
    ),
    frame(
      { count, readIndex: count, sum, average: average.toFixed(2) },
      { tokens: tokenFrames[3], iteration: count },
    ),
  ]);
}

function maximumScanEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [count, ...values] = exactIntegers(run);
  if (values.length !== count || values.length === 0) {
    throw new RangeError("FOA lesson 28 requires a non-empty counted sequence");
  }
  let maximum = values[0]!;
  const updates = [maximum];
  for (const challenger of values.slice(1)) {
    if (challenger > maximum) {
      maximum = challenger;
      updates.push(maximum);
    }
  }
  assertOutput(run, `${String(maximum)}\n`);
  const tokenFrames = tokenTimeline(verifiedTokens(run, values.map(String)));
  const lastChallenger = values.at(-1)!;
  const maximumBeforeLast = Math.max(...values.slice(0, -1));
  return buildFrames(run, mechanism, [
    frame(
      {
        values: values.join(" "),
        challenger: values[0]!,
        maximum: values[0]!,
        updates: String(values[0]),
      },
      { tokens: tokenFrames[0], iteration: 0 },
    ),
    frame(
      {
        values: values.join(" "),
        challenger: values[1] ?? values[0]!,
        maximum: Math.max(values[0]!, values[1] ?? values[0]!),
        updates: updates.slice(0, 2).join(" → "),
      },
      {
        tokens: tokenFrames[1],
        branchOutcome: (values[1] ?? values[0]!) > values[0]!,
        iteration: Math.min(1, values.length - 1),
      },
    ),
    frame(
      {
        values: values.join(" "),
        challenger: lastChallenger,
        maximum,
        updates: updates.join(" → "),
      },
      {
        tokens: tokenFrames[2],
        branchOutcome: values.length === 1 ? null : lastChallenger > maximumBeforeLast,
        iteration: values.length - 1,
      },
    ),
    frame(
      {
        values: values.join(" "),
        challenger: lastChallenger,
        maximum,
        updates: updates.join(" → "),
      },
      { tokens: tokenFrames[3], iteration: values.length - 1 },
    ),
  ]);
}

function triangleEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [rows] = exactIntegers(run, 1);
  const valid = rows >= 0;
  const lines = valid ? Array.from({ length: rows }, (_, index) => "*".repeat(index + 1)) : [];
  const expected = lines.length === 0 ? "" : `${lines.join("\n")}\n`;
  assertOutput(run, expected);
  const tokenFrames = tokenTimeline(verifiedTokens(run, lines));
  return buildFrames(run, mechanism, [
    frame(
      { rows, row: 0, column: 0, grid: "∅" },
      { tokens: tokenFrames[0], branchOutcome: valid, iteration: 0 },
    ),
    frame(
      {
        rows,
        row: valid && rows > 0 ? 1 : 0,
        column: valid && rows > 0 ? 1 : 0,
        grid: lines[0] ?? "∅",
      },
      { tokens: tokenFrames[1], branchOutcome: valid, iteration: valid && rows > 0 ? 1 : 0 },
    ),
    frame(
      { rows, row: valid ? rows : 0, column: valid ? rows : 0, grid: lines.join(" / ") || "∅" },
      { tokens: tokenFrames[2], branchOutcome: valid, iteration: valid ? rows : 0 },
    ),
    frame(
      { rows, row: valid ? rows : 0, column: 0, grid: lines.join(" / ") || "∅" },
      { tokens: tokenFrames[3], branchOutcome: valid, iteration: valid ? rows : 0 },
    ),
  ]);
}

function primeEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [candidate] = exactIntegers(run, 1);
  let divisor = 2;
  const tested: number[] = [];
  let prime = candidate >= 2;
  while (prime && divisor <= Math.trunc(candidate / divisor)) {
    tested.push(divisor);
    if (candidate % divisor === 0) prime = false;
    divisor += 1;
  }
  const result = prime ? "prime" : "composite";
  const found = tested.find((value) => candidate % value === 0) ?? null;
  assertOutput(run, `${result}\n`);
  const tokenFrames = tokenTimeline(verifiedTokens(run, compactNumberEvidence(tested)));
  return buildFrames(run, mechanism, [
    frame(
      {
        candidate,
        divisor: 2,
        remainder: PENDING,
        primeStatus: candidate >= 2 ? "candidate" : "composite",
      },
      { tokens: tokenFrames[0], branchOutcome: candidate >= 2, iteration: 0 },
    ),
    frame(
      {
        candidate,
        divisor: tested[0] ?? 2,
        remainder: tested.length > 0 ? candidate % tested[0]! : NOT_EVALUATED,
        primeStatus: "testing",
      },
      { tokens: tokenFrames[1], iteration: tested.length > 0 ? 1 : 0 },
    ),
    frame(
      {
        candidate,
        divisor: found ?? tested.at(-1) ?? 2,
        remainder: found === null ? NOT_EVALUATED : 0,
        primeStatus: result,
      },
      { tokens: tokenFrames[2], branchOutcome: prime, iteration: tested.length },
    ),
    frame(
      {
        candidate,
        divisor: found ?? tested.at(-1) ?? 2,
        remainder: found === null ? NOT_EVALUATED : 0,
        primeStatus: result,
      },
      { tokens: tokenFrames[3], branchOutcome: prime, iteration: tested.length },
    ),
  ]);
}

function euclidEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [originalA, originalB] = exactIntegers(run, 2);
  const valid = originalA > 0 && originalB > 0;
  let a = originalA;
  let b = originalB;
  const states: { readonly a: number; readonly b: number; readonly remainder: number }[] = [];
  if (valid) {
    while (b !== 0) {
      const remainder = a % b;
      states.push({ a, b, remainder });
      a = b;
      b = remainder;
    }
  }
  assertOutput(run, valid ? `${String(a)}\n` : "");
  const first = states[0];
  const last = states.at(-1);
  const tokenFrames = tokenTimeline(
    verifiedTokens(
      run,
      states.map(({ remainder }) => String(remainder)),
    ),
  );
  return buildFrames(run, mechanism, [
    frame(
      {
        a: originalA,
        b: originalB,
        remainder: PENDING,
        round: 0,
        measure: valid ? String(originalB) : UNAVAILABLE,
      },
      { tokens: tokenFrames[0], branchOutcome: valid, iteration: 0 },
    ),
    frame(
      {
        a: first?.a ?? originalA,
        b: first?.b ?? originalB,
        remainder: first?.remainder ?? UNAVAILABLE,
        round: first === undefined ? 0 : 1,
        measure:
          first === undefined ? UNAVAILABLE : `${String(first.b)} → ${String(first.remainder)}`,
      },
      {
        tokens: tokenFrames[1],
        branchOutcome: valid,
        iteration: first === undefined ? 0 : 1,
      },
    ),
    frame(
      {
        a: last === undefined ? originalA : last.b,
        b: last?.remainder ?? originalB,
        remainder: last?.remainder ?? UNAVAILABLE,
        round: states.length,
        measure: valid
          ? states
              .map(({ b: value }) => String(value))
              .concat("0")
              .join(" → ")
          : UNAVAILABLE,
      },
      { tokens: tokenFrames[2], branchOutcome: valid, iteration: states.length },
    ),
    frame(
      {
        a: valid ? a : originalA,
        b: valid ? 0 : originalB,
        remainder: valid ? 0 : UNAVAILABLE,
        round: states.length,
        measure: valid
          ? states
              .map(({ b: value }) => String(value))
              .concat("0")
              .join(" → ")
          : UNAVAILABLE,
      },
      { tokens: tokenFrames[3], branchOutcome: valid, iteration: states.length },
    ),
  ]);
}

function squareCallEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [argument] = exactIntegers(run, 1);
  const result = argument * argument;
  assertOutput(run, `${String(result)}\n`);
  const activeFrame = stackFrame(
    "square",
    `square(${String(argument)})`,
    `square(${String(argument)})`,
    "active",
  );
  const returnedFrame = stackFrame(
    "square",
    `square(${String(argument)})`,
    `square(${String(argument)})`,
    "returned",
  );
  const link = memoryLink(
    "argument-parameter",
    "argument",
    "parameter",
    "按值复制",
    "Copy by value",
  );
  return buildFrames(run, mechanism, [
    frame(
      { argument, parameter: UNAVAILABLE, localResult: PENDING, returnValue: PENDING },
      {
        stackFrames: [stackFrame("caller", "main 调用点", "main call site", "active")],
      },
    ),
    frame(
      { argument, parameter: argument, localResult: PENDING, returnValue: PENDING },
      { stackFrames: [activeFrame], memoryLinks: [link] },
    ),
    frame(
      { argument, parameter: argument, localResult: result, returnValue: PENDING },
      { stackFrames: [activeFrame], memoryLinks: [link] },
    ),
    frame(
      { argument, parameter: argument, localResult: result, returnValue: result },
      { stackFrames: [returnedFrame], memoryLinks: [link] },
    ),
  ]);
}

function absoluteEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [argument] = exactIntegers(run, 1);
  const valid = argument !== -2_147_483_648;
  const result = Math.abs(argument);
  assertOutput(run, valid ? `${String(result)}\n` : "");
  return buildFrames(run, mechanism, [
    frame({ argument, precondition: PENDING, returnValue: PENDING }),
    frame({ argument, precondition: valid, returnValue: PENDING }, { branchOutcome: valid }),
    frame(
      { argument, precondition: valid, returnValue: valid ? result : UNAVAILABLE },
      { branchOutcome: valid },
    ),
    frame(
      { argument, precondition: valid, returnValue: valid ? result : NO_OUTPUT },
      { branchOutcome: valid },
    ),
  ]);
}

function boundedArrayEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [countValue, ...values] = exactIntegers(run);
  if (countValue === undefined) {
    throw new RangeError("FOA lesson 52 requires a count token");
  }
  const count = countValue;
  const capacity = 5;
  const valid = count >= 0 && count <= capacity;
  if (valid && values.length !== count) {
    throw new RangeError("FOA lesson 52 count does not match its values");
  }
  const last = values.at(-1) ?? 0;
  assertOutput(run, valid ? `${String(last)}\n` : "");
  const tokenFrames = tokenTimeline(verifiedTokens(run, valid ? values.map(String) : []));
  return buildFrames(run, mechanism, [
    frame(
      { count, capacity, writeIndex: PENDING, storedValues: PENDING },
      { tokens: tokenFrames[0], branchOutcome: valid, iteration: 0 },
    ),
    frame(
      { count, capacity, writeIndex: 0, storedValues: valid ? "∅" : UNAVAILABLE },
      { tokens: tokenFrames[1], branchOutcome: valid, iteration: 0 },
    ),
    frame(
      {
        count,
        capacity,
        writeIndex: valid ? count : 0,
        storedValues: valid ? values.join(" ") || "∅" : UNAVAILABLE,
      },
      { tokens: tokenFrames[2], branchOutcome: valid, iteration: valid ? count : 0 },
    ),
    frame(
      {
        count,
        capacity,
        writeIndex: valid ? count : 0,
        storedValues: valid ? values.join(" ") || "∅" : UNAVAILABLE,
      },
      { tokens: tokenFrames[3], branchOutcome: valid, iteration: valid ? count : 0 },
    ),
  ]);
}

function weekdayEvidence(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
): readonly FoaInteractiveRuntimeEvidenceFrame[] {
  const [index] = exactIntegers(run, 1);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  const valid = index >= 0 && index < weekdays.length;
  const day = valid ? weekdays[index]! : null;
  assertOutput(run, day === null ? "" : `${day}\n`);
  return buildFrames(run, mechanism, [
    frame({ index, rangeGuard: PENDING, tableCell: PENDING, weekday: PENDING }),
    frame(
      {
        index,
        rangeGuard: valid,
        tableCell: valid ? `days[${String(index)}]` : UNAVAILABLE,
        weekday: PENDING,
      },
      { branchOutcome: valid },
    ),
    frame(
      {
        index,
        rangeGuard: valid,
        tableCell: valid ? `days[${String(index)}]` : UNAVAILABLE,
        weekday: day ?? UNAVAILABLE,
      },
      { branchOutcome: valid },
    ),
    frame(
      {
        index,
        rangeGuard: valid,
        tableCell: valid ? `days[${String(index)}]` : UNAVAILABLE,
        weekday: day ?? NO_OUTPUT,
      },
      { branchOutcome: valid },
    ),
  ]);
}

function frame(
  values: StateInput,
  extras: FrameExtras = {},
): FoaRuntimeEvidenceSnapshotInput & { readonly values: StateInput } {
  const localizedValues = Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([id, value]) => [
        id,
        typeof value === "boolean"
          ? foaText(value ? "成立" : "不成立", value ? "True" : "False")
          : value,
      ]),
    ) as Record<string, FoaLocalizedText | string | number>,
  );
  const tokens = Object.freeze(
    (extras.tokens ?? []).map((token, index) =>
      runtimeToken(token.id, `token ${String(index + 1)}`, token.value),
    ),
  );
  const activeTokenIds = Object.freeze(
    (extras.tokens ?? []).flatMap((token) => (token.status === "active" ? [token.id] : [])),
  );
  const stackFrames = Object.freeze(
    (extras.stackFrames ?? []).map((stack) =>
      runtimeStackFrame(stack.id, stack.label.zh, stack.status, stack.label.en),
    ),
  );
  const activeStackFrameId =
    extras.stackFrames?.find((stack) => stack.status === "active")?.id ?? null;
  const memoryLinks = Object.freeze(
    (extras.memoryLinks ?? []).map((link) =>
      runtimeMemoryLink(link.id, link.fromFieldId, link.toFieldId, link.label.zh, link.label.en),
    ),
  );
  return Object.freeze({
    values: localizedValues,
    stateValues: localizedValues,
    branchOutcome: extras.branchOutcome ?? null,
    iteration: extras.iteration ?? null,
    tokens,
    activeTokenIds,
    stackFrames,
    activeStackFrameId,
    memoryLinks,
    activeMemoryLinkId: memoryLinks[0]?.id ?? null,
  });
}

function buildFrames(
  run: FoaInteractiveRun,
  mechanism: FoaSceneMechanism,
  inputs: readonly (FoaRuntimeEvidenceSnapshotInput & { readonly values: StateInput })[],
): readonly FoaRuntimeEvidenceSnapshot[] {
  const fieldIds = mechanism.stateShape.map(({ id }) => id).sort();
  inputs.forEach((input, index) => {
    if (Object.keys(input.values).sort().join("\0") !== fieldIds.join("\0")) {
      throw new RangeError(
        `FOA lesson ${String(run.order)} frame ${String(index + 1)} does not exactly match its state shape`,
      );
    }
    if (
      input.branchOutcome !== undefined &&
      input.branchOutcome !== null &&
      typeof input.branchOutcome !== "boolean"
    ) {
      throw new TypeError(
        `FOA lesson ${String(run.order)} frame ${String(index + 1)} has an invalid branch outcome`,
      );
    }
    if (
      input.iteration !== undefined &&
      input.iteration !== null &&
      (!Number.isInteger(input.iteration) || input.iteration < 0)
    ) {
      throw new RangeError(
        `FOA lesson ${String(run.order)} frame ${String(index + 1)} has an invalid iteration`,
      );
    }
  });
  const hasStructuredTokens = inputs.some((input) => (input.tokens?.length ?? 0) > 0);
  if (
    mechanism.learnerControl === "drag" &&
    hasStructuredTokens &&
    !inputs.some((input) => (input.activeTokenIds?.length ?? 0) > 0)
  ) {
    throw new RangeError(`FOA lesson ${String(run.order)} drag evidence requires an active token`);
  }
  if (
    mechanism.learnerControl === "connect" &&
    !inputs.some((input) => (input.memoryLinks?.length ?? 0) > 0)
  ) {
    throw new RangeError(`FOA lesson ${String(run.order)} connect evidence requires a memory link`);
  }
  if (
    mechanism.learnerControl === "push-pop" &&
    !inputs.some((input) => (input.stackFrames?.length ?? 0) > 0)
  ) {
    throw new RangeError(
      `FOA lesson ${String(run.order)} push-pop evidence requires a stack frame`,
    );
  }
  return defineFoaCourseRuntimeEvidence(getFoaSceneProfile(run.order), inputs).frames;
}

function tokenTimeline(
  values: readonly string[],
  stopIndex?: number,
): readonly [
  readonly StagedToken[],
  readonly StagedToken[],
  readonly StagedToken[],
  readonly StagedToken[],
] {
  const first = values.length === 0 ? null : 0;
  const second = values.length < 2 ? first : 1;
  const last = values.length === 0 ? null : (stopIndex ?? values.length - 1);
  const activeAt = [first, second, last, null] as const;
  return Object.freeze(
    activeAt.map((activeIndex, frameIndex) =>
      Object.freeze(
        values.map((value, index) =>
          Object.freeze({
            id: `token.${String(index + 1)}`,
            value,
            status:
              frameIndex === 3
                ? "consumed"
                : activeIndex === index
                  ? "active"
                  : activeIndex !== null && index < activeIndex
                    ? "consumed"
                    : "pending",
          } as StagedToken),
        ),
      ),
    ),
  ) as unknown as readonly [
    readonly StagedToken[],
    readonly StagedToken[],
    readonly StagedToken[],
    readonly StagedToken[],
  ];
}

function verifiedTokens(run: FoaInteractiveRun, expected: readonly string[]): readonly string[] {
  if (
    run.tokens.length !== expected.length ||
    run.tokens.some((value, index) => value !== expected[index])
  ) {
    throw new RangeError(
      `FOA lesson ${String(run.order)} runtime tokens do not match its input state`,
    );
  }
  return run.tokens;
}

function compactNumberEvidence(values: readonly number[]): readonly string[] {
  if (values.length <= 8) return values.map(String);
  return [
    ...values.slice(0, 4).map(String),
    `… ${String(values.length - 6)} more …`,
    ...values.slice(-2).map(String),
  ];
}

function stackFrame(
  id: string,
  zh: string,
  en: string,
  status: FoaRuntimeStackStatus,
): StagedStackFrame {
  return Object.freeze({ id, label: foaText(zh, en), status });
}

function memoryLink(
  id: string,
  fromFieldId: string,
  toFieldId: string,
  zh: string,
  en: string,
): StagedMemoryLink {
  return Object.freeze({ id, fromFieldId, toFieldId, label: foaText(zh, en) });
}

function exactIntegers(run: FoaInteractiveRun, expectedCount: 1): [number];
function exactIntegers(run: FoaInteractiveRun, expectedCount: 2): [number, number];
function exactIntegers(run: FoaInteractiveRun): number[];
function exactIntegers(run: FoaInteractiveRun, expectedCount?: number): number[] {
  const rawTokens = run.stdin.trim().split(/\s+/u).filter(Boolean);
  if (expectedCount !== undefined && rawTokens.length !== expectedCount) {
    throw new RangeError(`FOA lesson ${String(run.order)} has an unexpected integer count`);
  }
  return rawTokens.map((token) => {
    if (!/^[+-]?\d+$/u.test(token)) {
      throw new RangeError(`FOA lesson ${String(run.order)} has a non-integer runtime token`);
    }
    const value = Number(token);
    if (!Number.isSafeInteger(value)) throw new RangeError("FOA runtime integer is not safe");
    return value;
  });
}

function oneDecimal(run: FoaInteractiveRun): number {
  const raw = run.stdin.trim();
  if (raw.length === 0 || !Number.isFinite(Number(raw))) {
    throw new RangeError(`FOA lesson ${String(run.order)} requires one finite decimal`);
  }
  return Number(raw);
}

function scanfIntegerPrefix(raw: string): number | null {
  const prefix = /^[+-]?\d+/u.exec(raw)?.[0];
  if (prefix === undefined) return null;
  const parsed = Number(prefix);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function assertOutput(run: FoaInteractiveRun, expected: string): void {
  if (run.stdout !== expected) {
    throw new RangeError(`FOA lesson ${String(run.order)} runtime output does not match its state`);
  }
}

function assertEvidenceOutcome(
  run: FoaInteractiveRun,
  frames: readonly FoaRuntimeEvidenceSnapshot[],
): void {
  const finalFrame = frames.at(-1);
  if (finalFrame === undefined) {
    throw new RangeError(`FOA lesson ${String(run.order)} has no runtime evidence frames`);
  }
  const expectedOutcome =
    (run.order === 9 || run.order === 50) && finalFrame.branchOutcome === false
      ? "scan-failed"
      : run.stdout.length === 0 && finalFrame.branchOutcome === false
        ? "range-rejected"
        : "success";
  if (run.outcome !== expectedOutcome) {
    throw new RangeError(
      `FOA lesson ${String(run.order)} runtime outcome does not match its state`,
    );
  }
  const expectedExitStatus = expectedOutcome === "range-rejected" ? 1 : 0;
  if (run.exitStatus !== expectedExitStatus) {
    throw new RangeError(
      `FOA lesson ${String(run.order)} runtime exit status does not match its outcome`,
    );
  }
}

function assertRuntimeTokens(
  run: FoaInteractiveRun,
  frames: readonly FoaRuntimeEvidenceSnapshot[],
): void {
  if (run.tokens.length === 0) return;
  const finalTokenValues = frames.at(-1)?.tokens.map(({ value }) => value.en) ?? [];
  if (
    finalTokenValues.length !== run.tokens.length ||
    finalTokenValues.some((value, index) => value !== run.tokens[index])
  ) {
    throw new RangeError(
      `FOA lesson ${String(run.order)} runtime tokens do not match its structured evidence`,
    );
  }
}

function assertRun(run: FoaInteractiveRun): void {
  if (run === null || typeof run !== "object")
    throw new TypeError("FOA interactive run is required");
  if (!FOA_INTERACTIVE_RUNTIME_EVIDENCE_ORDERS.includes(run.order as never)) {
    throw new RangeError(`FOA lesson ${String(run.order)} is not an interactive shared lesson`);
  }
  if (typeof run.stdin !== "string" || typeof run.stdout !== "string") {
    throw new TypeError("FOA interactive run I/O must be strings");
  }
  if (
    run.outcome !== "success" &&
    run.outcome !== "scan-failed" &&
    run.outcome !== "range-rejected"
  ) {
    throw new RangeError("FOA interactive run has an invalid outcome");
  }
}

function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(12)));
}
