import { foaText, type FoaLocalizedText } from "./foa-contracts.js";

export type FoaSceneObservableKind =
  | "evidence"
  | "scalar"
  | "expression"
  | "branch"
  | "loop"
  | "sequence"
  | "call-stack"
  | "scope"
  | "memory"
  | "pointer"
  | "matrix"
  | "stream"
  | "search"
  | "sorting";

export type FoaSceneLearnerControl =
  "step" | "input" | "choose" | "drag" | "connect" | "inspect" | "push-pop";

export type FoaSceneStateValueKind =
  | "input"
  | "scalar"
  | "boolean"
  | "cursor"
  | "accumulator"
  | "sequence"
  | "stack-frame"
  | "scope-binding"
  | "memory-cell"
  | "pointer"
  | "matrix"
  | "output"
  | "status";

export interface FoaSceneStateField {
  readonly id: string;
  readonly label: FoaLocalizedText;
  readonly valueKind: FoaSceneStateValueKind;
}

/**
 * A machine-readable contract for the one mechanism a lesson is responsible for teaching.
 * Renderers consume this contract; they must not infer the mechanism from generic scene families.
 */
export interface FoaSceneMechanism {
  readonly mechanismId: string;
  readonly observableKind: FoaSceneObservableKind;
  readonly observableLabels: readonly FoaLocalizedText[];
  readonly learnerControl: FoaSceneLearnerControl;
  readonly caseGoal: FoaLocalizedText;
  readonly stateShape: readonly FoaSceneStateField[];
}

type StateTuple = readonly [id: string, zh: string, en: string, valueKind: FoaSceneStateValueKind];

const MECHANISMS: Readonly<Record<number, FoaSceneMechanism>> = Object.freeze({
  1: mechanism(
    1,
    "statement-output-exit",
    "evidence",
    "step",
    [
      ["programCounter", "执行位置", "Execution position", "cursor"],
      ["stdout", "标准输出", "Standard output", "output"],
      ["exitStatus", "退出状态", "Exit status", "status"],
    ],
    "按源码顺序执行 puts，并区分屏幕输出与程序退出。",
    "Execute puts in source order and distinguish screen output from program exit.",
  ),
  2: mechanism(
    2,
    "input-square-output",
    "scalar",
    "input",
    [
      ["inputToken", "输入 token", "Input token", "input"],
      ["value", "变量 value", "Variable value", "memory-cell"],
      ["square", "平方结果", "Squared result", "scalar"],
      ["stdout", "标准输出", "Standard output", "output"],
    ],
    "输入任意整数并追踪同一数值从 stdin 到平方输出。",
    "Enter an integer and track the same value from stdin to squared output.",
  ),
  3: mechanism(
    3,
    "compile-run-gates",
    "evidence",
    "step",
    [
      ["source", "源代码", "Source", "input"],
      ["compileStatus", "编译状态", "Compile status", "status"],
      ["runStatus", "运行状态", "Run status", "status"],
      ["stdout", "运行输出", "Run output", "output"],
    ],
    "先通过编译闸门，再让运行证据出现。",
    "Pass the compile gate before runtime evidence may appear.",
  ),
  4: mechanism(
    4,
    "assignment-state-history",
    "scalar",
    "drag",
    [
      ["total", "total 当前值", "Current total", "memory-cell"],
      ["rhs", "右侧结果", "Right-hand result", "scalar"],
      ["writeHistory", "写回履历", "Write-back history", "sequence"],
      ["stdout", "最终输出", "Final output", "output"],
    ],
    "依次应用 +=2 与 *=3，观察 total 的每次真实写回。",
    "Apply +=2 and *=3 in order and observe each write-back to total.",
  ),
  5: mechanism(
    5,
    "signed-zero-branch",
    "branch",
    "choose",
    [
      ["value", "输入值", "Input value", "input"],
      ["positive", "value > 0", "value > 0", "boolean"],
      ["negative", "value < 0", "value < 0", "boolean"],
      ["branchOutput", "实际分支输出", "Actual branch output", "output"],
    ],
    "输入正数、零或负数，只显示本次真正经过的分类路径。",
    "Enter a positive value, zero, or a negative value and show only the path actually taken.",
  ),
  6: mechanism(
    6,
    "identifier-binding-table",
    "memory",
    "connect",
    [
      ["itemCount", "item_count 绑定", "item_count binding", "scope-binding"],
      ["itemPrice", "item_price 绑定", "item_price binding", "scope-binding"],
      ["product", "乘积", "Product", "scalar"],
      ["stdout", "输出", "Output", "output"],
    ],
    "把两个标识符连接到各自的类型和值，再形成乘积。",
    "Connect both identifiers to their types and values before forming the product.",
  ),
  7: mechanism(
    7,
    "constant-write-permission",
    "memory",
    "choose",
    [
      ["limit", "只读 limit", "Read-only limit", "memory-cell"],
      ["used", "可写 used", "Writable used", "memory-cell"],
      ["writePermission", "写入许可", "Write permission", "boolean"],
      ["usage", "使用量结果", "Usage result", "output"],
    ],
    "选择合法写入目标，让 used 改变而 limit 保持锁定。",
    "Choose the legal write target so used changes while limit stays locked.",
  ),
  8: mechanism(
    8,
    "parentheses-evaluation-order",
    "expression",
    "drag",
    [
      ["unparenthesized", "a + b * c", "a + b * c", "sequence"],
      ["parenthesized", "(a + b) * c", "(a + b) * c", "sequence"],
      ["operatorOrder", "运算顺序", "Operator order", "cursor"],
      ["results", "两个结果", "Both results", "output"],
    ],
    "分别构造两棵表达式树，并比较 14 与 20 的来源。",
    "Build both expression trees and compare where 14 and 20 come from.",
  ),
  9: mechanism(
    9,
    "scanf-assignment-count",
    "stream",
    "input",
    [
      ["inputToken", "输入 token", "Input token", "input"],
      ["scanCount", "scanf 返回计数", "scanf return count", "status"],
      ["value", "value 是否有效", "Whether value is valid", "memory-cell"],
      ["stdout", "后续输出", "Downstream output", "output"],
    ],
    "输入整数或非法文本，观察赋值与 scanf 返回计数如何共同决定后续路径。",
    "Enter an integer or invalid text and observe how assignment and scanf's return count control the next path.",
  ),
  10: mechanism(
    10,
    "format-precision-ruler",
    "evidence",
    "inspect",
    [
      ["internalValue", "内部浮点值", "Internal floating value", "scalar"],
      ["format", "格式说明符", "Format specifier", "input"],
      ["roundedText", "格式化文本", "Formatted text", "output"],
    ],
    "移动精度尺，区分内部数值与显示字符串。",
    "Move the precision ruler and distinguish the internal value from its displayed string.",
  ),
  11: mechanism(
    11,
    "rhs-before-writeback",
    "scalar",
    "drag",
    [
      ["scoreBefore", "score 旧值", "Old score", "memory-cell"],
      ["rhs", "右侧求值", "RHS evaluation", "scalar"],
      ["scoreAfter", "score 新值", "New score", "memory-cell"],
      ["stdout", "输出", "Output", "output"],
    ],
    "先求出右侧，再把结果写回 score；禁止把赋值看成等式。",
    "Evaluate the right-hand side before writing back to score; do not treat assignment as equality.",
  ),
  12: mechanism(
    12,
    "sphere-volume-formula",
    "expression",
    "drag",
    [
      ["radius", "半径 radius", "Radius", "input"],
      ["cube", "radius³", "radius³", "scalar"],
      ["scale", "4π/3", "4π/3", "scalar"],
      ["volume", "体积", "Volume", "output"],
    ],
    "输入半径，把数学公式逐项映射到 C 子表达式并验证体积。",
    "Enter a radius, map each formula term to a C subexpression, and verify the volume.",
  ),
  13: mechanism(
    13,
    "quotient-remainder-partition",
    "expression",
    "drag",
    [
      ["numerator", "被除数", "Numerator", "input"],
      ["denominator", "除数", "Denominator", "input"],
      ["quotient", "整数商", "Integer quotient", "scalar"],
      ["remainder", "余数", "Remainder", "output"],
    ],
    "输入两个整数，观察同一次除法如何同时产生商、余数和非法边界。",
    "Enter two integers and observe one division producing quotient, remainder, and invalid boundaries.",
  ),
  14: mechanism(
    14,
    "relational-truth-value",
    "branch",
    "choose",
    [
      ["left", "左操作数", "Left operand", "input"],
      ["right", "右操作数", "Right operand", "input"],
      ["predicate", "left < right", "left < right", "boolean"],
      ["truthValue", "整数真假值", "Integer truth value", "output"],
    ],
    "改变左右操作数并观察关系方向与 0/1 结果同步变化。",
    "Change both operands and observe relation direction and the 0/1 result change together.",
  ),
  15: mechanism(
    15,
    "short-circuit-range",
    "branch",
    "choose",
    [
      ["value", "待判断值", "Value to classify", "input"],
      ["lowerClause", "下界子句", "Lower-bound clause", "boolean"],
      ["upperClause", "上界子句", "Upper-bound clause", "boolean"],
      ["rangeOutcome", "区间结果", "Range outcome", "output"],
    ],
    "输入区间内外的数，观察短路时未执行的上界判断。",
    "Enter values inside and outside the range and observe the skipped upper-bound check under short-circuiting.",
  ),
  16: mechanism(
    16,
    "conditional-absolute-update",
    "branch",
    "choose",
    [
      ["value", "value 当前值", "Current value", "memory-cell"],
      ["negativeTest", "value < 0", "value < 0", "boolean"],
      ["writeback", "条件写回", "Conditional write-back", "memory-cell"],
      ["absolute", "绝对值", "Absolute value", "output"],
    ],
    "输入正负整数，观察只有负值才触发同一变量的改写。",
    "Enter positive and negative integers and observe that only a negative value triggers a write-back.",
  ),
  17: mechanism(
    17,
    "two-candidate-maximum",
    "branch",
    "choose",
    [
      ["a", "候选 a", "Candidate a", "input"],
      ["b", "候选 b", "Candidate b", "input"],
      ["comparison", "a > b", "a > b", "boolean"],
      ["maximum", "maximum", "maximum", "output"],
    ],
    "输入两名候选，亲自选择比较结果应进入的 maximum 槽。",
    "Enter two candidates and choose which comparison result belongs in maximum.",
  ),
  18: mechanism(
    18,
    "else-if-first-match",
    "branch",
    "choose",
    [
      ["score", "分数", "Score", "input"],
      ["threshold", "当前阈值", "Current threshold", "cursor"],
      ["firstMatch", "是否首个命中", "Whether first match", "boolean"],
      ["grade", "等级", "Grade", "output"],
    ],
    "输入临界分数并逐级穿过 80、70、60，停在首个命中分支。",
    "Enter boundary scores, traverse 80, 70, and 60, and stop at the first matching branch.",
  ),
  19: mechanism(
    19,
    "piecewise-tax-bracket",
    "branch",
    "choose",
    [
      ["income", "收入", "Income", "input"],
      ["thresholdTest", "45000 阈值", "45000 threshold", "boolean"],
      ["taxable", "应税部分", "Taxable amount", "scalar"],
      ["tax", "税额", "Tax", "output"],
    ],
    "输入阈值上下的收入，观察未超出部分不会进入税额。",
    "Enter income below and above the threshold and observe that the exempt portion never enters the tax.",
  ),
  20: mechanism(
    20,
    "switch-month-lane",
    "branch",
    "choose",
    [
      ["month", "月份", "Month", "input"],
      ["caseLane", "命中 case", "Matched case", "cursor"],
      ["days", "天数", "Days", "scalar"],
      ["breakStatus", "是否执行 break", "Whether break executes", "boolean"],
    ],
    "输入月份，让选择器落到唯一 case 并观察 break 阻止继续下落。",
    "Enter a month, land on one case, and observe break preventing fall-through.",
  ),
  21: mechanism(
    21,
    "guard-early-return",
    "branch",
    "choose",
    [
      ["count", "count", "count", "input"],
      ["guard", "count <= 0", "count <= 0", "boolean"],
      ["coreStatus", "核心流程状态", "Core-flow status", "status"],
      ["stdout", "输出", "Output", "output"],
    ],
    "输入非法和合法 count，确认守卫路径绕过核心流程并直接返回。",
    "Enter invalid and valid counts and confirm the guard bypasses the core flow by returning early.",
  ),
  22: mechanism(
    22,
    "counted-sum-loop",
    "loop",
    "step",
    [
      ["n", "循环上界 n", "Loop bound n", "input"],
      ["i", "循环变量 i", "Loop variable i", "cursor"],
      ["sum", "累加器 sum", "Accumulator sum", "accumulator"],
      ["condition", "i <= n", "i <= n", "boolean"],
    ],
    "输入 n，逐轮观察条件、sum 更新和回边，直到条件失败。",
    "Enter n and observe the condition, sum update, and back edge on every round until failure.",
  ),
  23: mechanism(
    23,
    "factorial-product-invariant",
    "loop",
    "drag",
    [
      ["n", "目标 n", "Target n", "input"],
      ["factor", "当前因子 i", "Current factor i", "cursor"],
      ["result", "累乘器 result", "Accumulator result", "accumulator"],
      ["invariant", "已完成乘积", "Completed product", "status"],
    ],
    "输入 n，按因子顺序累乘并持续核对 result 覆盖的区间。",
    "Enter n, multiply factors in order, and continuously check the range already represented by result.",
  ),
  24: mechanism(
    24,
    "integer-compound-ledger",
    "loop",
    "drag",
    [
      ["period", "当前期数", "Current period", "cursor"],
      ["balance", "余额", "Balance", "accumulator"],
      ["interest", "本期利息", "Period interest", "scalar"],
      ["discarded", "整数除法舍弃部分", "Discarded integer remainder", "scalar"],
    ],
    "逐期应用整数利息，保留每次截断对后续余额的影响。",
    "Apply integer interest period by period and retain how each truncation affects later balances.",
  ),
  25: mechanism(
    25,
    "sentinel-stream-gate",
    "stream",
    "drag",
    [
      ["tokens", "输入流", "Input stream", "sequence"],
      ["currentToken", "当前 token", "Current token", "cursor"],
      ["sentinel", "哨兵判断", "Sentinel test", "boolean"],
      ["sum", "累加器", "Accumulator", "accumulator"],
    ],
    "输入含 -1 的序列，逐项消费并证明哨兵及其后内容未进入累加器。",
    "Enter a sequence containing -1, consume it item by item, and prove that the sentinel and later values do not enter the accumulator.",
  ),
  26: mechanism(
    26,
    "post-test-digit-count",
    "loop",
    "step",
    [
      ["value", "当前商", "Current quotient", "scalar"],
      ["digits", "位数计数", "Digit count", "accumulator"],
      ["iteration", "循环轮次", "Loop round", "cursor"],
      ["condition", "value != 0", "value != 0", "boolean"],
    ],
    "输入 0 与多位整数，观察循环体先执行一次再检查条件。",
    "Enter zero and multi-digit integers and observe the body execute before the condition is checked.",
  ),
  27: mechanism(
    27,
    "counted-average-stream",
    "stream",
    "drag",
    [
      ["count", "元素数量", "Element count", "input"],
      ["readIndex", "读取进度", "Read progress", "cursor"],
      ["sum", "总和", "Sum", "accumulator"],
      ["average", "均值", "Average", "output"],
    ],
    "输入 count 与等长序列，逐项消费并在全部读取后计算均值。",
    "Enter count and a matching sequence, consume each item, and compute the average only after all reads.",
  ),
  28: mechanism(
    28,
    "negative-safe-maximum-scan",
    "search",
    "choose",
    [
      ["values", "候选序列", "Candidate sequence", "sequence"],
      ["challenger", "当前挑战者", "Current challenger", "cursor"],
      ["maximum", "当前冠军", "Current champion", "accumulator"],
      ["updates", "冠军更新履历", "Champion update history", "sequence"],
    ],
    "输入全负数序列，用首元素建立冠军并逐个接受或拒绝挑战者。",
    "Enter an all-negative sequence, establish the champion from the first item, and accept or reject each challenger.",
  ),
  29: mechanism(
    29,
    "nested-triangle-cursors",
    "matrix",
    "drag",
    [
      ["rows", "目标行数", "Target rows", "input"],
      ["row", "行游标", "Row cursor", "cursor"],
      ["column", "列游标", "Column cursor", "cursor"],
      ["grid", "已生成字符画", "Generated character grid", "matrix"],
    ],
    "输入行数，亲自推进嵌套游标并观察三角形逐格生成。",
    "Enter a row count, advance both nested cursors, and observe the triangle appear cell by cell.",
  ),
  30: mechanism(
    30,
    "trial-division-bound",
    "search",
    "inspect",
    [
      ["candidate", "候选 n", "Candidate n", "input"],
      ["divisor", "当前除数", "Current divisor", "cursor"],
      ["remainder", "余数", "Remainder", "scalar"],
      ["primeStatus", "素数状态", "Prime status", "status"],
    ],
    "输入候选整数，逐个试除并观察因子命中或平方根边界终止。",
    "Enter a candidate integer, try divisors in order, and observe termination by a factor or the square-root bound.",
  ),
  31: mechanism(
    31,
    "euclid-decreasing-measure",
    "loop",
    "drag",
    [
      ["a", "寄存器 a", "Register a", "memory-cell"],
      ["b", "寄存器 b", "Register b", "memory-cell"],
      ["remainder", "余数", "Remainder", "scalar"],
      ["round", "欧几里得轮次", "Euclid round", "cursor"],
      ["measure", "严格下降量", "Strictly decreasing measure", "sequence"],
    ],
    "输入两个正整数，逐轮轮换寄存器并验证 b 严格下降到 0。",
    "Enter two positive integers, rotate the registers each round, and verify that b strictly decreases to zero.",
  ),
  32: mechanism(
    32,
    "square-call-frame",
    "call-stack",
    "push-pop",
    [
      ["argument", "实参", "Argument", "input"],
      ["parameter", "形参副本", "Parameter copy", "stack-frame"],
      ["localResult", "帧内结果", "Frame-local result", "scalar"],
      ["returnValue", "返回值", "Return value", "output"],
    ],
    "输入函数实参，观察值进入新栈帧、计算并返回调用点。",
    "Enter a function argument and observe it enter a new frame, compute, and return to the call site.",
  ),
  33: mechanism(
    33,
    "prototype-signature-contract",
    "evidence",
    "connect",
    [
      ["prototype", "函数原型", "Function prototype", "status"],
      ["call", "调用签名", "Call signature", "status"],
      ["definition", "函数定义", "Function definition", "status"],
      ["match", "合同匹配", "Contract match", "boolean"],
    ],
    "连接原型、调用和定义的返回类型与参数，确认三者合同一致。",
    "Connect the return and parameter types across prototype, call, and definition and confirm one contract.",
  ),
  34: mechanism(
    34,
    "abs-public-contract",
    "evidence",
    "inspect",
    [
      ["argument", "abs 实参", "abs argument", "input"],
      ["precondition", "可表示前置条件", "Representability precondition", "boolean"],
      ["returnValue", "abs 返回值", "abs return value", "output"],
    ],
    "输入正负整数，只通过公开合同观察 abs 的实参、约束和返回值。",
    "Enter positive and negative integers and observe only abs's public argument, constraint, and return value.",
  ),
  35: mechanism(
    35,
    "clamp-three-zones",
    "branch",
    "choose",
    [
      ["value", "输入值", "Input value", "input"],
      ["lowerGuard", "低于下界", "Below lower bound", "boolean"],
      ["upperGuard", "高于上界", "Above upper bound", "boolean"],
      ["clamped", "截断结果", "Clamped result", "output"],
    ],
    "把输入放到低、中、高三个区间之一，并选择唯一合法返回值。",
    "Place the input in the low, middle, or high zone and choose the only valid return value.",
  ),
  36: mechanism(
    36,
    "recursive-factorial-unwind",
    "call-stack",
    "push-pop",
    [
      ["n", "当前 n", "Current n", "scalar"],
      ["frames", "递归栈帧", "Recursive frames", "stack-frame"],
      ["baseCase", "基例", "Base case", "boolean"],
      ["product", "回卷乘积", "Unwound product", "accumulator"],
    ],
    "逐层压入 factorial 调用，命中基例后反向弹出并累乘。",
    "Push factorial calls until the base case, then pop them in reverse while multiplying.",
  ),
  37: mechanism(
    37,
    "newton-cube-root",
    "search",
    "drag",
    [
      ["target", "目标值", "Target value", "input"],
      ["estimate", "当前估计", "Current estimate", "scalar"],
      ["nextEstimate", "下一估计", "Next estimate", "scalar"],
      ["error", "误差", "Error", "scalar"],
    ],
    "拖动一次牛顿更新，观察估计值和误差如何共同收敛。",
    "Apply Newton updates and observe the estimate and error converge together.",
  ),
  38: mechanism(
    38,
    "table-driven-tests",
    "evidence",
    "inspect",
    [
      ["cases", "测试表", "Test table", "sequence"],
      ["caseCursor", "当前案例", "Current case", "cursor"],
      ["actual", "实际结果", "Actual result", "scalar"],
      ["verdict", "通过/失败", "Pass/fail", "status"],
    ],
    "逐行运行测试表，让每个实际结果与该行期望值独立比较。",
    "Run the test table row by row and compare each actual result with that row's expectation.",
  ),
  39: mechanism(
    39,
    "value-parameter-copy",
    "call-stack",
    "connect",
    [
      ["callerValue", "调用者对象", "Caller object", "memory-cell"],
      ["parameter", "形参副本", "Parameter copy", "stack-frame"],
      ["mutatedCopy", "修改后副本", "Mutated copy", "stack-frame"],
      ["callerAfter", "调用后对象", "Caller after call", "memory-cell"],
    ],
    "连接实参与形参副本，在帧内修改后验证调用者对象未变。",
    "Connect the argument to its parameter copy, mutate the frame-local copy, and verify the caller object remains unchanged.",
  ),
  40: mechanism(
    40,
    "computed-return-value",
    "call-stack",
    "push-pop",
    [
      ["arguments", "输入参数", "Input arguments", "input"],
      ["localResult", "局部结果", "Local result", "scalar"],
      ["returnSlot", "返回槽", "Return slot", "stack-frame"],
      ["callerValue", "调用点接收值", "Value received by caller", "output"],
    ],
    "在函数帧内计算结果，经 return 槽把值交回调用点。",
    "Compute inside the function frame and pass the value back through the return slot.",
  ),
  41: mechanism(
    41,
    "nested-function-pipeline",
    "call-stack",
    "push-pop",
    [
      ["input", "初始值", "Initial value", "input"],
      ["innerReturn", "内层返回值", "Inner return value", "stack-frame"],
      ["outerReturn", "外层返回值", "Outer return value", "stack-frame"],
      ["stdout", "组合结果", "Composed result", "output"],
    ],
    "先完成内层函数并把返回值送入外层函数，禁止跳过嵌套顺序。",
    "Complete the inner function first and feed its return value to the outer function without skipping nesting order.",
  ),
  42: mechanism(
    42,
    "stdout-vs-exit-status",
    "evidence",
    "inspect",
    [
      ["stdout", "标准输出通道", "Standard-output channel", "output"],
      ["exitStatus", "退出状态通道", "Exit-status channel", "status"],
      ["processResult", "调用方判定", "Caller verdict", "status"],
    ],
    "分别预测 stdout 与 main 返回值，并核对调用方看到的进程状态。",
    "Predict stdout and main's return value separately, then check the process status observed by the caller.",
  ),
  43: mechanism(
    43,
    "void-side-effect",
    "call-stack",
    "push-pop",
    [
      ["call", "void 调用", "void call", "stack-frame"],
      ["sideEffect", "stdout 副作用", "stdout side effect", "output"],
      ["returnSlot", "不存在的返回槽", "Absent return slot", "status"],
    ],
    "执行一次 void 调用，观察输出副作用，同时确认没有可用返回值。",
    "Execute one void call, observe its output side effect, and confirm that no return value exists.",
  ),
  44: mechanism(
    44,
    "scope-shadow-bindings",
    "scope",
    "connect",
    [
      ["outerValue", "外层 value", "Outer value", "scope-binding"],
      ["innerValue", "内层 value", "Inner value", "scope-binding"],
      ["useSite", "当前使用点", "Current use site", "cursor"],
      ["resolvedBinding", "实际绑定", "Resolved binding", "pointer"],
    ],
    "为每个 value 使用点连接最近的可见声明，观察离开块后绑定恢复。",
    "Connect each value use to the nearest visible declaration and observe the outer binding return after the block.",
  ),
  45: mechanism(
    45,
    "file-scope-shared-counter",
    "memory",
    "drag",
    [
      ["counter", "共享 counter", "Shared counter", "memory-cell"],
      ["callIndex", "调用序号", "Call index", "cursor"],
      ["writeHistory", "写入履历", "Write history", "sequence"],
      ["stdout", "两次输出", "Two outputs", "output"],
    ],
    "连续触发两次调用，让两次写入落到同一个文件作用域对象。",
    "Trigger two calls and make both writes land on the same file-scope object.",
  ),
  46: mechanism(
    46,
    "static-local-persistence",
    "memory",
    "inspect",
    [
      ["frame", "当前调用帧", "Current call frame", "stack-frame"],
      ["staticId", "static id", "static id", "memory-cell"],
      ["persistedValue", "跨调用保留值", "Value retained across calls", "sequence"],
      ["returnValue", "本次返回", "Current return", "output"],
    ],
    "重建两次调用帧，观察 static id 不随帧销毁并连续递增。",
    "Rebuild two call frames and observe static id surviving frame destruction and continuing to increment.",
  ),
  47: mechanism(
    47,
    "address-dereference-write",
    "pointer",
    "connect",
    [
      ["value", "对象 value", "Object value", "memory-cell"],
      ["address", "指针 address", "Pointer address", "pointer"],
      ["dereference", "*address", "*address", "pointer"],
      ["write", "目标写入", "Target write", "memory-cell"],
    ],
    "沿同一别名边完成取地址、解引用和写入，确认对象身份不变。",
    "Follow one alias edge through address-taking, dereference, and write while preserving object identity.",
  ),
  48: mechanism(
    48,
    "pointer-swap-temporary",
    "pointer",
    "drag",
    [
      ["a", "对象 a", "Object a", "memory-cell"],
      ["b", "对象 b", "Object b", "memory-cell"],
      ["temporary", "temporary", "temporary", "memory-cell"],
      ["aliases", "left/right 别名", "left/right aliases", "pointer"],
    ],
    "按三次赋值的正确顺序移动值，借助 temporary 完成交换且不丢失原值。",
    "Move values in the correct three-assignment order and use temporary to swap without losing an original value.",
  ),
  49: mechanism(
    49,
    "dual-output-pointers",
    "pointer",
    "connect",
    [
      ["a", "输入 a", "Input a", "input"],
      ["b", "输入 b", "Input b", "input"],
      ["low", "minimum 输出目标", "minimum output target", "pointer"],
      ["high", "maximum 输出目标", "maximum output target", "pointer"],
    ],
    "把较小值和较大值分别路由到两个独立输出指针。",
    "Route the smaller and larger values to two independent output pointers.",
  ),
  50: mechanism(
    50,
    "safe-read-output-validity",
    "pointer",
    "input",
    [
      ["token", "读取 token", "Read token", "input"],
      ["scanStatus", "读取状态", "Read status", "status"],
      ["outPointer", "输出指针 out", "Output pointer out", "pointer"],
      ["outValidity", "out 有效性", "out validity", "boolean"],
      ["outValue", "*out", "*out", "memory-cell"],
    ],
    "输入合法或非法 token，只在成功分支上允许 out 指针获得值。",
    "Enter a valid or invalid token and allow the out pointer to receive a value only on success.",
  ),
  51: mechanism(
    51,
    "array-linear-sum",
    "sequence",
    "drag",
    [
      ["values", "数组元素", "Array elements", "sequence"],
      ["index", "当前索引", "Current index", "cursor"],
      ["sum", "累加器 sum", "Accumulator sum", "accumulator"],
      ["stdout", "数组总和", "Array sum", "output"],
    ],
    "逐格把数组元素拖入 sum，确保每格恰好消费一次。",
    "Drag array items into sum one cell at a time so every cell is consumed exactly once.",
  ),
  52: mechanism(
    52,
    "capacity-bounded-array-read",
    "sequence",
    "drag",
    [
      ["count", "逻辑长度 count", "Logical length count", "input"],
      ["capacity", "物理容量", "Physical capacity", "status"],
      ["writeIndex", "写入索引", "Write index", "cursor"],
      ["storedValues", "有效数组区", "Valid array region", "sequence"],
    ],
    "输入 count 与元素，先通过容量门，再逐项写入唯一合法槽。",
    "Enter count and values, pass the capacity gate, then write each item into its only legal slot.",
  ),
  53: mechanism(
    53,
    "pointer-length-array-bound",
    "pointer",
    "connect",
    [
      ["basePointer", "首元素指针", "First-element pointer", "pointer"],
      ["length", "独立 length", "Independent length", "scalar"],
      ["index", "访问索引", "Access index", "cursor"],
      ["maximum", "扫描结果", "Scan result", "output"],
    ],
    "把数组指针与正确 length 配对，确保扫描不越过合法区间。",
    "Pair the array pointer with the correct length so scanning never leaves the valid region.",
  ),
  54: mechanism(
    54,
    "matrix-row-accumulators",
    "matrix",
    "drag",
    [
      ["matrix", "二维数组", "Matrix", "matrix"],
      ["row", "行游标", "Row cursor", "cursor"],
      ["column", "列游标", "Column cursor", "cursor"],
      ["rowSum", "当前行和", "Current row sum", "accumulator"],
    ],
    "逐行横扫矩阵，并在切换行时重置行累加器。",
    "Sweep the matrix row by row and reset the row accumulator when moving to the next row.",
  ),
  55: mechanism(
    55,
    "designated-array-initialization",
    "memory",
    "drag",
    [
      ["slots", "数组槽", "Array slots", "sequence"],
      ["designatedWrites", "指定写入", "Designated writes", "sequence"],
      ["zeroFill", "隐式零初始化", "Implicit zero-fill", "status"],
    ],
    "把指定值放入命名索引，再显现其余槽的零初始化。",
    "Place designated values at named indices, then reveal zero-initialization in all remaining slots.",
  ),
  56: mechanism(
    56,
    "pointer-array-cursor",
    "pointer",
    "drag",
    [
      ["basePointer", "数组首地址", "Array base pointer", "pointer"],
      ["cursor", "指针游标", "Pointer cursor", "pointer"],
      ["currentValue", "当前解引用值", "Current dereferenced value", "memory-cell"],
      ["onePastEnd", "尾后位置", "One-past-the-end", "status"],
    ],
    "沿连续数组移动指针游标，逐项解引用并停在不可解引用的尾后位置。",
    "Move a pointer cursor across a contiguous array, dereference each item, and stop at the non-dereferenceable one-past-end position.",
  ),
  57: mechanism(
    57,
    "nul-terminated-length",
    "sequence",
    "inspect",
    [
      ["characters", "字符序列", "Character sequence", "sequence"],
      ["cursor", "字符游标", "Character cursor", "cursor"],
      ["nul", "NUL 终止格", "NUL terminator", "status"],
      ["length", "字符串长度", "String length", "accumulator"],
    ],
    "逐字符推进 length，在 NUL 前停止且不把终止符计入长度。",
    "Advance length character by character, stop before NUL, and do not count the terminator.",
  ),
  58: mechanism(
    58,
    "stable-distinct-word-filter",
    "search",
    "choose",
    [
      ["inputWords", "输入词序列", "Input word sequence", "sequence"],
      ["currentWord", "当前词", "Current word", "cursor"],
      ["duplicate", "是否已存在", "Whether already present", "boolean"],
      ["uniqueWords", "唯一词架", "Unique-word rack", "sequence"],
    ],
    "按输入顺序判断每个词是重复还是新增，并只追加首次出现。",
    "Classify each word as duplicate or new in input order and append only first occurrences.",
  ),
  59: mechanism(
    59,
    "bounded-string-table-lookup",
    "search",
    "inspect",
    [
      ["index", "输入索引", "Input index", "input"],
      ["rangeGuard", "[0,7) 守卫", "[0,7) guard", "boolean"],
      ["tableCell", "命中表格单元", "Matched table cell", "cursor"],
      ["weekday", "星期字符串", "Weekday string", "output"],
    ],
    "输入索引，先验证范围，再让选择器落到唯一星期字符串。",
    "Enter an index, validate its range, then land the selector on exactly one weekday string.",
  ),
  60: mechanism(
    60,
    "insertion-sorted-prefix",
    "sorting",
    "drag",
    [
      ["values", "数组元素", "Array elements", "sequence"],
      ["key", "暂存 key", "Held key", "memory-cell"],
      ["sortedPrefix", "已排序前缀", "Sorted prefix", "sequence"],
      ["gap", "当前空槽", "Current gap", "cursor"],
    ],
    "抬出 key、右移较大元素并把 key 放回空槽，同时扩大已排序前缀。",
    "Lift key, shift larger items, place key in the gap, and grow the sorted prefix.",
  ),
});

export function getFoaSceneMechanism(order: number): FoaSceneMechanism {
  const mechanismValue = MECHANISMS[order];
  if (mechanismValue === undefined) {
    throw new RangeError(`FOA lesson ${String(order)} has no authored scene mechanism`);
  }
  return mechanismValue;
}

export function validateFoaSceneMechanisms(): void {
  const entries = Object.entries(MECHANISMS);
  if (entries.length !== 60) {
    throw new RangeError("FOA scene mechanisms must cover lessons 1 through 60");
  }
  const mechanismIds = new Set(entries.map(([, item]) => item.mechanismId));
  if (mechanismIds.size !== entries.length) {
    throw new RangeError("FOA scene mechanism IDs must be unique");
  }
  entries.forEach(([rawOrder, item]) => {
    const order = Number(rawOrder);
    if (!Number.isInteger(order) || order < 1 || order > 60) {
      throw new RangeError("FOA scene mechanism order is outside lessons 1 through 60");
    }
    if (!item.mechanismId.startsWith(`foa.mechanism.${String(order).padStart(3, "0")}.`)) {
      throw new RangeError(`FOA lesson ${String(order)} has a non-scoped mechanism ID`);
    }
    if (item.stateShape.length < 3 || item.observableLabels.length !== item.stateShape.length) {
      throw new RangeError(`FOA lesson ${String(order)} needs at least three observable fields`);
    }
  });
}

function mechanism(
  order: number,
  slug: string,
  observableKind: FoaSceneObservableKind,
  learnerControl: FoaSceneLearnerControl,
  stateTuples: readonly StateTuple[],
  caseGoalZh: string,
  caseGoalEn: string,
): FoaSceneMechanism {
  const ids = new Set<string>();
  const stateShape = Object.freeze(
    stateTuples.map(([id, zh, en, valueKind]) => {
      if (!/^[a-z][A-Za-z0-9]*$/u.test(id) || ids.has(id)) {
        throw new RangeError(`FOA lesson ${String(order)} has an invalid or duplicate state field`);
      }
      ids.add(id);
      return Object.freeze({ id, label: foaText(zh, en), valueKind });
    }),
  );
  return Object.freeze({
    mechanismId: `foa.mechanism.${String(order).padStart(3, "0")}.${slug}`,
    observableKind,
    observableLabels: Object.freeze(stateShape.map(({ label }) => label)),
    learnerControl,
    caseGoal: foaText(caseGoalZh, caseGoalEn),
    stateShape,
  });
}

validateFoaSceneMechanisms();
