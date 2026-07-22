import type { FoaLocale } from "../tutorials/foa-contracts.js";
import type { FoaFlowLessonKind, FoaFlowLessonModel } from "../tutorials/foa-flow-lesson-models.js";
import type { FlowFrame, FlowLessonModel } from "../tutorials/flow-lesson-model.js";
import {
  createEdgeLayer,
  nodePosition,
  observeEdgeGeometry,
} from "./foa-data-flow-demo-geometry.js";

export interface DemoElements {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly inputSummary: HTMLElement;
  readonly evidence: HTMLElement;
  readonly changeInput: HTMLButtonElement;
  readonly frame: HTMLElement;
  readonly canvas: HTMLElement;
  readonly graph: HTMLElement;
  readonly nodeElements: ReadonlyMap<string, HTMLButtonElement>;
  readonly nodeLabels: ReadonlyMap<string, HTMLElement>;
  readonly nodeDetails: ReadonlyMap<string, HTMLElement>;
  readonly valueMounts: ReadonlyMap<string, HTMLElement>;
  readonly edgeElements: ReadonlyMap<string, SVGPathElement>;
  readonly refreshEdgeGeometry: () => void;
  readonly disconnectEdgeGeometry: () => void;
  readonly movingValue: HTMLElement;
  readonly iterations: HTMLElement;
  readonly observation: HTMLElement;
  readonly prediction: HTMLElement;
  readonly predictionPrompt: HTMLElement;
  readonly predictionButtons: ReadonlyMap<string, HTMLButtonElement>;
  readonly previous: HTMLButtonElement;
  readonly playPause: HTMLButtonElement;
  readonly next: HTMLButtonElement;
  readonly timeline: HTMLInputElement;
  readonly position: HTMLElement;
  readonly dialog: HTMLDialogElement;
  readonly dialogTitle: HTMLElement;
  readonly dialogDescription: HTMLElement;
  readonly inputLabel: HTMLLabelElement;
  readonly input: HTMLInputElement;
  readonly error: HTMLElement;
  readonly cancel: HTMLButtonElement;
  readonly submit: HTMLButtonElement;
}

export const FOA_DATA_FLOW_DEMO_COPY = Object.freeze({
  zh: Object.freeze({
    title: "数据流",
    input: "输入",
    evidence: "用户输入 · 路径推演",
    changeInput: "更换输入",
    previous: "上一步",
    play: "播放",
    pause: "暂停",
    next: "下一步",
    timeline: "流程时间线",
    output: "输出",
    pending: "等待执行",
    active: "当前",
    done: "已执行",
    skipped: "未经过",
    ready: "等待下一步",
    running: "运行中",
    paused: "已暂停",
    prediction: "等待预测",
    completed: "已完成",
    currentPath: "当前位置",
    traversingPath: "正在",
    completedPath: "已走",
    cancel: "取消",
    confirm: "使用这个输入",
    invalid: (minimum: number, maximum: number) =>
      `请输入 ${String(minimum)} 到 ${String(maximum)} 之间的整数。`,
    iteration: "轮",
    predictBranch: "预测：条件成立吗？",
    predictionCorrect: "路径判断正确。",
    predictionWrong: "再看一次条件和值。",
  }),
  en: Object.freeze({
    title: "Data flow",
    input: "Input",
    evidence: "Learner input · path simulation",
    changeInput: "Change input",
    previous: "Previous",
    play: "Play",
    pause: "Pause",
    next: "Next",
    timeline: "Flow timeline",
    output: "Output",
    pending: "Waiting",
    active: "Current",
    done: "Executed",
    skipped: "Not taken",
    ready: "Ready for next step",
    running: "Running",
    paused: "Paused",
    prediction: "Prediction required",
    completed: "Completed",
    currentPath: "Current",
    traversingPath: "Moving",
    completedPath: "Path",
    cancel: "Cancel",
    confirm: "Use this input",
    invalid: (minimum: number, maximum: number) =>
      `Enter an integer from ${String(minimum)} to ${String(maximum)}.`,
    iteration: "iteration",
    predictBranch: "Predict: is the condition true?",
    predictionCorrect: "Path prediction correct.",
    predictionWrong: "Check the condition and value again.",
  }),
});

// This module owns the stable DOM shape; the controller owns all mutable lesson state.
export function mountDemo(
  ownerDocument: Document,
  lessonOrder: number,
  definition: FoaFlowLessonModel,
  graph: FlowLessonModel<number>,
): DemoElements {
  const root = ownerDocument.createElement("section");
  root.className = "foa-flow-demo";
  root.dataset.flowLessonOrder = String(lessonOrder);
  root.dataset.flowFrameKind = definition.kind;
  root.setAttribute("aria-labelledby", `foa-flow-demo-title-${String(lessonOrder)}`);

  const header = ownerDocument.createElement("header");
  const heading = ownerDocument.createElement("div");
  const title = ownerDocument.createElement("strong");
  title.id = `foa-flow-demo-title-${String(lessonOrder)}`;
  const inputSummary = ownerDocument.createElement("span");
  const evidence = ownerDocument.createElement("span");
  evidence.className = "foa-flow-demo__evidence";
  const changeInput = actionButton(ownerDocument, "change-input");
  heading.append(title, inputSummary, evidence);
  header.append(heading, changeInput);

  const frame = ownerDocument.createElement("section");
  frame.className = "foa-flow-demo__frame";
  frame.dataset.flowFrame = "true";
  frame.tabIndex = 0;

  const canvas = ownerDocument.createElement("div");
  canvas.className = "foa-flow-demo__canvas";
  canvas.dataset.flowCanvas = "true";
  const graphHost = ownerDocument.createElement("div");
  graphHost.className = "foa-flow-demo__graph";
  graphHost.dataset.sceneKind = definition.kind;
  const svg = createEdgeLayer(ownerDocument, lessonOrder, definition.kind, graph.edges);
  const edgeElements = new Map<string, SVGPathElement>();
  for (const path of svg.querySelectorAll<SVGPathElement>("[data-flow-edge-id]")) {
    edgeElements.set(path.dataset.flowEdgeId!, path);
  }
  graphHost.append(svg);

  const nodeElements = new Map<string, HTMLButtonElement>();
  const nodeLabels = new Map<string, HTMLElement>();
  const nodeDetails = new Map<string, HTMLElement>();
  const valueMounts = new Map<string, HTMLElement>();
  for (const node of graph.nodes) {
    const element = ownerDocument.createElement("button");
    element.type = "button";
    element.className = "foa-flow-demo__node";
    element.dataset.flowNodeId = node.id;
    element.dataset.flowNode = publicNodeName(node.id);
    element.dataset.nodeRole = node.role;
    const position = nodePosition(definition.kind, node.id);
    element.style.setProperty("--flow-node-x", position.x);
    element.style.setProperty("--flow-node-y", position.y);
    const label = ownerDocument.createElement("strong");
    const detail = ownerDocument.createElement("small");
    const valueMount = ownerDocument.createElement("span");
    valueMount.className = "foa-flow-demo__value-mount";
    element.append(label, detail, valueMount);
    graphHost.append(element);
    nodeElements.set(node.id, element);
    nodeLabels.set(node.id, label);
    nodeDetails.set(node.id, detail);
    valueMounts.set(node.id, valueMount);
  }

  const movingValue = ownerDocument.createElement("span");
  movingValue.className = "foa-flow-demo__moving-value";
  movingValue.dataset.flowValueId = "runtime-value";
  movingValue.dataset.teachingTokenId = "runtime-value";
  valueMounts.get(graph.nodes[0]!.id)?.append(movingValue);

  const edgeGeometry = observeEdgeGeometry(
    ownerDocument,
    definition.kind,
    graphHost,
    svg,
    graph.edges,
    nodeElements,
    edgeElements,
  );

  const iterations = ownerDocument.createElement("div");
  iterations.className = "foa-flow-demo__iterations";
  const observation = ownerDocument.createElement("p");
  observation.className = "foa-flow-demo__observation";
  observation.dataset.flowObservation = "true";
  observation.setAttribute("aria-live", "polite");
  const prediction = ownerDocument.createElement("div");
  prediction.className = "foa-flow-demo__prediction";
  prediction.hidden = true;
  const predictionPrompt = ownerDocument.createElement("span");
  prediction.append(predictionPrompt);
  const predictionButtons = new Map<string, HTMLButtonElement>();
  for (const choice of definition.prediction?.choices ?? []) {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.dataset.flowPrediction = choice.id;
    prediction.append(button);
    predictionButtons.set(choice.id, button);
  }
  canvas.append(graphHost, iterations, prediction, observation);

  const controls = ownerDocument.createElement("div");
  controls.className = "foa-flow-demo__controls";
  const previous = flowControl(ownerDocument, "previous");
  const playPause = flowControl(ownerDocument, "play-pause");
  playPause.setAttribute("aria-pressed", "false");
  const next = flowControl(ownerDocument, "next");
  const timeline = ownerDocument.createElement("input");
  timeline.type = "range";
  timeline.min = "0";
  timeline.max = "1";
  timeline.step = "1";
  timeline.value = "0";
  timeline.dataset.flowTimeline = "true";
  const position = ownerDocument.createElement("span");
  position.className = "foa-flow-demo__position";
  controls.append(previous, playPause, next, timeline, position);
  frame.append(canvas, controls);

  const dialog = ownerDocument.createElement("dialog");
  dialog.className = "foa-flow-input-dialog";
  dialog.dataset.taskLessonDialog = "input";
  const dialogTitleId = `foa-flow-input-title-${String(lessonOrder)}`;
  const dialogDescriptionId = `foa-flow-input-description-${String(lessonOrder)}`;
  const dialogErrorId = `foa-flow-input-error-${String(lessonOrder)}`;
  dialog.setAttribute("aria-labelledby", dialogTitleId);
  dialog.setAttribute("aria-describedby", `${dialogDescriptionId} ${dialogErrorId}`);
  const form = ownerDocument.createElement("form");
  form.className = "foa-flow-input-dialog__surface";
  const dialogTitle = ownerDocument.createElement("h2");
  dialogTitle.id = dialogTitleId;
  const dialogDescription = ownerDocument.createElement("p");
  dialogDescription.id = dialogDescriptionId;
  const inputLabel = ownerDocument.createElement("label");
  const inputId = `foa-flow-input-${String(lessonOrder)}`;
  inputLabel.htmlFor = inputId;
  const input = ownerDocument.createElement("input");
  input.id = inputId;
  input.type = "number";
  input.inputMode = "numeric";
  input.min = String(definition.input.minimum);
  input.max = String(definition.input.maximum);
  input.step = "1";
  input.dataset.taskLessonInput = "runtime-value";
  input.setAttribute("aria-describedby", dialogErrorId);
  const error = ownerDocument.createElement("p");
  error.id = dialogErrorId;
  error.className = "foa-flow-input-dialog__error";
  error.setAttribute("role", "alert");
  const footer = ownerDocument.createElement("footer");
  const cancel = actionButton(ownerDocument, "cancel-input");
  const submit = actionButton(ownerDocument, "submit-input");
  submit.type = "submit";
  submit.classList.add("button--primary");
  footer.append(cancel, submit);
  form.append(dialogTitle, dialogDescription, inputLabel, input, error, footer);
  dialog.append(form);
  root.append(header, frame, dialog);

  return {
    root,
    title,
    inputSummary,
    evidence,
    changeInput,
    frame,
    canvas,
    graph: graphHost,
    nodeElements,
    nodeLabels,
    nodeDetails,
    valueMounts,
    edgeElements,
    refreshEdgeGeometry: edgeGeometry.refresh,
    disconnectEdgeGeometry: edgeGeometry.disconnect,
    movingValue,
    iterations,
    observation,
    prediction,
    predictionPrompt,
    predictionButtons,
    previous,
    playPause,
    next,
    timeline,
    position,
    dialog,
    dialogTitle,
    dialogDescription,
    inputLabel,
    input,
    error,
    cancel,
    submit,
  };
}

export function movingValueText(frame: FlowFrame, kind: FoaFlowLessonKind): string {
  if (frame.output !== undefined) return frame.output;
  if (kind === "loop") {
    const i = frame.values.i;
    const sum = frame.values.sum;
    return i === undefined || sum === undefined ? (frame.values.n ?? "") : `i=${i} · Σ=${sum}`;
  }
  return frame.values.result ?? frame.values.value ?? frame.values.input ?? "";
}

export function transitionValueText(
  source: FlowFrame,
  target: FlowFrame,
  kind: FoaFlowLessonKind,
  forward: boolean,
): string {
  if (!forward) return movingValueText(target, kind);
  if (kind === "linear" && target.activeNodeId === "linear.square") {
    const operand = target.values.value ?? source.values.value ?? source.values.input ?? "";
    if (operand.length > 0) return `${operand} × ${operand}`;
  }
  return movingValueText(source, kind);
}

export function nodeDetail(frame: FlowFrame, kind: FoaFlowLessonKind, locale: FoaLocale): string {
  if (kind === "linear" || kind === "branch") return "";
  if (kind !== "loop") return frame.summary[locale];
  const state = frame.values;
  if (frame.activeNodeId === "loop.body") {
    return `${state.previousSum ?? "0"} + ${state.i ?? ""} = ${state.sum ?? ""}`;
  }
  if (frame.activeNodeId === "loop.condition") {
    return `${state.i ?? ""} ≤ ${state.n ?? ""} → ${state.condition ?? ""}`;
  }
  if (frame.activeNodeId === "loop.init") return `n=${state.n ?? ""}`;
  return frame.summary[locale];
}

// Loop nodes may recur, so navigation prefers the next occurrence before wrapping backward.
export function nearestFrameForNode(
  timeline: readonly FlowFrame[],
  nodeId: string,
  currentIndex: number,
): number | null {
  const after = timeline.findIndex(
    (item, index) => index >= currentIndex && item.activeNodeId === nodeId,
  );
  if (after >= 0) return after;
  const before = timeline.findIndex((item) => item.activeNodeId === nodeId);
  return before >= 0 ? before : null;
}

export function parseInteger(value: string, minimum: number, maximum: number): number | null {
  const normalized = value.trim();
  if (!/^-?\d+$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) return null;
  return parsed;
}

export function inputDialogTitle(
  lessonOrder: number,
  kind: FoaFlowLessonKind,
  locale: FoaLocale,
): string {
  if (kind === "linear") return locale === "zh" ? "输入一个数字" : "Enter a number";
  if (lessonOrder === 5) {
    return locale === "zh"
      ? "输入正数、负数或零"
      : "Enter a positive number, negative number, or zero";
  }
  if (kind === "branch") {
    return locale === "zh" ? "输入正数或负数" : "Enter a positive or negative number";
  }
  return locale === "zh" ? "输入循环上限" : "Enter the loop limit";
}

export function prefersReducedMotion(ownerDocument: Document): boolean {
  return (
    ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
  );
}

function publicNodeName(nodeId: string): string {
  if (nodeId.endsWith("decision") || nodeId.endsWith("condition")) return "condition";
  if (nodeId.endsWith("update")) return "update";
  if (nodeId.endsWith("body")) return "loop-body";
  if (nodeId.endsWith("init")) return "input";
  return nodeId.split(".").at(-1) ?? nodeId;
}

function actionButton(ownerDocument: Document, action: string): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "button";
  button.dataset.taskLessonAction = action;
  return button;
}

function flowControl(ownerDocument: Document, action: string): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "foa-flow-demo__control";
  button.dataset.flowControl = action;
  return button;
}
