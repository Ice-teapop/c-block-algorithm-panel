import { foaText, type FoaLessonDefinition, type FoaLocalizedText } from "./foa-contracts.js";
import {
  defineFlowLessonModel,
  type FlowEdgeKind,
  type FlowFrame,
  type FlowLessonModel,
  type FlowNodeRole,
} from "./flow-lesson-model.js";

export type FoaFlowLessonKind = "linear" | "branch" | "loop";

export type FoaFlowNodeRole = "input" | "state" | "operation" | "decision" | "merge" | "output";

export type FoaFlowEdgeKind = "next" | "true" | "false" | "back";

export type FoaFlowFrameKind =
  | "input"
  | "state"
  | "operation"
  | "decision"
  | "branch"
  | "merge"
  | "condition"
  | "body"
  | "update"
  | "back"
  | "output";

export type FoaFlowStateValue = number | string | boolean;

export interface FoaFlowInputDefinition {
  readonly minimum: number;
  readonly maximum: number;
  readonly defaultValue: number;
  readonly label: FoaLocalizedText;
  readonly summary: FoaLocalizedText;
}

export interface FoaFlowNodeDefinition {
  readonly id: string;
  readonly role: FoaFlowNodeRole;
  readonly label: FoaLocalizedText;
}

export interface FoaFlowEdgeDefinition {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly kind: FoaFlowEdgeKind;
  readonly label: FoaLocalizedText;
}

/**
 * One observable teaching transition. `edgeId` is the edge taken after the frame is evaluated.
 * A repeated source line may therefore own several frames, for example one per loop iteration.
 */
export interface FoaFlowFrame {
  readonly id: string;
  readonly kind: FoaFlowFrameKind;
  readonly nodeId: string;
  readonly edgeId?: string;
  readonly summary: FoaLocalizedText;
  readonly state: Readonly<Record<string, FoaFlowStateValue>>;
}

export interface FoaFlowExecution {
  readonly input: number;
  readonly output: number | string;
  readonly stdout: string;
  readonly frames: readonly FoaFlowFrame[];
  readonly skippedNodeIds: readonly string[];
}

export interface FoaFlowPredictionChoice {
  readonly id: string;
  readonly label: FoaLocalizedText;
}

export interface FoaFlowPredictionDefinition {
  /** The learner must answer while this node owns the runtime value. */
  readonly nodeId: string;
  readonly prompt: FoaLocalizedText;
  readonly choices: readonly FoaFlowPredictionChoice[];
}

export interface FoaFlowLessonModel {
  readonly lessonOrder: 2 | 5 | 16 | 22;
  readonly kind: FoaFlowLessonKind;
  readonly summary: FoaLocalizedText;
  readonly input: FoaFlowInputDefinition;
  readonly nodes: readonly FoaFlowNodeDefinition[];
  readonly edges: readonly FoaFlowEdgeDefinition[];
  readonly prediction?: FoaFlowPredictionDefinition | undefined;
  buildExecution(input: number): FoaFlowExecution;
}

const LINEAR_MODEL = defineModel({
  lessonOrder: 2,
  kind: "linear",
  summary: foaText(
    "让同一个输入值依次经过绑定、平方和输出。",
    "Move one input value through binding, squaring, and output.",
  ),
  input: inputDefinition(
    -99,
    99,
    7,
    "数字",
    "Number",
    "输入一个整数，观察它如何变成平方结果。",
    "Enter an integer and observe how it becomes its square.",
  ),
  nodes: [
    node("linear.input", "input", "输入", "Input"),
    node("linear.value", "state", "存入 value", "Store as value"),
    node("linear.square", "operation", "计算平方", "Square"),
    node("linear.output", "output", "输出", "Output"),
  ],
  edges: [
    edge("linear.input-to-value", "linear.input", "linear.value", "next", "保存", "store"),
    edge("linear.value-to-square", "linear.value", "linear.square", "next", "读取", "read"),
    edge("linear.square-to-output", "linear.square", "linear.output", "next", "输出", "write"),
  ],
  buildExecution(input) {
    const value = assertInput(input, 2, -99, 99);
    const squared = value * value;
    return execution(value, squared, [
      frame(
        "linear.frame.input",
        "input",
        "linear.input",
        "linear.input-to-value",
        `输入 ${String(value)}`,
        `Input ${String(value)}`,
        { input: value },
      ),
      frame(
        "linear.frame.value",
        "state",
        "linear.value",
        "linear.value-to-square",
        `value = ${String(value)}`,
        `value = ${String(value)}`,
        { input: value, value },
      ),
      frame(
        "linear.frame.square",
        "operation",
        "linear.square",
        "linear.square-to-output",
        `${String(value)} × ${String(value)} = ${String(squared)}`,
        `${String(value)} × ${String(value)} = ${String(squared)}`,
        { input: value, value, result: squared },
      ),
      frame(
        "linear.frame.output",
        "output",
        "linear.output",
        null,
        `输出 ${String(squared)}`,
        `Write ${String(squared)}`,
        { input: value, value, output: squared },
      ),
    ]);
  },
});

const BOUNDARY_CASE_MODEL = defineModel({
  lessonOrder: 5,
  kind: "branch",
  summary: foaText(
    "输入一个整数，先预测它属于正数、负数还是零，再用实际比较路径验证。",
    "Enter an integer, predict whether it is positive, negative, or zero, then verify the guess on the actual comparison path.",
  ),
  input: inputDefinition(
    -99,
    99,
    0,
    "value",
    "value",
    "输入正数、负数或零；这个值会作为同一个对象进入 value。",
    "Enter a positive number, a negative number, or zero; the same value object will enter value.",
  ),
  nodes: [
    node("boundary.input", "input", "输入整数", "Input integer"),
    node("boundary.value", "state", "存入 value", "Store as value"),
    node("boundary.positive", "decision", "value > 0？", "value > 0?"),
    node("boundary.negative", "decision", "value < 0？", "value < 0?"),
    node("boundary.output-positive", "output", "正数", "Positive"),
    node("boundary.output-negative", "output", "负数", "Negative"),
    node("boundary.output-zero", "output", "零", "Zero"),
  ],
  edges: [
    edge("boundary.input-to-value", "boundary.input", "boundary.value", "next", "绑定", "bind"),
    edge(
      "boundary.value-to-positive",
      "boundary.value",
      "boundary.positive",
      "next",
      "开始比较",
      "compare",
    ),
    edge(
      "boundary.positive",
      "boundary.positive",
      "boundary.output-positive",
      "true",
      "真",
      "true",
    ),
    edge("boundary.not-positive", "boundary.positive", "boundary.negative", "false", "假", "false"),
    edge(
      "boundary.negative",
      "boundary.negative",
      "boundary.output-negative",
      "true",
      "真",
      "true",
    ),
    edge("boundary.zero", "boundary.negative", "boundary.output-zero", "false", "假", "false"),
  ],
  prediction: {
    nodeId: "boundary.value",
    prompt: foaText("先预测 value 的类别", "Predict the category of value first"),
    choices: [
      { id: "positive", label: foaText("正数", "Positive") },
      { id: "negative", label: foaText("负数", "Negative") },
      { id: "zero", label: foaText("零", "Zero") },
    ],
  },
  buildExecution(input) {
    const value = assertInput(input, 5, -99, 99);
    const category = value > 0 ? "positive" : value < 0 ? "negative" : "zero";
    const positive = value > 0;
    const frames: FoaFlowFrame[] = [
      frame(
        "boundary.frame.input",
        "input",
        "boundary.input",
        "boundary.input-to-value",
        `输入 ${String(value)}`,
        `Input ${String(value)}`,
        { input: value },
      ),
      frame(
        "boundary.frame.value",
        "state",
        "boundary.value",
        "boundary.value-to-positive",
        `value = ${String(value)}；先预测类别`,
        `value = ${String(value)}; predict its category first`,
        { input: value, value, prediction: category },
      ),
      frame(
        "boundary.frame.positive",
        "decision",
        "boundary.positive",
        positive ? "boundary.positive" : "boundary.not-positive",
        `${String(value)} > 0 → ${positive ? "真" : "假"}`,
        `${String(value)} > 0 → ${positive ? "true" : "false"}`,
        { input: value, value, condition: positive },
      ),
    ];

    if (!positive) {
      const negative = value < 0;
      frames.push(
        frame(
          "boundary.frame.negative",
          "decision",
          "boundary.negative",
          negative ? "boundary.negative" : "boundary.zero",
          `${String(value)} < 0 → ${negative ? "真" : "假"}`,
          `${String(value)} < 0 → ${negative ? "true" : "false"}`,
          { input: value, value, condition: negative },
        ),
      );
    }

    const outputNodeId = `boundary.output-${category}`;
    frames.push(
      frame(
        "boundary.frame.output",
        "output",
        outputNodeId,
        null,
        `输出 ${category}`,
        `Write ${category}`,
        { input: value, value, output: category },
      ),
    );

    const skippedNodeIds =
      category === "positive"
        ? ["boundary.negative", "boundary.output-negative", "boundary.output-zero"]
        : category === "negative"
          ? ["boundary.output-positive", "boundary.output-zero"]
          : ["boundary.output-positive", "boundary.output-negative"];
    return execution(value, category, frames, skippedNodeIds);
  },
});

const BRANCH_MODEL = defineModel({
  lessonOrder: 16,
  kind: "branch",
  summary: foaText(
    "根据 value < 0 决定是否改写 value，然后输出结果。",
    "Use value < 0 to decide whether to rewrite value, then write the result.",
  ),
  input: inputDefinition(
    -99,
    99,
    -7,
    "value",
    "value",
    "输入正数、零或负数，观察实际执行的分支。",
    "Enter a positive, zero, or negative number and observe the executed branch.",
  ),
  nodes: [
    node("branch.decision", "decision", "value < 0？", "value < 0?"),
    node("branch.update", "operation", "value = -value", "value = -value"),
    node("branch.output", "output", "输出 value", "Write value"),
  ],
  edges: [
    edge("branch.true", "branch.decision", "branch.update", "true", "真", "true"),
    edge("branch.false", "branch.decision", "branch.output", "false", "假", "false"),
    edge("branch.update-to-output", "branch.update", "branch.output", "next", "输出", "write"),
  ],
  prediction: {
    nodeId: "branch.decision",
    prompt: foaText("预测：value < 0 成立吗？", "Predict: is value < 0 true?"),
    choices: [
      { id: "true", label: foaText("成立", "True") },
      { id: "false", label: foaText("不成立", "False") },
    ],
  },
  buildExecution(input) {
    const value = assertInput(input, 16, -99, 99);
    const takesUpdate = value < 0;
    const output = takesUpdate ? -value : value;
    const frames: FoaFlowFrame[] = [
      frame(
        "branch.frame.decision",
        "decision",
        "branch.decision",
        takesUpdate ? "branch.true" : "branch.false",
        "判断 value < 0",
        "Decide whether value < 0",
        { input: value, value, predicate: takesUpdate, prediction: String(takesUpdate) },
      ),
    ];

    if (takesUpdate) {
      frames.push(
        frame(
          "branch.frame.update",
          "update",
          "branch.update",
          "branch.update-to-output",
          `改写 value：${String(value)} → ${String(output)}`,
          `Rewrite value: ${String(value)} → ${String(output)}`,
          { input: value, value: output, previousValue: value },
        ),
      );
    }

    frames.push(
      frame(
        "branch.frame.output",
        "output",
        "branch.output",
        null,
        `输出 ${String(output)}`,
        `Write ${String(output)}`,
        { input: value, value: output, output },
      ),
    );

    return execution(value, output, frames, takesUpdate ? [] : ["branch.update"]);
  },
});

const LOOP_MODEL = defineModel({
  lessonOrder: 22,
  kind: "loop",
  summary: foaText(
    "逐轮检查条件、累加 i、更新 i 并回到条件，直到输出 sum。",
    "Check, add i, update i, and return to the condition until sum is written.",
  ),
  input: inputDefinition(
    0,
    12,
    5,
    "n",
    "n",
    "输入循环上限，逐轮观察 i 和 sum。",
    "Enter the loop limit and observe i and sum in every iteration.",
  ),
  nodes: [
    node("loop.init", "state", "i=1，sum=0", "i=1, sum=0"),
    node("loop.condition", "decision", "i ≤ n？", "i ≤ n?"),
    node("loop.body", "operation", "sum += i", "sum += i"),
    node("loop.update", "operation", "i++", "i++"),
    node("loop.output", "output", "输出 sum", "Write sum"),
  ],
  edges: [
    edge("loop.init-to-condition", "loop.init", "loop.condition", "next", "开始检查", "check"),
    edge("loop.true", "loop.condition", "loop.body", "true", "真", "true"),
    edge("loop.false", "loop.condition", "loop.output", "false", "假", "false"),
    edge("loop.body-to-update", "loop.body", "loop.update", "next", "更新 sum", "update sum"),
    edge("loop.back", "loop.update", "loop.condition", "back", "回到条件", "back to condition"),
  ],
  buildExecution(input) {
    const n = assertInput(input, 22, 0, 12);
    let i = 1;
    let sum = 0;
    let iteration = 0;
    const frames: FoaFlowFrame[] = [
      frame(
        "loop.frame.init",
        "state",
        "loop.init",
        "loop.init-to-condition",
        `建立 i=1，sum=0，n=${String(n)}`,
        `Create i=1, sum=0, n=${String(n)}`,
        { n, i, sum, iteration },
      ),
    ];

    while (true) {
      const condition = i <= n;
      frames.push(
        frame(
          `loop.frame.condition.${String(iteration)}`,
          "condition",
          "loop.condition",
          condition ? "loop.true" : "loop.false",
          `i=${String(i)} ≤ n=${String(n)} → ${condition ? "真" : "假"}`,
          `i=${String(i)} ≤ n=${String(n)} → ${condition ? "true" : "false"}`,
          { n, i, sum, iteration, condition },
        ),
      );
      if (!condition) break;

      iteration += 1;
      const previousSum = sum;
      sum += i;
      frames.push(
        frame(
          `loop.frame.body.${String(iteration)}`,
          "body",
          "loop.body",
          "loop.body-to-update",
          `第 ${String(iteration)} 轮：sum=${String(previousSum)} + i=${String(i)} → sum=${String(sum)}`,
          `Iteration ${String(iteration)}: sum=${String(previousSum)} + i=${String(i)} → sum=${String(sum)}`,
          { n, i, sum, previousSum, iteration },
        ),
      );

      const previousI = i;
      i += 1;
      frames.push(
        frame(
          `loop.frame.update.${String(iteration)}`,
          "update",
          "loop.update",
          null,
          `i=${String(previousI)} → i=${String(i)}`,
          `i=${String(previousI)} → i=${String(i)}`,
          { n, i, sum, previousI, iteration },
        ),
        frame(
          `loop.frame.back.${String(iteration)}`,
          "back",
          "loop.condition",
          "loop.back",
          `带着 i=${String(i)}、sum=${String(sum)} 回到条件`,
          `Return to the condition with i=${String(i)}, sum=${String(sum)}`,
          { n, i, sum, iteration },
        ),
      );
    }

    frames.push(
      frame(
        "loop.frame.output",
        "output",
        "loop.output",
        null,
        n === 0 ? "n=0，i=1 ≤ n=0 为假；循环体不执行，输出 sum=0" : `输出 sum=${String(sum)}`,
        n === 0
          ? "n=0, i=1 ≤ n=0 is false; the loop body does not run, output sum=0"
          : `Write sum=${String(sum)}`,
        { n, i, sum, output: sum, iteration },
      ),
    );
    return execution(n, sum, frames, n === 0 ? ["loop.body", "loop.update"] : []);
  },
});

export const FOA_FLOW_LESSON_MODELS: Readonly<
  Partial<Record<FoaFlowLessonModel["lessonOrder"], FoaFlowLessonModel>>
> = Object.freeze({
  2: LINEAR_MODEL,
  5: BOUNDARY_CASE_MODEL,
  16: BRANCH_MODEL,
  22: LOOP_MODEL,
});

export function getFoaFlowLessonModel(
  lesson: number | Pick<FoaLessonDefinition, "order">,
): FoaFlowLessonModel | null {
  const order = typeof lesson === "number" ? lesson : lesson.order;
  if (order !== 2 && order !== 5 && order !== 16 && order !== 22) return null;
  return FOA_FLOW_LESSON_MODELS[order] ?? null;
}

/**
 * Adapts the reviewed FOA examples to the generic immutable FlowFrame contract. This is the only
 * place that maps four source anchors onto repeated branch and loop frames.
 */
export function createFoaFlowLessonGraph(model: FoaFlowLessonModel): FlowLessonModel<number> {
  return defineFlowLessonModel({
    sceneKind: model.kind,
    input: {
      id: `foa.${String(model.lessonOrder)}.input`,
      label: model.input.label,
      defaultValue: model.input.defaultValue,
    },
    nodes: model.nodes.map((item) => ({
      id: item.id,
      label: item.label,
      sourceEventIndex: sourceEventIndex(model.lessonOrder, item.id),
      role: flowNodeRole(item.role),
    })),
    edges: model.edges.map((item) => ({
      id: item.id,
      from: item.from,
      to: item.to,
      kind: flowEdgeKind(item.kind),
      label: item.label,
    })),
    createFrames(input) {
      const execution = model.buildExecution(input);
      const completed = new Set<string>();
      return execution.frames.map((item, index): FlowFrame => {
        const values = Object.freeze(
          Object.fromEntries(
            Object.entries(item.state).map(([key, value]) => [key, String(value)] as const),
          ),
        );
        const result = Object.freeze({
          id: item.id,
          activeNodeId: item.nodeId,
          activeEdgeIds: Object.freeze(item.edgeId === undefined ? [] : [item.edgeId]),
          completedNodeIds: Object.freeze([...completed]),
          skippedNodeIds:
            model.kind === "branch" && index <= predictionFrameIndex(model, execution.frames)
              ? Object.freeze([] as string[])
              : execution.skippedNodeIds,
          values,
          sourceEventIndex: sourceEventIndex(model.lessonOrder, item.nodeId),
          summary: item.summary,
          ...(typeof item.state.iteration === "number" ? { iteration: item.state.iteration } : {}),
          ...(index === execution.frames.length - 1 ? { output: String(execution.output) } : {}),
        }) satisfies FlowFrame;
        if (!execution.skippedNodeIds.includes(item.nodeId)) completed.add(item.nodeId);
        return result;
      });
    },
  });
}

function flowNodeRole(role: FoaFlowNodeRole): FlowNodeRole {
  if (role === "input") return "input";
  if (role === "decision") return "decision";
  if (role === "output") return "output";
  return "process";
}

function flowEdgeKind(kind: FoaFlowEdgeKind): FlowEdgeKind {
  return kind === "next" ? "forward" : kind;
}

function sourceEventIndex(order: FoaFlowLessonModel["lessonOrder"], nodeId: string): number {
  if (order === 2) {
    if (nodeId === "linear.input") return 0;
    if (nodeId === "linear.value") return 1;
    if (nodeId === "linear.square") return 2;
    return 3;
  }
  if (order === 5) {
    if (nodeId === "boundary.input" || nodeId === "boundary.value") return 0;
    if (nodeId === "boundary.positive") return 1;
    if (nodeId === "boundary.negative") return 2;
    return 3;
  }
  if (order === 16) {
    if (nodeId === "branch.decision") return 0;
    if (nodeId === "branch.update") return 2;
    if (nodeId === "branch.output") return 3;
    return 1;
  }
  if (nodeId === "loop.init") return 0;
  if (nodeId === "loop.condition") return 1;
  if (nodeId === "loop.body") return 2;
  return 3;
}

function inputDefinition(
  minimum: number,
  maximum: number,
  defaultValue: number,
  labelZh: string,
  labelEn: string,
  summaryZh: string,
  summaryEn: string,
): FoaFlowInputDefinition {
  return Object.freeze({
    minimum,
    maximum,
    defaultValue,
    label: foaText(labelZh, labelEn),
    summary: foaText(summaryZh, summaryEn),
  });
}

function node(
  id: string,
  role: FoaFlowNodeRole,
  labelZh: string,
  labelEn: string,
): FoaFlowNodeDefinition {
  return Object.freeze({ id, role, label: foaText(labelZh, labelEn) });
}

function edge(
  id: string,
  from: string,
  to: string,
  kind: FoaFlowEdgeKind,
  labelZh: string,
  labelEn: string,
): FoaFlowEdgeDefinition {
  return Object.freeze({ id, from, to, kind, label: foaText(labelZh, labelEn) });
}

function frame(
  id: string,
  kind: FoaFlowFrameKind,
  nodeId: string,
  edgeId: string | null,
  summaryZh: string,
  summaryEn: string,
  state: Record<string, FoaFlowStateValue>,
): FoaFlowFrame {
  return Object.freeze({
    id,
    kind,
    nodeId,
    ...(edgeId === null ? {} : { edgeId }),
    summary: foaText(summaryZh, summaryEn),
    state: Object.freeze({ ...state }),
  });
}

function execution(
  input: number,
  output: number | string,
  frames: readonly FoaFlowFrame[],
  skippedNodeIds: readonly string[] = [],
): FoaFlowExecution {
  return Object.freeze({
    input,
    output,
    stdout: `${String(output)}\n`,
    frames: Object.freeze([...frames]),
    skippedNodeIds: Object.freeze(skippedNodeIds.filter((id) => id.length > 0)),
  });
}

function defineModel(model: FoaFlowLessonModel): FoaFlowLessonModel {
  const nodeIds = new Set(model.nodes.map((item) => item.id));
  if (nodeIds.size !== model.nodes.length) {
    throw new TypeError(`FOA flow lesson ${String(model.lessonOrder)} has duplicate node IDs`);
  }
  const edgeIds = new Set<string>();
  for (const item of model.edges) {
    if (edgeIds.has(item.id)) {
      throw new TypeError(`FOA flow lesson ${String(model.lessonOrder)} has duplicate edge IDs`);
    }
    edgeIds.add(item.id);
    if (!nodeIds.has(item.from) || !nodeIds.has(item.to)) {
      throw new TypeError(
        `FOA flow lesson ${String(model.lessonOrder)} has an invalid edge endpoint`,
      );
    }
  }
  if (
    !Number.isInteger(model.input.defaultValue) ||
    model.input.defaultValue < model.input.minimum ||
    model.input.defaultValue > model.input.maximum
  ) {
    throw new RangeError(
      `FOA flow lesson ${String(model.lessonOrder)} has an invalid default input`,
    );
  }
  if (model.prediction !== undefined) {
    if (!nodeIds.has(model.prediction.nodeId)) {
      throw new TypeError(
        `FOA flow lesson ${String(model.lessonOrder)} has an invalid prediction node`,
      );
    }
    if (model.prediction.choices.length < 2) {
      throw new RangeError(
        `FOA flow lesson ${String(model.lessonOrder)} requires at least two prediction choices`,
      );
    }
    const choiceIds = new Set(model.prediction.choices.map((choice) => choice.id));
    if (choiceIds.size !== model.prediction.choices.length) {
      throw new TypeError(
        `FOA flow lesson ${String(model.lessonOrder)} has duplicate prediction choices`,
      );
    }
  }
  return Object.freeze({
    ...model,
    nodes: Object.freeze([...model.nodes]),
    edges: Object.freeze([...model.edges]),
    ...(model.prediction === undefined
      ? {}
      : {
          prediction: Object.freeze({
            ...model.prediction,
            choices: Object.freeze(
              model.prediction.choices.map((choice) => Object.freeze({ ...choice })),
            ),
          }),
        }),
  });
}

function assertInput(
  input: number,
  lessonOrder: FoaFlowLessonModel["lessonOrder"],
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(input) || input < minimum || input > maximum) {
    throw new RangeError(
      `FOA flow lesson ${String(lessonOrder)} expects an integer from ${String(minimum)} to ${String(maximum)}`,
    );
  }
  return input;
}

function predictionFrameIndex(model: FoaFlowLessonModel, frames: readonly FoaFlowFrame[]): number {
  if (model.prediction === undefined) return -1;
  return frames.findIndex((frame) => frame.nodeId === model.prediction?.nodeId);
}
