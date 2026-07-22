import { foaText, type FoaLocalizedText } from "./foa-contracts.js";
import {
  defineFoaCourseRuntimeEvidence,
  runtimeMemoryLink,
  runtimeStackFrame,
  runtimeText,
  runtimeToken,
  type FoaCourseRuntimeEvidence,
  type FoaRuntimeEvidenceSnapshotInput,
} from "./foa-runtime-evidence-contracts.js";
import { getFoaSceneProfile } from "./foa-scene-profiles.js";

const FIXED_ORDERS = Object.freeze([
  1, 3, 4, 6, 7, 8, 10, 11, 24, 33, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 48, 49, 51, 53,
  55, 56, 57, 58,
] as const);

type FoaRuntimeTokenStatus = "pending" | "active" | "consumed" | "retained" | "rejected" | "output";

type TextInput = string | readonly [zh: string, en: string];
type StateInput = Readonly<Record<string, TextInput>>;
type TokenInput = readonly [
  id: string,
  label: TextInput,
  value: TextInput,
  status: FoaRuntimeTokenStatus,
];
type StackInput = readonly [
  id: string,
  label: TextInput,
  bindings: Readonly<Record<string, TextInput>>,
  active: boolean,
];
type LinkInput = readonly [id: string, from: string, to: string, label: TextInput, active: boolean];

interface SnapshotExtras {
  readonly tokens?: readonly TokenInput[];
  readonly activeTokenIndices?: readonly number[];
  readonly activeTokenIds?: readonly string[];
  readonly stackFrames?: readonly StackInput[];
  readonly activeStackFrameId?: string | null;
  readonly memoryLinks?: readonly LinkInput[];
  readonly activeMemoryLinkId?: string | null;
  readonly branchOutcome?: boolean | null;
  readonly iteration?: number | null;
}

export interface FoaFixedRuntimeCaseIo {
  readonly stdin: string;
  readonly stdout: string;
}

const CASE_IO: Record<number, FoaFixedRuntimeCaseIo> = {};

const EVIDENCE: Readonly<Record<number, FoaCourseRuntimeEvidence>> = Object.freeze({
  1: course(1, "", "Hello, algorithm!\n", [
    snap({
      programCounter: ["进入 main", "enter main"],
      stdout: "∅",
      exitStatus: ["运行中", "running"],
    }),
    snap({
      programCounter: "puts",
      stdout: "Hello, algorithm!",
      exitStatus: ["运行中", "running"],
    }),
    snap({
      programCounter: ["离开 main", "leave main"],
      stdout: "Hello, algorithm!",
      exitStatus: "0",
    }),
    snap({
      programCounter: ["进程结束", "process ended"],
      stdout: "Hello, algorithm!",
      exitStatus: ["成功 0", "success 0"],
    }),
  ]),
  3: course(3, "", "run\n", [
    snap({
      source: ["源文件就绪", "source ready"],
      compileStatus: ["未开始", "not started"],
      runStatus: ["已阻塞", "blocked"],
      stdout: "∅",
    }),
    snap({
      source: ["翻译单元", "translation unit"],
      compileStatus: ["通过", "passed"],
      runStatus: ["可启动", "ready"],
      stdout: "∅",
    }),
    snap({
      source: ["可执行文件", "executable"],
      compileStatus: ["通过", "passed"],
      runStatus: ["运行中", "running"],
      stdout: "run",
    }),
    snap({
      source: ["可执行文件", "executable"],
      compileStatus: ["通过", "passed"],
      runStatus: ["退出 0", "exit 0"],
      stdout: "run",
    }),
  ]),
  4: course(4, "", "6\n", [
    snap(
      { total: "0", rhs: "0", writeHistory: "[0]", stdout: "∅" },
      {
        tokens: operationTokens("write", ["0", "+2", "×3", "6"], 0),
        activeTokenIds: ["write-0"],
        memoryLinks: [["total-init", "0", "total", ["初始化", "initialise"], true]],
      },
    ),
    snap(
      { total: "2", rhs: "0 + 2 = 2", writeHistory: "[0, 2]", stdout: "∅" },
      {
        tokens: operationTokens("write", ["0", "+2", "×3", "6"], 1),
        activeTokenIds: ["write-1"],
        memoryLinks: [["total-add", "rhs 2", "total", ["+= 写回", "+= write-back"], true]],
      },
    ),
    snap(
      { total: "6", rhs: "2 × 3 = 6", writeHistory: "[0, 2, 6]", stdout: "∅" },
      {
        tokens: operationTokens("write", ["0", "+2", "×3", "6"], 2),
        activeTokenIds: ["write-2"],
        memoryLinks: [["total-multiply", "rhs 6", "total", ["*= 写回", "*= write-back"], true]],
      },
    ),
    snap(
      { total: "6", rhs: "6", writeHistory: "[0, 2, 6]", stdout: "6" },
      { tokens: operationTokens("write", ["0", "+2", "×3", "6"], 3), activeTokenIds: ["write-3"] },
    ),
  ]),
  6: course(6, "", "12\n", [
    snap(
      {
        itemCount: ["int · 未绑定", "int · unbound"],
        itemPrice: ["int · 未绑定", "int · unbound"],
        product: "∅",
        stdout: "∅",
      },
      {
        memoryLinks: [
          ["bind-count", "item_count", "3", ["连接首个标识符", "connect first identifier"], true],
        ],
        activeMemoryLinkId: "bind-count",
      },
    ),
    snap(
      {
        itemCount: "int · 3",
        itemPrice: ["int · 未绑定", "int · unbound"],
        product: "∅",
        stdout: "∅",
      },
      { memoryLinks: [["bind-count", "item_count", "3", ["名称 → 对象", "name → object"], true]] },
    ),
    snap(
      { itemCount: "int · 3", itemPrice: "int · 4", product: "3 × 4 = 12", stdout: "∅" },
      {
        memoryLinks: [
          ["bind-count", "item_count", "3", ["名称 → 对象", "name → object"], false],
          ["bind-price", "item_price", "4", ["名称 → 对象", "name → object"], true],
        ],
      },
    ),
    snap(
      { itemCount: "int · 3", itemPrice: "int · 4", product: "12", stdout: "12" },
      {
        memoryLinks: [
          ["product-output", "product 12", "stdout", ["连接输出", "connect output"], true],
        ],
        activeMemoryLinkId: "product-output",
      },
    ),
  ]),
  7: course(7, "", "8/10\n", [
    snap(
      {
        limit: ["10 · 只读", "10 · read-only"],
        used: "6",
        writePermission: ["未选择", "not chosen"],
        usage: "6/10",
      },
      { memoryLinks: [["limit-lock", "write", "limit", ["锁定", "locked"], false]] },
    ),
    snap(
      {
        limit: ["10 · 只读", "10 · read-only"],
        used: "6",
        writePermission: ["limit：拒绝", "limit: denied"],
        usage: "6/10",
      },
      {
        branchOutcome: false,
        memoryLinks: [["limit-lock", "write", "limit", ["不可写", "not writable"], true]],
      },
    ),
    snap(
      {
        limit: ["10 · 只读", "10 · read-only"],
        used: "8",
        writePermission: ["used：允许", "used: allowed"],
        usage: "8/10",
      },
      {
        branchOutcome: true,
        memoryLinks: [["used-write", "+2", "used", ["合法写回", "legal write-back"], true]],
      },
    ),
    snap({
      limit: ["10 · 只读", "10 · read-only"],
      used: "8",
      writePermission: ["已完成", "complete"],
      usage: "8/10",
    }),
  ]),
  8: course(8, "", "14 20\n", [
    snap(
      {
        unparenthesized: "2 + 3 × 4",
        parenthesized: "(2 + 3) × 4",
        operatorOrder: ["待求值", "pending"],
        results: "∅",
      },
      { tokens: expressionTokens("pending", "pending"), activeTokenIds: ["plain-tree"] },
    ),
    snap(
      {
        unparenthesized: "2 + 12",
        parenthesized: "(2 + 3) × 4",
        operatorOrder: ["先乘法", "multiply first"],
        results: "14 · ∅",
      },
      { tokens: expressionTokens("consumed", "pending"), activeTokenIds: ["plain-multiply"] },
    ),
    snap(
      {
        unparenthesized: "14",
        parenthesized: "5 × 4",
        operatorOrder: ["括号先算", "parentheses first"],
        results: "14 · 20",
      },
      { tokens: expressionTokens("consumed", "consumed"), activeTokenIds: ["grouped-add"] },
    ),
    snap(
      {
        unparenthesized: "14",
        parenthesized: "20",
        operatorOrder: ["两树完成", "both trees complete"],
        results: "14 · 20",
      },
      { tokens: expressionTokens("output", "output"), activeTokenIds: ["grouped-tree"] },
    ),
  ]),
  10: course(10, "", "0.667\n", [
    snap({ internalValue: "0.666666…", format: "%f", roundedText: ["未格式化", "unformatted"] }),
    snap({ internalValue: "0.666666…", format: "%.1f", roundedText: "0.7" }),
    snap({ internalValue: "0.666666…", format: "%.2f", roundedText: "0.67" }),
    snap({ internalValue: "0.666666…", format: "%.3f", roundedText: "0.667" }),
  ]),
  11: course(11, "", "30\n", [
    snap(
      { scoreBefore: "10", rhs: "10", scoreAfter: "10", stdout: "∅" },
      {
        tokens: operationTokens("score", ["10", "+5", "×2", "30"], 0),
        activeTokenIds: ["score-0"],
        memoryLinks: [["score-initial", "10", "score", ["初始化", "initialise"], true]],
      },
    ),
    snap(
      { scoreBefore: "10", rhs: "10 + 5 = 15", scoreAfter: "15", stdout: "∅" },
      {
        tokens: operationTokens("score", ["10", "+5", "×2", "30"], 1),
        activeTokenIds: ["score-1"],
        memoryLinks: [["score-add", "15", "score", ["右值写回", "RHS write-back"], true]],
      },
    ),
    snap(
      { scoreBefore: "15", rhs: "15 × 2 = 30", scoreAfter: "30", stdout: "∅" },
      {
        tokens: operationTokens("score", ["10", "+5", "×2", "30"], 2),
        activeTokenIds: ["score-2"],
        memoryLinks: [["score-scale", "30", "score", ["右值写回", "RHS write-back"], true]],
      },
    ),
    snap(
      { scoreBefore: "30", rhs: "30", scoreAfter: "30", stdout: "30" },
      {
        tokens: operationTokens("score", ["10", "+5", "×2", "30"], 3),
        activeTokenIds: ["score-3"],
      },
    ),
  ]),
  24: course(24, "", "1157\n", [
    snap(
      { period: "0", balance: "1000¢", interest: "0¢", discarded: "0" },
      {
        tokens: operationTokens("period", ["1000", "1050", "1102", "1157"], 0),
        activeTokenIds: ["period-0"],
        iteration: 0,
      },
    ),
    snap(
      { period: "1", balance: "1050¢", interest: "50¢", discarded: "0.00¢" },
      {
        tokens: operationTokens("period", ["1000", "1050", "1102", "1157"], 1),
        activeTokenIds: ["period-1"],
        iteration: 1,
      },
    ),
    snap(
      { period: "2", balance: "1102¢", interest: "52¢", discarded: "0.50¢" },
      {
        tokens: operationTokens("period", ["1000", "1050", "1102", "1157"], 2),
        activeTokenIds: ["period-2"],
        iteration: 2,
      },
    ),
    snap(
      { period: "3", balance: "1157¢", interest: "55¢", discarded: "0.10¢" },
      {
        tokens: operationTokens("period", ["1000", "1050", "1102", "1157"], 3),
        activeTokenIds: ["period-3"],
        iteration: 3,
      },
    ),
  ]),
  33: course(33, "", "12\n", [
    snap(
      {
        prototype: "int add(int, int)",
        call: ["未核对", "unchecked"],
        definition: ["未核对", "unchecked"],
        match: ["待定", "pending"],
      },
      {
        memoryLinks: [
          ["prototype-call", "prototype", "call", ["连接签名", "connect signature"], true],
        ],
        activeMemoryLinkId: "prototype-call",
      },
    ),
    snap(
      {
        prototype: "int add(int, int)",
        call: "add(7, 5) → int",
        definition: ["未核对", "unchecked"],
        match: ["部分一致", "partial match"],
      },
      {
        memoryLinks: [
          [
            "prototype-call-parameters",
            "prototype",
            "call",
            ["参数 int, int", "parameters int, int"],
            true,
          ],
        ],
      },
    ),
    snap(
      {
        prototype: "int add(int, int)",
        call: "add(7, 5) → int",
        definition: "int add(int, int)",
        match: ["返回类型一致", "return types match"],
      },
      {
        memoryLinks: [
          [
            "prototype-definition",
            "prototype",
            "definition",
            ["返回类型 int", "return type int"],
            true,
          ],
        ],
      },
    ),
    snap(
      {
        prototype: ["四项核对完成", "four checks passed"],
        call: "add(7, 5)",
        definition: ["返回 12", "returns 12"],
        match: ["已核对", "checked"],
      },
      {
        memoryLinks: [
          ["definition-return", "definition", "call", ["返回值 12", "returned value 12"], true],
        ],
        activeMemoryLinkId: "definition-return",
      },
    ),
  ]),
  35: course(35, "", "10\n", [
    snap({
      value: "14",
      lowerGuard: ["待检查", "pending"],
      upperGuard: ["待检查", "pending"],
      clamped: ["未返回", "not returned"],
    }),
    snap(
      {
        value: "14",
        lowerGuard: "14 < 0 → false",
        upperGuard: ["待检查", "pending"],
        clamped: ["未返回", "not returned"],
      },
      { branchOutcome: false },
    ),
    snap(
      { value: "14", lowerGuard: "false", upperGuard: "14 > 10 → true", clamped: "10" },
      { branchOutcome: true },
    ),
    snap(
      {
        value: "14",
        lowerGuard: "false",
        upperGuard: "true",
        clamped: ["10 · 上界", "10 · upper bound"],
      },
      { branchOutcome: true },
    ),
  ]),
  36: course(36, "", "120\n", [
    snap(
      {
        n: "5",
        frames: "factorial(5)",
        baseCase: "5 <= 1 → false",
        product: ["待回卷", "pending unwind"],
      },
      { stackFrames: [["f5", "factorial(5)", { n: "5" }, true]], activeStackFrameId: "f5" },
    ),
    snap(
      { n: "1", frames: "5 → 4 → 3 → 2 → 1", baseCase: "1 <= 1 → true", product: "1" },
      { stackFrames: factorialFrames(1), activeStackFrameId: "f1", branchOutcome: true },
    ),
    snap(
      { n: "3", frames: "5 → 4 → 3", baseCase: ["已命中", "reached"], product: "1 × 2 × 3 = 6" },
      { stackFrames: factorialFrames(3), activeStackFrameId: "f3", iteration: 2 },
    ),
    snap(
      { n: "5", frames: "main", baseCase: ["回卷完成", "unwind complete"], product: "120" },
      {
        stackFrames: [["main", "main", { result: "120" }, true]],
        activeStackFrameId: "main",
        iteration: 4,
      },
    ),
  ]),
  37: course(37, "", "3.000\n", [
    snap(
      { target: "27", estimate: "27.0000", nextEstimate: "18.0123", error: "|g³−27| = 19656" },
      {
        tokens: operationTokens("estimate", ["27.0000", "18.0123", "12.0360", "3.0000"], 0),
        activeTokenIds: ["estimate-0"],
        iteration: 0,
      },
    ),
    snap(
      { target: "27", estimate: "18.0123", nextEstimate: "12.0360", error: "|g³−27| ≈ 5817" },
      {
        tokens: operationTokens("estimate", ["27.0000", "18.0123", "12.0360", "3.0000"], 1),
        activeTokenIds: ["estimate-1"],
        iteration: 1,
      },
    ),
    snap(
      { target: "27", estimate: "12.0360", nextEstimate: "8.0861", error: "|g³−27| ≈ 1717" },
      {
        tokens: operationTokens("estimate", ["27.0000", "18.0123", "12.0360", "3.0000"], 2),
        activeTokenIds: ["estimate-2"],
        iteration: 2,
      },
    ),
    snap(
      { target: "27", estimate: "3.0000", nextEstimate: "3.0000", error: "< 0.001" },
      {
        tokens: operationTokens("estimate", ["27.0000", "18.0123", "12.0360", "3.0000"], 3),
        activeTokenIds: ["estimate-3"],
        iteration: 20,
      },
    ),
  ]),
  38: course(38, "", "3/3\n", [
    snap(
      {
        cases: "(3,4→3) · (−2,−7→−7) · (5,5→5)",
        caseCursor: "row 1",
        actual: "min(3,4) = 3",
        verdict: ["通过 1/1", "pass 1/1"],
      },
      { tokens: testTableTokens(0), activeTokenIds: ["case-1"], iteration: 1 },
    ),
    snap(
      {
        cases: "(3,4→3) · (−2,−7→−7) · (5,5→5)",
        caseCursor: "row 2",
        actual: "min(−2,−7) = −7",
        verdict: ["通过 2/2", "pass 2/2"],
      },
      { tokens: testTableTokens(1), activeTokenIds: ["case-2"], iteration: 2 },
    ),
    snap(
      {
        cases: "(3,4→3) · (−2,−7→−7) · (5,5→5)",
        caseCursor: "row 3",
        actual: "min(5,5) = 5",
        verdict: ["通过 3/3", "pass 3/3"],
      },
      { tokens: testTableTokens(2), activeTokenIds: ["case-3"], iteration: 3 },
    ),
    snap(
      {
        cases: ["3 行已执行", "3 rows executed"],
        caseCursor: ["表尾", "end of table"],
        actual: ["全部匹配", "all matched"],
        verdict: "3/3",
      },
      { tokens: testTableTokens(3), iteration: 3 },
    ),
  ]),
  39: course(39, "", "inside=6\noutside=5\n", [
    snap(
      {
        callerValue: "value@main = 5",
        parameter: ["未创建", "not created"],
        mutatedCopy: "∅",
        callerAfter: "5",
      },
      {
        memoryLinks: [
          ["arg-copy", "value@main", "value@param", ["按值复制", "copy by value"], true],
        ],
        activeMemoryLinkId: "arg-copy",
      },
    ),
    snap(
      {
        callerValue: "value@main = 5",
        parameter: "value@param = 5",
        mutatedCopy: "5",
        callerAfter: "5",
      },
      {
        stackFrames: [
          ["main", "main", { value: "5" }, false],
          ["increment", "increment_copy", { value: "5" }, true],
        ],
        activeStackFrameId: "increment",
        memoryLinks: [["arg-copy", "value@main", "value@param", ["复制 5", "copy 5"], true]],
        activeMemoryLinkId: "arg-copy",
      },
    ),
    snap(
      {
        callerValue: "value@main = 5",
        parameter: "value@param = 6",
        mutatedCopy: "6",
        callerAfter: "5",
      },
      {
        stackFrames: [
          ["main", "main", { value: "5" }, false],
          ["increment", "increment_copy", { value: "6" }, true],
        ],
        activeStackFrameId: "increment",
        memoryLinks: [["copy-write", "value@param", "6", ["只改副本", "mutate copy only"], true]],
        activeMemoryLinkId: "copy-write",
      },
    ),
    snap(
      {
        callerValue: "value@main = 5",
        parameter: ["帧已销毁", "frame released"],
        mutatedCopy: ["已销毁", "released"],
        callerAfter: "5",
      },
      {
        stackFrames: [["main", "main", { value: "5" }, true]],
        activeStackFrameId: "main",
        memoryLinks: [["caller-check", "value@main", "outside", ["仍为 5", "still 5"], true]],
        activeMemoryLinkId: "caller-check",
      },
    ),
  ]),
  40: course(40, "", "12\n", [
    snap(
      {
        arguments: "−12",
        localResult: "∅",
        returnSlot: ["空", "empty"],
        callerValue: ["未赋值", "unassigned"],
      },
      { stackFrames: [["main", "main", { distance: "?" }, true]], activeStackFrameId: "main" },
    ),
    snap(
      {
        arguments: "value = −12",
        localResult: "12",
        returnSlot: ["空", "empty"],
        callerValue: ["等待", "waiting"],
      },
      {
        stackFrames: [
          ["main", "main", { distance: "?" }, false],
          ["distance", "distance_from_zero", { value: "−12", result: "12" }, true],
        ],
        activeStackFrameId: "distance",
      },
    ),
    snap(
      {
        arguments: "value = −12",
        localResult: "12",
        returnSlot: "12",
        callerValue: ["等待", "waiting"],
      },
      {
        stackFrames: [
          ["main", "main", { distance: "?" }, false],
          ["distance", "return", { slot: "12" }, true],
        ],
        activeStackFrameId: "distance",
      },
    ),
    snap(
      {
        arguments: "−12",
        localResult: ["帧已销毁", "frame released"],
        returnSlot: ["已消费", "consumed"],
        callerValue: "distance = 12",
      },
      { stackFrames: [["main", "main", { distance: "12" }, true]], activeStackFrameId: "main" },
    ),
  ]),
  41: course(41, "", "21\n", [
    snap(
      {
        input: "10",
        innerReturn: ["等待 twice", "waiting for twice"],
        outerReturn: ["等待 plus_one", "waiting for plus_one"],
        stdout: "∅",
      },
      {
        stackFrames: [["main", "main", { expression: "plus_one(twice(10))" }, true]],
        activeStackFrameId: "main",
      },
    ),
    snap(
      { input: "x = 10", innerReturn: "twice → 20", outerReturn: ["等待", "waiting"], stdout: "∅" },
      {
        stackFrames: [
          ["main", "main", { result: "?" }, false],
          ["twice", "twice", { x: "10", return: "20" }, true],
        ],
        activeStackFrameId: "twice",
      },
    ),
    snap(
      {
        input: "20",
        innerReturn: ["已传入外层", "passed outward"],
        outerReturn: "plus_one → 21",
        stdout: "∅",
      },
      {
        stackFrames: [
          ["main", "main", { result: "?" }, false],
          ["plus-one", "plus_one", { x: "20", return: "21" }, true],
        ],
        activeStackFrameId: "plus-one",
      },
    ),
    snap(
      { input: "10", innerReturn: "20", outerReturn: "21", stdout: "21" },
      { stackFrames: [["main", "main", { result: "21" }, true]], activeStackFrameId: "main" },
    ),
  ]),
  42: course(42, "", "success\n", [
    snap({ stdout: "∅", exitStatus: ["未设置", "unset"], processResult: ["运行中", "running"] }),
    snap({
      stdout: "success",
      exitStatus: ["未返回", "not returned"],
      processResult: ["运行中", "running"],
    }),
    snap({
      stdout: "success",
      exitStatus: "EXIT_SUCCESS = 0",
      processResult: ["等待退出", "awaiting exit"],
    }),
    snap({ stdout: "success", exitStatus: "0", processResult: ["成功", "success"] }),
  ]),
  43: course(43, "", "---\n", [
    snap(
      { call: ["尚未调用", "not called"], sideEffect: "∅", returnSlot: ["不存在", "absent"] },
      {
        stackFrames: [["main", "main", { next: "print_separator" }, true]],
        activeStackFrameId: "main",
      },
    ),
    snap(
      {
        call: "print_separator()",
        sideEffect: ["准备写 stdout", "ready to write stdout"],
        returnSlot: ["不存在", "absent"],
      },
      {
        stackFrames: [
          ["main", "main", { next: "print_separator" }, false],
          ["separator", "print_separator", { return: "void" }, true],
        ],
        activeStackFrameId: "separator",
      },
    ),
    snap(
      {
        call: ["函数体执行", "function body"],
        sideEffect: "---",
        returnSlot: ["不存在", "absent"],
      },
      {
        stackFrames: [
          ["main", "main", { next: "resume" }, false],
          ["separator", "print_separator", { stdout: "---" }, true],
        ],
        activeStackFrameId: "separator",
      },
    ),
    snap(
      {
        call: ["已返回 main", "returned to main"],
        sideEffect: "---",
        returnSlot: ["无返回值", "no return value"],
      },
      { stackFrames: [["main", "main", { status: "resumed" }, true]], activeStackFrameId: "main" },
    ),
  ]),
  44: course(44, "", "8 3\n", [
    snap(
      {
        outerValue: "value@outer = 3",
        innerValue: ["未进入作用域", "out of scope"],
        useSite: ["块之前", "before block"],
        resolvedBinding: "value → outer",
      },
      {
        memoryLinks: [
          [
            "outer-use",
            "value use",
            "value@outer",
            ["最近可见声明", "nearest visible declaration"],
            true,
          ],
        ],
        activeMemoryLinkId: "outer-use",
      },
    ),
    snap(
      {
        outerValue: "value@outer = 3",
        innerValue: "value@inner = 8",
        useSite: ["块内", "inside block"],
        resolvedBinding: "value → inner",
      },
      {
        memoryLinks: [
          ["inner-use", "value use", "value@inner", ["内层遮蔽", "inner shadows outer"], true],
        ],
        activeMemoryLinkId: "inner-use",
      },
    ),
    snap(
      {
        outerValue: "value@outer = 3",
        innerValue: "value@inner = 8",
        useSite: "printf → 8",
        resolvedBinding: "value → inner",
      },
      {
        memoryLinks: [["inner-print", "printf(value)", "value@inner", ["读取 8", "read 8"], true]],
        activeMemoryLinkId: "inner-print",
      },
    ),
    snap(
      {
        outerValue: "value@outer = 3",
        innerValue: ["已离开作用域", "out of scope"],
        useSite: "printf → 3",
        resolvedBinding: "value → outer",
      },
      {
        memoryLinks: [
          ["outer-print", "printf(value)", "value@outer", ["绑定恢复", "binding restored"], true],
        ],
        activeMemoryLinkId: "outer-print",
      },
    ),
  ]),
  45: course(45, "", "2\n", [
    snap(
      { counter: "counter@file = 0", callIndex: "0", writeHistory: "[0]", stdout: "∅" },
      {
        tokens: operationTokens("call", ["start", "call 1", "call 2", "print"], 0),
        activeTokenIds: ["call-0"],
        memoryLinks: [
          ["shared-counter", "count_once", "counter@file", ["共享对象", "shared object"], false],
        ],
        iteration: 0,
      },
    ),
    snap(
      { counter: "counter@file = 1", callIndex: "1", writeHistory: "[0, 1]", stdout: "∅" },
      {
        tokens: operationTokens("call", ["start", "call 1", "call 2", "print"], 1),
        activeTokenIds: ["call-1"],
        memoryLinks: [["shared-counter", "call 1", "counter@file", ["写入 1", "write 1"], true]],
        activeMemoryLinkId: "shared-counter",
        iteration: 1,
      },
    ),
    snap(
      { counter: "counter@file = 2", callIndex: "2", writeHistory: "[0, 1, 2]", stdout: "∅" },
      {
        tokens: operationTokens("call", ["start", "call 1", "call 2", "print"], 2),
        activeTokenIds: ["call-2"],
        memoryLinks: [["shared-counter", "call 2", "counter@file", ["写入 2", "write 2"], true]],
        activeMemoryLinkId: "shared-counter",
        iteration: 2,
      },
    ),
    snap(
      {
        counter: "counter@file = 2",
        callIndex: ["调用完成", "calls complete"],
        writeHistory: "[0, 1, 2]",
        stdout: "2",
      },
      {
        tokens: operationTokens("call", ["start", "call 1", "call 2", "print"], 3),
        activeTokenIds: ["call-3"],
        iteration: 2,
      },
    ),
  ]),
  46: course(46, "", "1 2\n", [
    snap(
      { frame: "main", staticId: "id@static = 0", persistedValue: "[0]", returnValue: "∅" },
      {
        memoryLinks: [
          [
            "static-store",
            "next_id frames",
            "id@static",
            ["跨帧存储", "cross-frame storage"],
            false,
          ],
        ],
        iteration: 0,
      },
    ),
    snap(
      {
        frame: "next_id call 1",
        staticId: "id@static = 1",
        persistedValue: "[0, 1]",
        returnValue: "1",
      },
      {
        stackFrames: [
          ["main", "main", { first: "?" }, false],
          ["next-1", "next_id #1", { return: "1" }, true],
        ],
        activeStackFrameId: "next-1",
        memoryLinks: [["static-store", "next_id #1", "id@static", ["0 → 1", "0 → 1"], true]],
        activeMemoryLinkId: "static-store",
        iteration: 1,
      },
    ),
    snap(
      {
        frame: "next_id call 2",
        staticId: "id@static = 2",
        persistedValue: "[0, 1, 2]",
        returnValue: "2",
      },
      {
        stackFrames: [
          ["main", "main", { first: "1", second: "?" }, false],
          ["next-2", "next_id #2", { return: "2" }, true],
        ],
        activeStackFrameId: "next-2",
        memoryLinks: [["static-store", "next_id #2", "id@static", ["1 → 2", "1 → 2"], true]],
        activeMemoryLinkId: "static-store",
        iteration: 2,
      },
    ),
    snap(
      {
        frame: "main",
        staticId: "id@static = 2",
        persistedValue: "[0, 1, 2]",
        returnValue: "first=1 · second=2",
      },
      {
        stackFrames: [["main", "main", { first: "1", second: "2" }, true]],
        activeStackFrameId: "main",
        iteration: 2,
      },
    ),
  ]),
  48: course(48, "", "9 2\n", [
    snap(
      {
        a: "a = 2",
        b: "b = 9",
        temporary: ["未初始化", "uninitialised"],
        aliases: "left→a · right→b",
      },
      {
        tokens: operationTokens("swap", ["alias", "save", "write a", "write b"], 0),
        activeTokenIds: ["swap-0"],
        memoryLinks: swapLinks("alias"),
      },
    ),
    snap(
      { a: "a = 2", b: "b = 9", temporary: "temporary = 2", aliases: "left→a · right→b" },
      {
        tokens: operationTokens("swap", ["alias", "save", "write a", "write b"], 1),
        activeTokenIds: ["swap-1"],
        memoryLinks: swapLinks("save"),
        activeMemoryLinkId: "save",
      },
    ),
    snap(
      { a: "a = 9", b: "b = 9", temporary: "temporary = 2", aliases: "left→a · right→b" },
      {
        tokens: operationTokens("swap", ["alias", "save", "write a", "write b"], 2),
        activeTokenIds: ["swap-2"],
        memoryLinks: swapLinks("left-write"),
        activeMemoryLinkId: "left-write",
      },
    ),
    snap(
      { a: "a = 9", b: "b = 2", temporary: "temporary = 2", aliases: "left→a · right→b" },
      {
        tokens: operationTokens("swap", ["alias", "save", "write a", "write b"], 3),
        activeTokenIds: ["swap-3"],
        memoryLinks: swapLinks("right-write"),
        activeMemoryLinkId: "right-write",
      },
    ),
  ]),
  49: course(49, "", "3 8\n", [
    snap(
      { a: "8", b: "3", low: "minimum→low", high: "maximum→high" },
      { memoryLinks: minmaxLinks("low-alias"), activeMemoryLinkId: "low-alias" },
    ),
    snap(
      { a: "8", b: "3", low: "*minimum = 3", high: ["未写入", "unwritten"] },
      {
        memoryLinks: minmaxLinks("low-write"),
        activeMemoryLinkId: "low-write",
        branchOutcome: false,
      },
    ),
    snap(
      { a: "8", b: "3", low: "*minimum = 3", high: "*maximum = 8" },
      {
        memoryLinks: minmaxLinks("high-write"),
        activeMemoryLinkId: "high-write",
        branchOutcome: true,
      },
    ),
    snap(
      { a: "8", b: "3", low: "low = 3", high: "high = 8" },
      { memoryLinks: minmaxLinks("high-alias"), activeMemoryLinkId: "high-alias" },
    ),
  ]),
  51: course(51, "", "20\n", [
    snap(
      { values: "[2, 4, 6, 8]", index: "0", sum: "0", stdout: "∅" },
      { tokens: arrayTokens([2, 4, 6, 8], 0), activeTokenIds: ["value-0"], iteration: 0 },
    ),
    snap(
      { values: "[2, 4, 6, 8]", index: "1", sum: "2", stdout: "∅" },
      { tokens: arrayTokens([2, 4, 6, 8], 1), activeTokenIds: ["value-1"], iteration: 1 },
    ),
    snap(
      { values: "[2, 4, 6, 8]", index: "3", sum: "12", stdout: "∅" },
      { tokens: arrayTokens([2, 4, 6, 8], 3), activeTokenIds: ["value-3"], iteration: 3 },
    ),
    snap(
      { values: "[2, 4, 6, 8]", index: ["4 · 表尾", "4 · end"], sum: "20", stdout: "20" },
      { tokens: arrayTokens([2, 4, 6, 8], 3), activeTokenIds: ["value-3"], iteration: 4 },
    ),
  ]),
  53: course(53, "", "-1\n", [
    snap(
      { basePointer: "values → index 0", length: "4", index: "0", maximum: "−3" },
      {
        tokens: arrayTokens([-3, -8, -1, -4], 0),
        activeTokenIds: ["value-0"],
        memoryLinks: [["array-bound", "values", "[0,4)", ["合法范围", "valid range"], true]],
        activeMemoryLinkId: "array-bound",
        iteration: 0,
      },
    ),
    snap(
      { basePointer: "values → index 0", length: "4", index: "1", maximum: "−3" },
      {
        tokens: arrayTokens([-3, -8, -1, -4], 1),
        activeTokenIds: ["value-1"],
        memoryLinks: [["array-read", "values+1", "−8", ["读取", "read"], true]],
        activeMemoryLinkId: "array-read",
        branchOutcome: false,
        iteration: 1,
      },
    ),
    snap(
      { basePointer: "values → index 0", length: "4", index: "2", maximum: "−1" },
      {
        tokens: arrayTokens([-3, -8, -1, -4], 2),
        activeTokenIds: ["value-2"],
        memoryLinks: [["array-read", "values+2", "−1", ["更新 maximum", "update maximum"], true]],
        activeMemoryLinkId: "array-read",
        branchOutcome: true,
        iteration: 2,
      },
    ),
    snap(
      {
        basePointer: "values → index 0",
        length: "4",
        index: ["4 · 停止", "4 · stop"],
        maximum: "−1",
      },
      {
        tokens: arrayTokens([-3, -8, -1, -4], -1),
        memoryLinks: [["array-bound", "values", "[0,4)", ["未越界", "in bounds"], true]],
        activeMemoryLinkId: "array-bound",
        iteration: 4,
      },
    ),
  ]),
  55: course(55, "", "0 3 0 0 2\n", [
    snap(
      { slots: "[_, _, _, _, _]", designatedWrites: "∅", zeroFill: ["待初始化", "pending"] },
      { tokens: arrayTokens(["_", "_", "_", "_", "_"], 1), activeTokenIds: ["value-1"] },
    ),
    snap(
      {
        slots: "[_, 3, _, _, _]",
        designatedWrites: "[1] = 3",
        zeroFill: ["待补零", "pending zero-fill"],
      },
      {
        tokens: arrayTokens(["_", 3, "_", "_", "_"], 1),
        activeTokenIds: ["value-1"],
        memoryLinks: [["write-1", "3", "counts[1]", ["指定写入", "designated write"], true]],
        activeMemoryLinkId: "write-1",
      },
    ),
    snap(
      {
        slots: "[_, 3, _, _, 2]",
        designatedWrites: "[1] = 3 · [4] = 2",
        zeroFill: ["待补零", "pending zero-fill"],
      },
      {
        tokens: arrayTokens(["_", 3, "_", "_", 2], 4),
        activeTokenIds: ["value-4"],
        memoryLinks: [["write-4", "2", "counts[4]", ["指定写入", "designated write"], true]],
        activeMemoryLinkId: "write-4",
      },
    ),
    snap(
      {
        slots: "[0, 3, 0, 0, 2]",
        designatedWrites: "[1] = 3 · [4] = 2",
        zeroFill: "[0], [2], [3] → 0",
      },
      { tokens: arrayTokens([0, 3, 0, 0, 2], 0), activeTokenIds: ["value-0"] },
    ),
  ]),
  56: course(56, "", "3 1 4\n", [
    snap(
      {
        basePointer: "values = &values[0]",
        cursor: "values + 0",
        currentValue: "*cursor = 3",
        onePastEnd: ["未到达", "not reached"],
      },
      {
        tokens: arrayTokens([3, 1, 4], 0),
        activeTokenIds: ["value-0"],
        memoryLinks: [["cursor", "values+0", "values[0]", ["解引用 3", "dereference 3"], true]],
        activeMemoryLinkId: "cursor",
        iteration: 0,
      },
    ),
    snap(
      {
        basePointer: "values = &values[0]",
        cursor: "values + 1",
        currentValue: "*cursor = 1",
        onePastEnd: ["未到达", "not reached"],
      },
      {
        tokens: arrayTokens([3, 1, 4], 1),
        activeTokenIds: ["value-1"],
        memoryLinks: [["cursor", "values+1", "values[1]", ["解引用 1", "dereference 1"], true]],
        activeMemoryLinkId: "cursor",
        iteration: 1,
      },
    ),
    snap(
      {
        basePointer: "values = &values[0]",
        cursor: "values + 2",
        currentValue: "*cursor = 4",
        onePastEnd: ["下一步", "next step"],
      },
      {
        tokens: arrayTokens([3, 1, 4], 2),
        activeTokenIds: ["value-2"],
        memoryLinks: [["cursor", "values+2", "values[2]", ["解引用 4", "dereference 4"], true]],
        activeMemoryLinkId: "cursor",
        iteration: 2,
      },
    ),
    snap(
      {
        basePointer: "values = &values[0]",
        cursor: "values + 3",
        currentValue: ["不可解引用", "not dereferenceable"],
        onePastEnd: ["已到达", "reached"],
      },
      {
        tokens: arrayTokens([3, 1, 4], 2),
        activeTokenIds: ["value-2"],
        memoryLinks: [["one-past", "values+3", "end", ["只可比较", "comparison only"], true]],
        activeMemoryLinkId: "one-past",
        iteration: 3,
      },
    ),
  ]),
  57: course(57, "", "9\n", [
    snap(
      {
        characters: "a l g o r i t h m \\0",
        cursor: "word[0]",
        nul: ["未命中", "not reached"],
        length: "0",
      },
      { tokens: wordTokens(0), activeTokenIds: ["char-0"], iteration: 0 },
    ),
    snap(
      {
        characters: "a l g o r i t h m \\0",
        cursor: "word[1]",
        nul: ["未命中", "not reached"],
        length: "1",
      },
      { tokens: wordTokens(1), activeTokenIds: ["char-1"], iteration: 1 },
    ),
    snap(
      {
        characters: "a l g o r i t h m \\0",
        cursor: "word[8]",
        nul: ["下一格", "next cell"],
        length: "8",
      },
      { tokens: wordTokens(8), activeTokenIds: ["char-8"], iteration: 8 },
    ),
    snap(
      {
        characters: "a l g o r i t h m \\0",
        cursor: "word[9]",
        nul: ["命中 \\0", "matched \\0"],
        length: "9",
      },
      { tokens: wordTokens(9), activeTokenIds: ["char-9"], branchOutcome: false, iteration: 9 },
    ),
  ]),
  58: course(58, "", "red blue green\n", [
    snap(
      {
        inputWords: "[red, blue, red, green, blue]",
        currentWord: "red",
        duplicate: "false",
        uniqueWords: "[red]",
      },
      { tokens: wordListTokens(0), activeTokenIds: ["word-0"], branchOutcome: false, iteration: 0 },
    ),
    snap(
      {
        inputWords: "[red, blue, red, green, blue]",
        currentWord: "blue",
        duplicate: "false",
        uniqueWords: "[red, blue]",
      },
      { tokens: wordListTokens(1), activeTokenIds: ["word-1"], branchOutcome: false, iteration: 1 },
    ),
    snap(
      {
        inputWords: "[red, blue, red, green, blue]",
        currentWord: "red",
        duplicate: "true",
        uniqueWords: "[red, blue]",
      },
      { tokens: wordListTokens(2), activeTokenIds: ["word-2"], branchOutcome: true, iteration: 2 },
    ),
    snap(
      {
        inputWords: "[red, blue, red, green, blue]",
        currentWord: ["流结束", "end of stream"],
        duplicate: "blue → true",
        uniqueWords: "[red, blue, green]",
      },
      { tokens: wordListTokens(-1), branchOutcome: true, iteration: 5 },
    ),
  ]),
});

Object.freeze(CASE_IO);

export const FOA_FIXED_RUNTIME_ORDERS: readonly number[] = FIXED_ORDERS;

export function getFoaFixedRuntimeEvidence(order: number): FoaCourseRuntimeEvidence {
  const evidence = EVIDENCE[order];
  if (evidence === undefined) {
    throw new RangeError(`FOA lesson ${String(order)} has no authored fixed runtime evidence`);
  }
  return evidence;
}

export function getFoaFixedRuntimeCaseIo(order: number): FoaFixedRuntimeCaseIo {
  const value = CASE_IO[order];
  if (value === undefined) {
    throw new RangeError(`FOA lesson ${String(order)} has no authored fixed runtime case`);
  }
  return value;
}

export function validateFoaFixedRuntimeEvidence(): void {
  const actualOrders = Object.keys(EVIDENCE)
    .map(Number)
    .sort((left, right) => left - right);
  const expectedOrders = [...FIXED_ORDERS].sort((left, right) => left - right);
  if (
    actualOrders.length !== expectedOrders.length ||
    actualOrders.some((order, index) => order !== expectedOrders[index])
  ) {
    throw new RangeError(
      "FOA fixed runtime evidence must cover the 30 fixed shared lessons exactly",
    );
  }

  for (const order of expectedOrders) {
    const evidence = EVIDENCE[order]!;
    const io = CASE_IO[order];
    if (
      evidence.order !== order ||
      io === undefined ||
      evidence.frames.length !== getFoaSceneProfile(order).slots.length
    ) {
      throw new RangeError(`FOA fixed runtime evidence ${String(order)} is incomplete`);
    }
    if (typeof io.stdin !== "string" || typeof io.stdout !== "string") {
      throw new TypeError(`FOA fixed runtime evidence ${String(order)} requires concrete case I/O`);
    }
    const expectedFields = getFoaSceneProfile(order)
      .stateShape.map(({ id }) => id)
      .sort();
    for (const [frameIndex, frame] of evidence.frames.entries()) {
      const actualFields = Object.keys(frame.stateValues).sort();
      if (
        actualFields.length !== expectedFields.length ||
        actualFields.some((field, index) => field !== expectedFields[index])
      ) {
        throw new RangeError(
          `FOA fixed runtime evidence ${String(order)} frame ${String(frameIndex + 1)} has the wrong state shape`,
        );
      }
      for (const [fieldId, value] of Object.entries(frame.stateValues)) {
        assertShortText(
          value,
          `lesson ${String(order)} frame ${String(frameIndex + 1)} ${fieldId}`,
        );
      }
      assertUniqueIds(
        frame.tokens.map(({ id }) => id),
        `lesson ${String(order)} tokens`,
      );
      assertUniqueIds(
        frame.stackFrames.map(({ id }) => id),
        `lesson ${String(order)} stack frames`,
      );
      assertUniqueIds(
        frame.memoryLinks.map(({ id }) => id),
        `lesson ${String(order)} memory links`,
      );
      if (frame.iteration !== null && (!Number.isInteger(frame.iteration) || frame.iteration < 0)) {
        throw new RangeError(
          `FOA fixed runtime evidence ${String(order)} has an invalid iteration`,
        );
      }
    }
  }
}

function course(
  order: number,
  stdin: string,
  stdout: string,
  frames: readonly FoaRuntimeEvidenceSnapshotInput[],
): FoaCourseRuntimeEvidence {
  if (!FIXED_ORDERS.includes(order as (typeof FIXED_ORDERS)[number])) {
    throw new RangeError(`FOA lesson ${String(order)} is not a fixed shared-runtime lesson`);
  }
  if (CASE_IO[order] !== undefined) {
    throw new RangeError(`FOA lesson ${String(order)} defines fixed runtime evidence twice`);
  }
  CASE_IO[order] = Object.freeze({ stdin, stdout });
  return defineFoaCourseRuntimeEvidence(getFoaSceneProfile(order), frames);
}

function snap(
  stateValues: StateInput,
  extras: SnapshotExtras = {},
): FoaRuntimeEvidenceSnapshotInput {
  const normalizedState = Object.freeze(
    Object.fromEntries(
      Object.entries(stateValues).map(([id, value]) => [id, toText(value)] as const),
    ),
  );
  const tokens = Object.freeze(
    (extras.tokens ?? []).map(([id, label, value]) => {
      const normalizedLabel = toText(label);
      const normalizedValue = toText(value);
      const base = runtimeToken(id, normalizedLabel.zh, normalizedValue.zh, normalizedLabel.en);
      return normalizedValue.en === normalizedValue.zh
        ? base
        : Object.freeze({ ...base, value: normalizedValue });
    }),
  );
  const inferredActiveTokenIds = (extras.tokens ?? [])
    .filter(([, , , status]) => status === "active")
    .map(([id]) => id);
  const indexedActiveTokenIds = (extras.activeTokenIndices ?? []).map((index) => {
    const token = tokens[index];
    if (token === undefined) throw new RangeError("FOA fixed runtime token index is out of range");
    return token.id;
  });
  const stackFrames = Object.freeze(
    (extras.stackFrames ?? []).map(([id, label, bindings]) => {
      const normalizedLabel = toText(label);
      const bindingText = bindingsText(bindings);
      return runtimeStackFrame(id, normalizedLabel.zh, bindingText.zh, normalizedLabel.en);
    }),
  );
  const memoryLinks = Object.freeze(
    (extras.memoryLinks ?? []).map(([id, from, to, label]) => {
      const normalizedLabel = toText(label);
      return runtimeMemoryLink(id, from, to, normalizedLabel.zh, normalizedLabel.en);
    }),
  );
  const inferredStackId = (extras.stackFrames ?? []).find(([, , , active]) => active)?.[0] ?? null;
  const inferredLinkId = (extras.memoryLinks ?? []).find(([, , , , active]) => active)?.[0] ?? null;
  return Object.freeze({
    stateValues: normalizedState,
    branchOutcome: extras.branchOutcome ?? null,
    iteration: extras.iteration ?? null,
    tokens,
    activeTokenIds: Object.freeze([
      ...(extras.activeTokenIds ?? inferredActiveTokenIds),
      ...indexedActiveTokenIds,
    ]),
    stackFrames,
    activeStackFrameId: extras.activeStackFrameId ?? inferredStackId,
    memoryLinks,
    activeMemoryLinkId: extras.activeMemoryLinkId ?? inferredLinkId,
  });
}

function toText(value: TextInput): FoaLocalizedText {
  return typeof value === "string" ? runtimeText(value) : foaText(value[0], value[1]);
}

function bindingsText(bindings: Readonly<Record<string, TextInput>>): FoaLocalizedText {
  const zh: string[] = [];
  const en: string[] = [];
  for (const [name, rawValue] of Object.entries(bindings)) {
    const value = toText(rawValue);
    zh.push(`${name}=${value.zh}`);
    en.push(`${name}=${value.en}`);
  }
  return foaText(zh.join(" · "), en.join(" · "));
}

function expressionTokens(
  plainStatus: FoaRuntimeTokenStatus,
  groupedStatus: FoaRuntimeTokenStatus,
): readonly TokenInput[] {
  return Object.freeze([
    ["plain-tree", ["无括号树", "ungrouped tree"], "2 + 3 × 4", plainStatus],
    ["plain-multiply", ["乘法节点", "multiply node"], "3 × 4", plainStatus],
    ["grouped-tree", ["括号树", "grouped tree"], "(2 + 3) × 4", groupedStatus],
    ["grouped-add", ["加法节点", "add node"], "2 + 3", groupedStatus],
  ]);
}

function operationTokens(
  prefix: string,
  values: readonly string[],
  activeIndex: number,
): readonly TokenInput[] {
  return Object.freeze(
    values.map((value, index): TokenInput => [
      `${prefix}-${String(index)}`,
      [`操作 ${String(index + 1)}`, `Action ${String(index + 1)}`],
      value,
      index === activeIndex ? "active" : index < activeIndex ? "consumed" : "pending",
    ]),
  );
}

function factorialFrames(lowest: number): readonly StackInput[] {
  const frames: StackInput[] = [];
  for (let n = 5; n >= lowest; n -= 1) {
    frames.push([`f${String(n)}`, `factorial(${String(n)})`, { n: String(n) }, n === lowest]);
  }
  return Object.freeze(frames);
}

function testTableTokens(activeIndex: number): readonly TokenInput[] {
  const values = ["3,4 → 3", "−2,−7 → −7", "5,5 → 5"];
  return Object.freeze(
    values.map((value, index): TokenInput => [
      `case-${String(index + 1)}`,
      [`案例 ${String(index + 1)}`, `Case ${String(index + 1)}`],
      value,
      activeIndex === index ? "active" : activeIndex > index ? "consumed" : "pending",
    ]),
  );
}

function swapLinks(activeId: string): readonly LinkInput[] {
  return Object.freeze([
    ["alias-left", "left", "a", ["别名", "alias"], activeId === "alias"],
    ["alias-right", "right", "b", ["别名", "alias"], activeId === "alias"],
    ["save", "*left", "temporary", ["保存原值", "save original"], activeId === "save"],
    ["left-write", "*right", "*left", ["9 写入 a", "write 9 to a"], activeId === "left-write"],
    [
      "right-write",
      "temporary",
      "*right",
      ["2 写入 b", "write 2 to b"],
      activeId === "right-write",
    ],
  ]);
}

function minmaxLinks(activeId: string | null): readonly LinkInput[] {
  return Object.freeze([
    ["low-alias", "minimum", "low", ["输出别名", "output alias"], activeId === "low-alias"],
    ["high-alias", "maximum", "high", ["输出别名", "output alias"], activeId === "high-alias"],
    ["low-write", "min(8,3)", "low", ["写入 3", "write 3"], activeId === "low-write"],
    ["high-write", "max(8,3)", "high", ["写入 8", "write 8"], activeId === "high-write"],
  ]);
}

function arrayTokens(
  values: readonly (string | number)[],
  activeIndex: number,
): readonly TokenInput[] {
  return Object.freeze(
    values.map((value, index): TokenInput => [
      `value-${String(index)}`,
      [`索引 ${String(index)}`, `Index ${String(index)}`],
      String(value),
      index === activeIndex
        ? "active"
        : activeIndex < 0 || index < activeIndex
          ? "consumed"
          : "pending",
    ]),
  );
}

function wordTokens(activeIndex: number): readonly TokenInput[] {
  const characters = [..."algorithm", "\\0"];
  return Object.freeze(
    characters.map((character, index): TokenInput => [
      `char-${String(index)}`,
      [`字符 ${String(index)}`, `Character ${String(index)}`],
      character,
      index === activeIndex ? "active" : index < activeIndex ? "consumed" : "pending",
    ]),
  );
}

function wordListTokens(activeIndex: number): readonly TokenInput[] {
  const words = ["red", "blue", "red", "green", "blue"];
  return Object.freeze(
    words.map((word, index): TokenInput => [
      `word-${String(index)}`,
      [`词 ${String(index + 1)}`, `Word ${String(index + 1)}`],
      word,
      index === activeIndex
        ? "active"
        : activeIndex < 0 || index < activeIndex
          ? "consumed"
          : "pending",
    ]),
  );
}

function assertShortText(value: FoaLocalizedText, label: string): void {
  for (const [locale, text] of Object.entries(value)) {
    if (text.trim().length === 0 || text.length > 120 || /[\r\n]/u.test(text)) {
      throw new RangeError(`${label} ${locale} must be a short, single-line state value`);
    }
  }
}

function assertUniqueIds(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length || ids.some((id) => id.trim().length === 0)) {
    throw new RangeError(`${label} must use unique, non-empty IDs`);
  }
}

validateFoaFixedRuntimeEvidence();
