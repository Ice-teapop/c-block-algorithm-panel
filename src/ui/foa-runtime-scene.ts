import type { FoaLessonDefinition, FoaLocale } from "../tutorials/foa-contracts.js";
import type { FoaInteractiveRun } from "../tutorials/foa-interactive-inputs.js";
import {
  createFoaRuntimeModel,
  type FoaRuntimeFrame,
  type FoaRuntimeModel,
} from "../tutorials/foa-runtime-frames.js";
import type { FoaRuntimeEvidenceToken } from "../tutorials/foa-runtime-evidence-contracts.js";
import type { FoaSceneProfile } from "../tutorials/foa-scene-profile.js";
import type {
  FoaSemanticSceneController,
  FoaSemanticSceneOptions,
  FoaSemanticSceneState,
} from "./foa-semantic-scene.js";
import {
  createFoaSignatureContractScene,
  type FoaSignatureContractScene,
} from "./foa-signature-contract-scene.js";

export interface FoaRuntimeSceneController extends FoaSemanticSceneController {
  animatePreviewAdvance(fromIndex: number, toIndex: number): Promise<void> | null;
}

interface RuntimeCopy {
  readonly lessonCase: string;
  readonly currentInput: string;
  readonly input: string;
  readonly output: string;
  readonly pendingOutput: string;
  readonly changeInput: string;
  readonly ready: string;
  readonly running: string;
  readonly paused: string;
  readonly completed: string;
  readonly current: string;
  readonly done: string;
  readonly pending: string;
  readonly preview: string;
  readonly action: string;
  readonly values: string;
  readonly history: string;
  readonly branch: string;
  readonly truePath: string;
  readonly falsePath: string;
  readonly stack: string;
  readonly push: string;
  readonly pop: string;
  readonly memory: string;
  readonly connect: string;
  readonly inspect: string;
  readonly stream: string;
  readonly evidence: string;
  readonly iteration: string;
  readonly selectValue: string;
  readonly noRelation: string;
  readonly fixedBoundary: string;
  readonly interactiveBoundary: string;
}

interface ValueElements {
  readonly root: HTMLButtonElement;
  readonly label: HTMLElement;
  readonly value: HTMLOutputElement;
}

interface HistoryElements {
  readonly root: HTMLLIElement;
  readonly title: HTMLElement;
  readonly detail: HTMLElement;
}

interface ObservationElements {
  readonly root: HTMLElement;
  readonly label: HTMLElement;
  readonly value: HTMLOutputElement;
}

interface RuntimeDragGesture {
  readonly source: HTMLButtonElement;
  readonly valueId: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  moved: boolean;
}

interface ScenePoint {
  readonly x: number;
  readonly y: number;
}

const COPY: Readonly<Record<FoaLocale, RuntimeCopy>> = Object.freeze({
  zh: Object.freeze({
    lessonCase: "本课案例",
    currentInput: "当前输入",
    input: "输入",
    output: "输出",
    pendingOutput: "完成后显示",
    changeInput: "更换输入",
    ready: "就绪",
    running: "运行中",
    paused: "已暂停",
    completed: "已完成",
    current: "点击执行",
    done: "已执行",
    pending: "待执行",
    preview: "预览",
    action: "当前动作",
    values: "状态值",
    history: "运行轨迹",
    branch: "分支",
    truePath: "成立",
    falsePath: "不成立",
    stack: "调用栈",
    push: "压入栈帧",
    pop: "弹出栈帧",
    memory: "内存关系",
    connect: "连接关系",
    inspect: "检查关系",
    stream: "数据流",
    evidence: "运行证据",
    iteration: "轮次",
    selectValue: "选择这个值",
    noRelation: "当前步骤没有值传递",
    fixedBoundary: "固定案例教学推演；不冒充真实变量采样。",
    interactiveBoundary: "由当前输入计算的教学推演；不冒充真实变量采样。",
  }),
  en: Object.freeze({
    lessonCase: "Lesson case",
    currentInput: "Current input",
    input: "Input",
    output: "Output",
    pendingOutput: "Shown on completion",
    changeInput: "Change input",
    ready: "Ready",
    running: "Running",
    paused: "Paused",
    completed: "Completed",
    current: "Run this step",
    done: "Executed",
    pending: "Pending",
    preview: "Preview",
    action: "Current action",
    values: "State values",
    history: "Execution path",
    branch: "Branch",
    truePath: "True",
    falsePath: "False",
    stack: "Call stack",
    push: "Push frame",
    pop: "Pop frame",
    memory: "Memory relation",
    connect: "Connect",
    inspect: "Inspect",
    stream: "Data stream",
    evidence: "Runtime evidence",
    iteration: "Iteration",
    selectValue: "Select this value",
    noRelation: "This step does not move a value",
    fixedBoundary: "Fixed-case teaching replay; it is not sampled runtime state.",
    interactiveBoundary:
      "Teaching replay computed from this input; it is not sampled runtime state.",
  }),
});

let runtimeSceneSequence = 0;

/**
 * A shared runtime renderer for the FOA semantic lessons. It preserves the public semantic-scene
 * selectors while rendering stable values, state deltas and mechanism-specific evidence.
 */
export function createFoaRuntimeScene(
  ownerDocument: Document,
  lesson: FoaLessonDefinition,
  profile: FoaSceneProfile,
  options: FoaSemanticSceneOptions,
): FoaRuntimeSceneController {
  if (profile.order !== lesson.order) {
    throw new TypeError(
      `FOA runtime profile ${String(profile.order)} does not match lesson ${String(lesson.order)}`,
    );
  }
  if (lesson.semanticEvents.length !== 4 || profile.slots.length !== 4) {
    throw new RangeError("FOA runtime scenes require exactly four authored semantic events");
  }

  let locale = options.locale;
  let reducedMotion = options.reducedMotion;
  let runtimeCase: FoaInteractiveRun | null = null;
  let model: FoaRuntimeModel = createFoaRuntimeModel(lesson, profile, runtimeCase);
  let state: FoaSemanticSceneState = Object.freeze({
    displayIndex: 0,
    confirmedCount: 0,
    previewing: false,
    completed: false,
    runtimeState: "ready",
  });
  let destroyed = false;
  let currentAnimation: Animation | null = null;
  let animationEpoch = 0;
  let resizeObserver: ResizeObserver | null = null;
  let layoutFrame: number | null = null;
  let dragGesture: RuntimeDragGesture | null = null;
  let suppressValueClickUntil = 0;

  const root = element(ownerDocument, "section", "foa-semantic-scene foa-runtime-scene");
  root.dataset.sceneKind = profile.kind;
  root.dataset.connection = profile.connection;
  root.dataset.caseMode = profile.caseMode;
  root.dataset.special = String(profile.special);
  root.dataset.mechanismId = profile.mechanismId;
  root.dataset.observableKind = profile.observableKind;
  root.dataset.learnerControl = profile.learnerControl;
  root.dataset.stateShape = profile.stateShape.map((field) => field.id).join(" ");

  const evidence = element(ownerDocument, "header", "foa-semantic-scene__evidence");
  const caseIdentity = element(ownerDocument, "strong");
  const boundary = element(ownerDocument, "span", "foa-semantic-scene__boundary");
  const channels = ownerDocument.createElement("dl");
  channels.className = "foa-semantic-scene__channels";
  const inputTerm = ownerDocument.createElement("dt");
  const inputValue = ownerDocument.createElement("dd");
  const outputTerm = ownerDocument.createElement("dt");
  const outputValue = ownerDocument.createElement("dd");
  channels.append(inputTerm, inputValue, outputTerm, outputValue);
  const runStatus = element(ownerDocument, "span", "foa-semantic-scene__run-status");
  const changeInput = ownerDocument.createElement("button");
  changeInput.type = "button";
  changeInput.className = "foa-semantic-scene__change-input";
  changeInput.dataset.taskLessonAction = "change-input";
  changeInput.addEventListener("click", () => options.onChangeInput?.());
  evidence.append(caseIdentity, boundary, channels, runStatus, changeInput);

  const mechanism = element(
    ownerDocument,
    "section",
    "foa-semantic-scene__diagram foa-runtime-scene__mechanism",
  );
  mechanism.dataset.visualFamily = model.visualFamily;
  mechanism.dataset.layout = mechanismLayout(profile);
  mechanism.dataset.mechanismId = profile.mechanismId;
  mechanism.dataset.observableKind = profile.observableKind;
  mechanism.dataset.learnerControl = profile.learnerControl;
  mechanism.tabIndex = -1;

  const mechanismHeader = element(ownerDocument, "header", "foa-runtime-scene__header");
  const visualModel = element(ownerDocument, "strong", "foa-runtime-scene__model");
  const primaryAction = element(ownerDocument, "span", "foa-runtime-scene__primary-action");
  mechanismHeader.append(visualModel, primaryAction);

  const framePanel = element(ownerDocument, "section", "foa-runtime-scene__frame");
  const frameTitle = element(ownerDocument, "strong", "foa-runtime-scene__frame-title");
  const frameDetail = element(ownerDocument, "p", "foa-runtime-scene__frame-detail");
  const iteration = element(ownerDocument, "span", "foa-runtime-scene__iteration");
  framePanel.append(frameTitle, frameDetail, iteration);

  const valuesRegion = element(ownerDocument, "section", "foa-runtime-scene__values");
  const valuesTitle = element(ownerDocument, "h3", "foa-runtime-scene__region-title");
  const observationsMount = element(
    ownerDocument,
    "div",
    "foa-runtime-scene__value-track foa-runtime-scene__observation-track",
  );
  const valuesMount = element(ownerDocument, "div", "foa-runtime-scene__value-track");
  valuesMount.dataset.runtimeTokens = "true";
  valuesRegion.append(valuesTitle, observationsMount, valuesMount);
  const valueElements = new Map<string, ValueElements>();
  const observationElements = new Map<string, ObservationElements>();

  const relation = element(ownerDocument, "section", "foa-runtime-scene__relation");
  const relationText = element(ownerDocument, "span", "foa-runtime-scene__relation-text");
  const movingToken = element(ownerDocument, "span", "foa-runtime-scene__moving-token");
  movingToken.hidden = true;
  movingToken.setAttribute("aria-hidden", "true");
  relation.append(relationText, movingToken);
  const dragGhost = element(
    ownerDocument,
    "span",
    "foa-runtime-scene__moving-token foa-runtime-scene__drag-ghost",
  );
  dragGhost.hidden = true;
  dragGhost.setAttribute("aria-hidden", "true");

  const branch = element(ownerDocument, "section", "foa-runtime-scene__branch");
  const branchTitle = element(ownerDocument, "strong");
  const trueBranch = ownerDocument.createElement("button");
  trueBranch.type = "button";
  trueBranch.className = "foa-runtime-scene__branch-lane";
  trueBranch.dataset.outcome = "true";
  resetChoiceButtonAppearance(trueBranch);
  trueBranch.addEventListener("click", () => attemptBranch(true));
  const falseBranch = ownerDocument.createElement("button");
  falseBranch.type = "button";
  falseBranch.className = "foa-runtime-scene__branch-lane";
  falseBranch.dataset.outcome = "false";
  resetChoiceButtonAppearance(falseBranch);
  falseBranch.addEventListener("click", () => attemptBranch(false));
  branch.append(branchTitle, trueBranch, falseBranch);

  const stack = element(ownerDocument, "section", "foa-runtime-scene__stack");
  const stackTitle = element(ownerDocument, "strong");
  const stackFrames = element(ownerDocument, "div", "foa-runtime-scene__stack-frames");
  const stackControls = element(ownerDocument, "div", "foa-runtime-scene__stack-controls");
  const pushStack = mechanismActionButton(ownerDocument, "foa-runtime-scene__stack-action");
  pushStack.dataset.stackAction = "push";
  pushStack.addEventListener("click", () => attemptStack("push"));
  const popStack = mechanismActionButton(ownerDocument, "foa-runtime-scene__stack-action");
  popStack.dataset.stackAction = "pop";
  popStack.addEventListener("click", () => attemptStack("pop"));
  stackControls.append(pushStack, popStack);
  stack.append(stackTitle, stackFrames, stackControls);
  const stackFrameElements = new Map<string, HTMLElement>();

  const memory = element(ownerDocument, "section", "foa-runtime-scene__memory");
  const memoryTitle = element(ownerDocument, "strong");
  const memoryRelation = element(ownerDocument, "span", "foa-runtime-scene__memory-relation");
  const memoryLinkChoices = element(ownerDocument, "div", "foa-runtime-scene__memory-links");
  const memoryLinkElements = new Map<string, HTMLButtonElement>();
  const memoryControls = element(ownerDocument, "div", "foa-runtime-scene__memory-controls");
  const connectMemory = mechanismActionButton(ownerDocument, "foa-runtime-scene__memory-action");
  connectMemory.dataset.memoryAction = "connect";
  connectMemory.addEventListener("click", () => attemptMemory("connect"));
  const inspectMemory = mechanismActionButton(ownerDocument, "foa-runtime-scene__memory-action");
  inspectMemory.dataset.memoryAction = "inspect";
  inspectMemory.addEventListener("click", () => attemptMemory("inspect"));
  memoryControls.append(connectMemory, inspectMemory);
  memory.append(memoryTitle, memoryRelation, memoryLinkChoices, memoryControls);
  const signatureContract: FoaSignatureContractScene | null =
    lesson.order === 33
      ? createFoaSignatureContractScene(ownerDocument, {
          locale,
          reducedMotion,
          frames: model.frames,
          stdout: model.stdout,
          onAttempt: (routeId) => attemptMemoryLink(routeId),
        })
      : null;
  if (signatureContract !== null) {
    root.dataset.specialized = "signature-contract";
    memory.dataset.specialized = "signature-contract";
    mechanism.dataset.specialized = "signature-contract";
    memory.append(signatureContract.root);
  }

  const stream = element(ownerDocument, "section", "foa-runtime-scene__stream");
  const streamTitle = element(ownerDocument, "strong");
  const streamValues = element(ownerDocument, "div", "foa-runtime-scene__stream-values");
  stream.append(streamTitle, streamValues);
  const streamTokenElements = new Map<string, HTMLElement>();

  const evidencePanel = element(ownerDocument, "section", "foa-runtime-scene__evidence");
  const evidenceTitle = element(ownerDocument, "strong");
  const evidenceDetail = element(ownerDocument, "span", "foa-runtime-scene__evidence-detail");
  evidencePanel.append(evidenceTitle, evidenceDetail);

  const history = element(ownerDocument, "section", "foa-runtime-scene__history");
  const historyTitle = element(ownerDocument, "h3", "foa-runtime-scene__region-title");
  const historyList = ownerDocument.createElement("ol");
  history.append(historyTitle, historyList);
  const historyElements = new Map<string, HistoryElements>();

  const actionTarget = ownerDocument.createElement("button");
  actionTarget.type = "button";
  actionTarget.className = "foa-runtime-scene__action-target";
  actionTarget.dataset.taskLessonAction = "runtime-step";
  actionTarget.addEventListener("click", attemptCurrentFrame);
  mechanism.addEventListener("click", (event) => {
    if (event.target !== mechanism || eventTargetIsInsideButton(event.target, mechanism)) return;
    attemptCurrentFrame();
  });

  const svg = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("foa-semantic-scene__edges");
  svg.setAttribute("aria-hidden", "true");
  const markerId = `foa-runtime-arrow-${String(lesson.order)}-${String(++runtimeSceneSequence)}`;
  const defs = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "defs");
  const marker = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "marker");
  marker.id = markerId;
  marker.setAttribute("viewBox", "0 0 8 8");
  marker.setAttribute("refX", "7");
  marker.setAttribute("refY", "4");
  marker.setAttribute("markerWidth", "7");
  marker.setAttribute("markerHeight", "7");
  marker.setAttribute("orient", "auto-start-reverse");
  const markerPath = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
  markerPath.setAttribute("d", "M 0 0 L 8 4 L 0 8 z");
  marker.append(markerPath);
  defs.append(marker);
  svg.append(defs);

  const nodesMount = element(ownerDocument, "div", "foa-runtime-scene__nodes");
  const nodes = lesson.semanticEvents.map((semanticEvent, index) => {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = "foa-semantic-scene__node";
    button.dataset.eventId = semanticEvent.id;
    button.dataset.sceneSlot = profile.slots[index]!;
    button.dataset.index = String(index);
    const role = element(ownerDocument, "span", "foa-semantic-scene__node-order");
    const label = element(ownerDocument, "strong");
    const status = element(ownerDocument, "span", "foa-semantic-scene__node-status");
    const detail = element(ownerDocument, "span", "foa-semantic-scene__node-detail");
    button.append(role, label, status, detail);
    button.addEventListener("click", () => attemptSemanticEvent(index));
    nodesMount.append(button);
    return { button, detail, label, role, status };
  });
  const edgePaths = buildEdges(profile, nodes.length).map(([from, to], index) => {
    const path = ownerDocument.createElementNS("http://www.w3.org/2000/svg", "path");
    path.dataset.edgeIndex = String(index);
    path.dataset.fromIndex = String(from);
    path.dataset.toIndex = String(to);
    path.setAttribute("marker-end", `url(#${markerId})`);
    svg.append(path);
    return path;
  });

  mechanism.append(
    svg,
    mechanismHeader,
    framePanel,
    valuesRegion,
    relation,
    dragGhost,
    branch,
    stack,
    memory,
    stream,
    evidencePanel,
    history,
    actionTarget,
    nodesMount,
  );
  root.append(evidence, mechanism);

  syncModelElements();
  applyLocale();
  render();
  requestLayout();

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(requestLayout);
    resizeObserver.observe(mechanism);
    for (const node of nodes) resizeObserver.observe(node.button);
  }

  return Object.freeze({
    root,
    setLocale(nextLocale: FoaLocale): void {
      assertLive();
      locale = nextLocale;
      signatureContract?.setLocale(nextLocale);
      applyLocale();
      render();
    },
    setReducedMotion(nextReducedMotion: boolean): void {
      assertLive();
      reducedMotion = nextReducedMotion;
      root.dataset.reducedMotion = String(reducedMotion);
      signatureContract?.setReducedMotion(nextReducedMotion);
      if (reducedMotion) cancelAnimation();
    },
    setState(nextState: FoaSemanticSceneState): void {
      assertLive();
      state = Object.freeze({ ...nextState });
      render();
    },
    setRuntimeCase(nextRuntimeCase: FoaInteractiveRun | null): void {
      assertLive();
      runtimeCase = nextRuntimeCase;
      model = createFoaRuntimeModel(lesson, profile, runtimeCase);
      mechanism.dataset.visualFamily = model.visualFamily;
      mechanism.dataset.layout = mechanismLayout(profile);
      syncModelElements();
      applyLocale();
      render();
      requestLayout();
    },
    setPlaybackRate(rate: number): void {
      assertLive();
      if (!Number.isFinite(rate) || rate <= 0) return;
      signatureContract?.setPlaybackRate(rate);
      if (currentAnimation !== null) currentAnimation.playbackRate = rate;
    },
    animateAdvance(fromIndex: number, toIndex: number | null): Promise<void> | null {
      assertLive();
      return animateTransition(fromIndex, toIndex, false);
    },
    animatePreviewAdvance(fromIndex: number, toIndex: number): Promise<void> | null {
      assertLive();
      return animateTransition(fromIndex, toIndex, true);
    },
    cancelAnimation(): void {
      assertLive();
      cancelAnimation();
    },
    focusActive(): void {
      assertLive();
      focusCurrentControl();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cancelValueDrag();
      cancelAnimation();
      cancelLayout();
      resizeObserver?.disconnect();
      resizeObserver = null;
      signatureContract?.destroy();
      root.parentElement?.removeChild(root);
    },
  });

  function attemptCurrentFrame(): void {
    if (specializedActionRequired()) return;
    attemptChoice(true);
  }

  function focusCurrentControl(): void {
    if (signatureContract !== null) {
      signatureContract.focusActive();
      return;
    }
    if (!specializedActionRequired()) {
      if (!actionTarget.hidden && !actionTarget.disabled) actionTarget.focus();
      else nodes[Math.min(state.confirmedCount, nodes.length - 1)]?.button.focus();
      return;
    }
    const candidates: readonly HTMLButtonElement[] =
      profile.learnerControl === "choose" &&
      mechanismLayout(profile) === "branch" &&
      frameAt(currentAttemptIndex()).branchOutcome !== null
        ? [trueBranch, falseBranch]
        : profile.learnerControl === "push-pop"
          ? [pushStack, popStack]
          : profile.learnerControl === "connect"
            ? [...memoryLinkElements.values(), connectMemory]
            : [...valueElements.values()].map(({ root: valueRoot }) => valueRoot);
    candidates.find((candidate) => !candidate.hidden && !candidate.disabled)?.focus();
  }

  function attemptSemanticEvent(index: number): void {
    if (interactionLocked() || specializedActionRequired()) return;
    const semanticEvent = lesson.semanticEvents[index];
    if (semanticEvent !== undefined) options.onAttempt(semanticEvent.id);
  }

  function attemptBranch(outcome: boolean): void {
    if (interactionLocked()) return;
    const expected = frameAt(currentAttemptIndex()).branchOutcome;
    if (expected === null) return;
    attemptChoice(outcome === expected);
  }

  function attemptStack(action: "push" | "pop"): void {
    if (interactionLocked()) return;
    attemptChoice(action === expectedStackAction(currentAttemptIndex()));
  }

  function attemptMemory(action: "connect" | "inspect"): void {
    if (interactionLocked()) return;
    const expected =
      profile.learnerControl === "connect"
        ? "connect"
        : profile.learnerControl === "inspect"
          ? "inspect"
          : frameAt(currentAttemptIndex()).actionKind === "inspect"
            ? "inspect"
            : "connect";
    attemptChoice(action === expected);
  }

  function attemptMemoryLink(linkId: string): void {
    if (interactionLocked()) return;
    const expected = frameAt(currentAttemptIndex()).evidence.activeMemoryLinkId;
    if (expected === null) return;
    attemptChoice(linkId === expected);
  }

  function attemptValue(valueId: string): void {
    if (interactionLocked() || !valueChoiceEnabled()) return;
    const frame = frameAt(currentAttemptIndex());
    attemptChoice(frame.evidence.activeTokenIds.includes(valueId));
  }

  function beginValueDrag(valueId: string, source: HTMLButtonElement, event: PointerEvent): void {
    if (
      event.button !== 0 ||
      profile.learnerControl !== "drag" ||
      interactionLocked() ||
      source.hidden
    )
      return;
    cancelValueDrag();
    dragGesture = {
      source,
      valueId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    if (typeof source.setPointerCapture === "function") source.setPointerCapture(event.pointerId);
  }

  function moveValueDrag(event: PointerEvent): void {
    const gesture = dragGesture;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.moved && distance < 4) return;
    gesture.moved = true;
    event.preventDefault();
    const mechanismRect = mechanism.getBoundingClientRect();
    dragGhost.hidden = false;
    dragGhost.textContent =
      latestValue(gesture.valueId, currentAttemptIndex())?.value[locale] ?? "";
    dragGhost.style.transform = translate({
      x: event.clientX - mechanismRect.left,
      y: event.clientY - mechanismRect.top,
    });
    const overTarget = pointInside(event.clientX, event.clientY, relation.getBoundingClientRect());
    const compatible = frameAt(currentAttemptIndex()).evidence.activeTokenIds.includes(
      gesture.valueId,
    );
    relation.dataset.dropState = overTarget ? (compatible ? "compatible" : "invalid") : "idle";
  }

  function endValueDrag(event: PointerEvent): void {
    const gesture = dragGesture;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const dropped =
      gesture.moved && pointInside(event.clientX, event.clientY, relation.getBoundingClientRect());
    if (gesture.moved) suppressValueClickUntil = Date.now() + 180;
    clearValueDrag(gesture);
    if (dropped) attemptValue(gesture.valueId);
  }

  function cancelValueDrag(event?: PointerEvent): void {
    if (event !== undefined && dragGesture?.pointerId !== event.pointerId) return;
    const gesture = dragGesture;
    if (gesture !== null) clearValueDrag(gesture);
  }

  function clearValueDrag(gesture: RuntimeDragGesture): void {
    if (
      typeof gesture.source.releasePointerCapture === "function" &&
      gesture.source.hasPointerCapture?.(gesture.pointerId)
    ) {
      gesture.source.releasePointerCapture(gesture.pointerId);
    }
    dragGesture = null;
    dragGhost.hidden = true;
    dragGhost.style.transform = "";
    relation.dataset.dropState = "idle";
  }

  function attemptChoice(correct: boolean): void {
    if (interactionLocked()) return;
    const index = currentAttemptIndex();
    const event = correct ? lesson.semanticEvents[index] : wrongEvent(index);
    if (event !== undefined) options.onAttempt(event.id);
  }

  function currentAttemptIndex(): number {
    return Math.max(0, Math.min(lesson.semanticEvents.length - 1, state.confirmedCount));
  }

  function interactionLocked(): boolean {
    return state.previewing || state.completed;
  }

  function specializedActionRequired(): boolean {
    const frame = frameAt(currentAttemptIndex());
    if (profile.learnerControl === "choose") {
      return frame.branchOutcome !== null || frame.evidence.activeTokenIds.length > 0;
    }
    if (profile.learnerControl === "drag") {
      return frame.evidence.activeTokenIds.length > 0;
    }
    if (profile.learnerControl === "connect") {
      return frame.evidence.activeMemoryLinkId !== null;
    }
    if (profile.learnerControl === "push-pop") {
      return frame.evidence.stackFrames.length > 0;
    }
    return false;
  }

  function wrongEvent(expectedIndex: number): (typeof lesson.semanticEvents)[number] | undefined {
    if (lesson.semanticEvents.length < 2) return undefined;
    return lesson.semanticEvents[(expectedIndex + 1) % lesson.semanticEvents.length];
  }

  function expectedStackAction(index: number): "push" | "pop" {
    const semanticEvent = lesson.semanticEvents[index];
    const slot = profile.slots[index];
    if (semanticEvent?.type === "return" || slot === "return") return "pop";
    if (semanticEvent?.type === "call" || slot === "call" || slot === "frame") return "push";
    return index < Math.ceil(lesson.semanticEvents.length / 2) ? "push" : "pop";
  }

  function valueChoiceEnabled(): boolean {
    const hasAuthoredChoice = frameAt(currentAttemptIndex()).evidence.activeTokenIds.length > 0;
    if (!hasAuthoredChoice) return false;
    if (profile.learnerControl === "drag") return true;
    if (profile.learnerControl === "choose") {
      return (
        profile.observableKind !== "branch" || frameAt(currentAttemptIndex()).branchOutcome === null
      );
    }
    if (
      profile.observableKind === "branch" ||
      profile.observableKind === "call-stack" ||
      profile.observableKind === "memory" ||
      profile.observableKind === "pointer" ||
      profile.observableKind === "scope"
    )
      return false;
    return (
      profile.learnerControl === "inspect" ||
      profile.observableKind === "loop" ||
      profile.observableKind === "sequence" ||
      profile.observableKind === "search" ||
      profile.observableKind === "sorting" ||
      profile.observableKind === "matrix"
    );
  }

  function frameAt(index: number): FoaRuntimeFrame {
    return model.frames[Math.max(0, Math.min(model.frames.length - 1, index))]!;
  }

  function syncModelElements(): void {
    for (const field of profile.stateShape) {
      if (observationElements.has(field.id)) continue;
      const observation = element(
        ownerDocument,
        "div",
        "foa-runtime-scene__value foa-runtime-scene__observation",
      );
      observation.dataset.stateFieldId = field.id;
      observation.dataset.valueKind = field.valueKind;
      const observationLabel = element(ownerDocument, "span", "foa-runtime-scene__value-label");
      const observationValue = ownerDocument.createElement("output");
      observationValue.className = "foa-runtime-scene__value-content";
      observation.append(observationLabel, observationValue);
      observationsMount.append(observation);
      observationElements.set(field.id, {
        root: observation,
        label: observationLabel,
        value: observationValue,
      });
    }

    const ids = new Set(
      model.frames.flatMap((frame) => frame.evidence.tokens.map((value) => value.id)),
    );
    for (const [id, value] of valueElements) {
      if (ids.has(id)) continue;
      value.root.parentElement?.removeChild(value.root);
      valueElements.delete(id);
    }
    for (const frame of model.frames) {
      for (const value of frame.evidence.tokens) {
        if (valueElements.has(value.id)) continue;
        const valueRoot = ownerDocument.createElement("button");
        valueRoot.type = "button";
        valueRoot.className = "foa-runtime-scene__value foa-runtime-scene__value-choice";
        valueRoot.dataset.valueId = value.id;
        valueRoot.dataset.role = "token";
        resetChoiceButtonAppearance(valueRoot);
        valueRoot.addEventListener("click", () => {
          if (Date.now() < suppressValueClickUntil) return;
          attemptValue(value.id);
        });
        valueRoot.addEventListener("pointerdown", (event) =>
          beginValueDrag(value.id, valueRoot, event),
        );
        valueRoot.addEventListener("pointermove", moveValueDrag);
        valueRoot.addEventListener("pointerup", endValueDrag);
        valueRoot.addEventListener("pointercancel", cancelValueDrag);
        const valueLabel = element(ownerDocument, "span", "foa-runtime-scene__value-label");
        const valueOutput = ownerDocument.createElement("output");
        valueOutput.className = "foa-runtime-scene__value-content";
        valueRoot.append(valueLabel, valueOutput);
        valuesMount.append(valueRoot);
        valueElements.set(value.id, { root: valueRoot, label: valueLabel, value: valueOutput });
      }
    }

    const memoryLinkIds = new Set(
      model.frames.flatMap((frame) => frame.evidence.memoryLinks.map(({ id }) => id)),
    );
    for (const [id, link] of memoryLinkElements) {
      if (memoryLinkIds.has(id)) continue;
      link.remove();
      memoryLinkElements.delete(id);
    }
    for (const frame of model.frames) {
      for (const evidenceLink of frame.evidence.memoryLinks) {
        if (memoryLinkElements.has(evidenceLink.id)) continue;
        const link = mechanismActionButton(ownerDocument, "foa-runtime-scene__memory-link");
        link.dataset.memoryLinkId = evidenceLink.id;
        link.addEventListener("click", () => attemptMemoryLink(evidenceLink.id));
        memoryLinkChoices.append(link);
        memoryLinkElements.set(evidenceLink.id, link);
      }
    }

    const frameIds = new Set(model.frames.map((frame) => frame.id));
    for (const [id, item] of historyElements) {
      if (frameIds.has(id)) continue;
      item.root.parentElement?.removeChild(item.root);
      historyElements.delete(id);
    }
    for (const frame of model.frames) {
      if (historyElements.has(frame.id)) continue;
      const item = ownerDocument.createElement("li");
      item.className = "foa-runtime-scene__history-item";
      item.dataset.frameId = frame.id;
      const itemTitle = element(ownerDocument, "strong");
      const itemDetail = element(ownerDocument, "span");
      item.append(itemTitle, itemDetail);
      historyList.append(item);
      historyElements.set(frame.id, { root: item, title: itemTitle, detail: itemDetail });
    }

    const stackFrameIds = new Set(
      model.frames.flatMap((frame) => frame.evidence.stackFrames.map(({ id }) => id)),
    );
    for (const [id, stackFrame] of stackFrameElements) {
      if (stackFrameIds.has(id)) continue;
      stackFrame.parentElement?.removeChild(stackFrame);
      stackFrameElements.delete(id);
    }
    for (const frame of model.frames) {
      for (const evidenceFrame of frame.evidence.stackFrames) {
        if (stackFrameElements.has(evidenceFrame.id)) continue;
        const stackFrame = element(ownerDocument, "span", "foa-runtime-scene__stack-frame");
        stackFrame.dataset.frameId = evidenceFrame.id;
        stackFrames.append(stackFrame);
        stackFrameElements.set(evidenceFrame.id, stackFrame);
      }
    }

    for (const [id, token] of streamTokenElements) {
      if (frameIds.has(id)) continue;
      token.parentElement?.removeChild(token);
      streamTokenElements.delete(id);
    }
    for (const frame of model.frames) {
      if (streamTokenElements.has(frame.id)) continue;
      const token = element(ownerDocument, "span", "foa-runtime-scene__stream-token");
      token.dataset.frameId = frame.id;
      streamValues.append(token);
      streamTokenElements.set(frame.id, token);
    }
  }

  function applyLocale(): void {
    const copy = COPY[locale];
    caseIdentity.textContent = runtimeCase === null ? copy.lessonCase : copy.currentInput;
    boundary.textContent = profile.caseGoal[locale];
    boundary.title = `${profile.caseGoal[locale]} · ${profile.rationale[locale]} ${
      runtimeCase === null ? copy.fixedBoundary : copy.interactiveBoundary
    }`;
    inputTerm.textContent = copy.input;
    outputTerm.textContent = copy.output;
    changeInput.textContent = copy.changeInput;
    visualModel.textContent = model.visualModel[locale];
    primaryAction.textContent = model.primaryAction[locale];
    valuesTitle.textContent = profile.observableLabels.map((label) => label[locale]).join(" · ");
    valuesRegion.setAttribute(
      "aria-label",
      `${copy.values}: ${profile.observableLabels.map((label) => label[locale]).join(", ")}`,
    );
    historyTitle.textContent = copy.history;
    branchTitle.textContent = copy.branch;
    trueBranch.textContent = copy.truePath;
    falseBranch.textContent = copy.falsePath;
    stackTitle.textContent = copy.stack;
    pushStack.textContent = copy.push;
    popStack.textContent = copy.pop;
    memoryTitle.textContent = copy.memory;
    connectMemory.textContent = copy.connect;
    inspectMemory.textContent = copy.inspect;
    streamTitle.textContent = copy.stream;
    evidenceTitle.textContent = copy.evidence;
    root.dataset.caseGoal = profile.caseGoal[locale];
    mechanism.dataset.caseGoal = profile.caseGoal[locale];
    mechanism.setAttribute("aria-description", profile.caseGoal[locale]);
    actionTarget.setAttribute("aria-label", copy.action);
    root.setAttribute("aria-label", `${lesson.title[locale]} · ${model.visualModel[locale]}`);
    nodes.forEach((node, index) => {
      node.role.textContent = profile.slots[index]!;
      node.label.textContent = model.frames[index]!.label[locale];
    });
  }

  function render(): void {
    const copy = COPY[locale];
    const frameIndex = Math.max(0, Math.min(model.frames.length - 1, state.displayIndex));
    const frame = frameAt(frameIndex);
    const frameCommitted = state.completed || state.previewing || frameIndex < state.confirmedCount;
    const runState = state.runtimeState ?? (state.completed ? "completed" : "ready");
    root.dataset.displayIndex = String(frameIndex);
    root.dataset.confirmedCount = String(state.confirmedCount);
    root.dataset.previewing = String(state.previewing);
    root.dataset.completed = String(state.completed);
    root.dataset.runState = runState;
    root.dataset.reducedMotion = String(reducedMotion);
    root.dataset.currentEventId = frame.eventId;
    if (interactionLocked()) cancelValueDrag();
    runStatus.dataset.state = runState;
    runStatus.textContent = copy[runState];
    const visibleInput = visibleChannel(model.stdin, "∅");
    const visibleOutput = state.completed ? visibleChannel(model.stdout, "∅") : copy.pendingOutput;
    inputValue.textContent = visibleInput;
    inputValue.title = visibleInput;
    outputValue.textContent = visibleOutput;
    outputValue.title = visibleOutput;
    channels.setAttribute(
      "aria-label",
      `${copy.input}: ${visibleInput}; ${copy.output}: ${visibleOutput}`,
    );
    changeInput.hidden = runtimeCase === null || options.onChangeInput === undefined;

    frameTitle.textContent = frame.label[locale];
    frameDetail.textContent = frameCommitted ? frame.detail[locale] : model.primaryAction[locale];
    iteration.hidden = frame.iteration === null;
    iteration.textContent =
      frame.iteration === null ? "" : `${copy.iteration} ${String(frame.iteration)}`;
    const visibleRelation = evidenceRelationText(frameIndex);
    relationText.textContent = visibleRelation ?? copy.noRelation;
    relation.dataset.active = String(visibleRelation !== null);
    relation.dataset.actionKind = frame.actionKind;
    relation.dataset.dropTarget = String(profile.learnerControl === "drag");
    actionTarget.textContent = `${copy.action} · ${frame.label[locale]}`;
    actionTarget.hidden = specializedActionRequired();
    actionTarget.disabled = interactionLocked() || specializedActionRequired();

    const layout = mechanismLayout(profile);
    branch.hidden = layout !== "branch";
    stack.hidden = layout !== "stack";
    memory.hidden = layout !== "memory";
    stream.hidden = layout !== "stream";
    evidencePanel.hidden = layout !== "evidence";
    const visibleBranchOutcome = visibleCommittedBranchOutcome(frameIndex, frameCommitted);
    branch.dataset.outcome =
      visibleBranchOutcome === null ? "pending" : String(visibleBranchOutcome);
    trueBranch.dataset.active = String(visibleBranchOutcome === true);
    falseBranch.dataset.active = String(visibleBranchOutcome === false);
    trueBranch.setAttribute("aria-pressed", String(visibleBranchOutcome === true));
    falseBranch.setAttribute("aria-pressed", String(visibleBranchOutcome === false));
    const branchChoiceAvailable = layout === "branch" && frame.branchOutcome !== null;
    trueBranch.disabled = interactionLocked() || !branchChoiceAvailable;
    falseBranch.disabled = interactionLocked() || !branchChoiceAvailable;
    trueBranch.dataset.compatible = String(frame.branchOutcome === true);
    falseBranch.dataset.compatible = String(frame.branchOutcome === false);
    const expectedStack = expectedStackAction(currentAttemptIndex());
    const stackChoiceAvailable =
      layout === "stack" &&
      (profile.learnerControl === "push-pop" || profile.observableKind === "call-stack");
    stackControls.hidden = !stackChoiceAvailable;
    pushStack.disabled = interactionLocked() || !stackChoiceAvailable;
    popStack.disabled = interactionLocked() || !stackChoiceAvailable;
    pushStack.dataset.compatible = String(expectedStack === "push");
    popStack.dataset.compatible = String(expectedStack === "pop");
    const expectedMemory =
      profile.learnerControl === "connect"
        ? "connect"
        : profile.learnerControl === "inspect"
          ? "inspect"
          : frameAt(currentAttemptIndex()).actionKind === "inspect"
            ? "inspect"
            : "connect";
    const memoryChoiceAvailable =
      layout === "memory" &&
      (profile.learnerControl === "connect" || profile.learnerControl === "inspect");
    const authoredMemoryChoice = frame.evidence.activeMemoryLinkId !== null;
    memoryControls.hidden = !memoryChoiceAvailable || authoredMemoryChoice;
    connectMemory.disabled = interactionLocked() || !memoryChoiceAvailable;
    inspectMemory.disabled = interactionLocked() || !memoryChoiceAvailable;
    connectMemory.dataset.compatible = String(expectedMemory === "connect");
    inspectMemory.dataset.compatible = String(expectedMemory === "inspect");
    memoryRelation.textContent = visibleRelation ?? copy.noRelation;
    renderMemoryLinks(frame);
    if (signatureContract !== null) {
      mechanismHeader.hidden = true;
      framePanel.hidden = true;
      valuesRegion.hidden = true;
      relation.hidden = true;
      history.hidden = true;
      actionTarget.hidden = true;
      memoryTitle.hidden = true;
      memoryRelation.hidden = true;
      memoryLinkChoices.hidden = true;
      memoryControls.hidden = true;
      signatureContract.setState({
        displayIndex: frameIndex,
        confirmedCount: state.confirmedCount,
        previewing: state.previewing,
        completed: state.completed,
        locked: interactionLocked(),
      });
    }
    evidenceDetail.textContent = frame.detail[locale];

    renderObservations(frameIndex, frameCommitted);
    renderValues(frameIndex, frame, frameCommitted);
    renderStack(frameIndex);
    renderStream(frameIndex);
    renderHistory(frameIndex);
    renderNodes(frameIndex);
    renderEdges(frameIndex);
    requestLayout();
  }

  function renderObservations(frameIndex: number, frameCommitted: boolean): void {
    const frame = frameAt(frameIndex);
    const previous = frameAt(Math.max(0, frameIndex - 1));
    profile.stateShape.forEach((field) => {
      const elements = observationElements.get(field.id)!;
      const value = frame.evidence.stateValues[field.id]!;
      const previousValue = previous.evidence.stateValues[field.id]!;
      const changed =
        frameIndex === 0 || value.zh !== previousValue.zh || value.en !== previousValue.en;
      elements.root.dataset.state = changed ? "active" : "known";
      elements.root.dataset.committed = String(frameCommitted);
      elements.label.textContent = field.label[locale];
      elements.value.textContent = value[locale];
      elements.root.title = `${field.label[locale]}: ${elements.value.textContent}`;
    });
  }

  function visibleCommittedBranchOutcome(
    frameIndex: number,
    frameCommitted: boolean,
  ): boolean | null {
    if (frameCommitted && frameAt(frameIndex).branchOutcome !== null) {
      return frameAt(frameIndex).branchOutcome;
    }
    const lastCommittedIndex = Math.min(model.frames.length - 1, state.confirmedCount - 1);
    for (let index = lastCommittedIndex; index >= 0; index -= 1) {
      const outcome = frameAt(index).branchOutcome;
      if (outcome !== null) return outcome;
    }
    return null;
  }

  function evidenceRelationText(frameIndex: number): string | null {
    const frame = frameAt(frameIndex);
    const activeLink = frame.evidence.memoryLinks.find(
      ({ id }) => id === frame.evidence.activeMemoryLinkId,
    );
    if (activeLink !== undefined) {
      return `${activeLink.from[locale]} → ${activeLink.to[locale]} · ${activeLink.label[locale]}`;
    }
    const activeTokens = frame.evidence.activeTokenIds
      .map((id) => frame.evidence.tokens.find((token) => token.id === id))
      .filter((token): token is FoaRuntimeEvidenceToken => token !== undefined);
    if (activeTokens.length > 0) {
      return activeTokens
        .map((token) => `${token.label[locale]}=${token.value[locale]}`)
        .join(" → ");
    }
    const previous = frameAt(Math.max(0, frameIndex - 1));
    const changed = profile.stateShape.filter((field) => {
      const before = previous.evidence.stateValues[field.id]!;
      const after = frame.evidence.stateValues[field.id]!;
      return frameIndex === 0 || before.zh !== after.zh || before.en !== after.en;
    });
    if (changed.length === 0) return null;
    return changed
      .slice(0, 2)
      .map((field) => `${field.label[locale]}=${frame.evidence.stateValues[field.id]![locale]}`)
      .join(" · ");
  }

  function renderValues(frameIndex: number, frame: FoaRuntimeFrame, frameCommitted: boolean): void {
    const activeIds = new Set(frame.evidence.activeTokenIds);
    for (const [id, elements] of valueElements) {
      const known = latestValue(id, frameIndex);
      const introducedNow =
        frame.evidence.tokens.some((value) => value.id === id) &&
        !model.frames
          .slice(0, frameIndex)
          .some((candidate) => candidate.evidence.tokens.some((value) => value.id === id));
      elements.root.dataset.state = activeIds.has(id)
        ? "active"
        : known === null
          ? "pending"
          : "known";
      elements.root.hidden = known === null;
      if (known === null) continue;
      elements.root.dataset.role = "token";
      elements.root.dataset.compatible = String(
        valueChoiceEnabled() && frame.evidence.activeTokenIds.includes(id),
      );
      elements.root.disabled = interactionLocked() || !valueChoiceEnabled();
      elements.root.dataset.dragSource = String(profile.learnerControl === "drag");
      elements.root.setAttribute(
        "aria-label",
        `${COPY[locale].selectValue}: ${known.label[locale]} ${known.value[locale]}`,
      );
      elements.label.textContent = known.label[locale];
      const visibleValue =
        introducedNow &&
        !frameCommitted &&
        !activeIds.has(id) &&
        // Values supplied by the learner are already known input even before the algorithm
        // consumes them. Keep their pending state, but do not hide the data they just entered.
        runtimeCase === null
          ? "—"
          : known.value[locale];
      elements.value.textContent = visibleValue;
      elements.root.title = `${known.label[locale]}: ${visibleValue}`;
    }
  }

  function latestValue(id: string, frameIndex: number): FoaRuntimeEvidenceToken | null {
    for (let index = frameIndex; index >= 0; index -= 1) {
      const found = model.frames[index]?.evidence.tokens.find((candidate) => candidate.id === id);
      if (found !== undefined) return found;
    }
    return null;
  }

  function renderStack(frameIndex: number): void {
    const evidence = frameAt(frameIndex).evidence;
    const visibleIds = new Set(evidence.stackFrames.map(({ id }) => id));
    for (const [id, stackFrame] of stackFrameElements) {
      const authoredFrame = evidence.stackFrames.find((candidate) => candidate.id === id);
      stackFrame.hidden = !visibleIds.has(id) || authoredFrame === undefined;
      if (authoredFrame === undefined) continue;
      stackFrame.dataset.state = id === evidence.activeStackFrameId ? "active" : "known";
      stackFrame.textContent = `${authoredFrame.label[locale]} · ${authoredFrame.value[locale]}`;
    }
  }

  function renderMemoryLinks(frame: FoaRuntimeFrame): void {
    const visibleIds = new Set(frame.evidence.memoryLinks.map(({ id }) => id));
    for (const [id, button] of memoryLinkElements) {
      const link = frame.evidence.memoryLinks.find((candidate) => candidate.id === id);
      button.hidden = !visibleIds.has(id) || link === undefined;
      if (link === undefined) continue;
      const active = id === frame.evidence.activeMemoryLinkId;
      button.disabled = interactionLocked();
      button.dataset.compatible = String(active);
      button.textContent = `${link.from[locale]} → ${link.to[locale]} · ${link.label[locale]}`;
      button.setAttribute("aria-pressed", "false");
    }
  }

  function renderStream(frameIndex: number): void {
    for (let index = 0; index < model.frames.length; index += 1) {
      const frame = model.frames[index]!;
      const token = streamTokenElements.get(frame.id)!;
      token.hidden = index > frameIndex;
      token.dataset.state = index === frameIndex ? "active" : "done";
      token.textContent =
        frame.values.map((value) => value.value[locale]).join(" · ") || frame.label[locale];
    }
  }

  function renderHistory(frameIndex: number): void {
    model.frames.forEach((frame, index) => {
      const item = historyElements.get(frame.id)!;
      item.root.dataset.state =
        index < frameIndex ? "done" : index === frameIndex ? "active" : "pending";
      item.root.hidden = index > frameIndex;
      item.title.textContent = frame.label[locale];
      item.detail.textContent =
        index < state.confirmedCount || state.completed ? frame.detail[locale] : "";
    });
  }

  function renderNodes(frameIndex: number): void {
    nodes.forEach((node, index) => {
      const nodeState = state.previewing
        ? index === frameIndex
          ? "preview"
          : index < state.confirmedCount
            ? "done"
            : "pending"
        : index < state.confirmedCount
          ? "done"
          : index === state.confirmedCount
            ? "active"
            : "pending";
      node.button.dataset.state = nodeState;
      node.button.disabled =
        state.previewing ||
        index < state.confirmedCount ||
        state.completed ||
        specializedActionRequired();
      node.button.setAttribute(
        "aria-current",
        nodeState === "active" || nodeState === "preview" ? "step" : "false",
      );
      node.status.textContent =
        nodeState === "active"
          ? COPY[locale].current
          : nodeState === "done"
            ? COPY[locale].done
            : nodeState === "preview"
              ? COPY[locale].preview
              : COPY[locale].pending;
      const mayReveal = index < state.confirmedCount || state.completed || state.previewing;
      node.detail.textContent = mayReveal ? model.frames[index]!.detail[locale] : "";
      node.detail.hidden = !mayReveal;
      node.button.title = `${model.frames[index]!.label[locale]} — ${model.frames[index]!.detail[locale]}`;
    });
  }

  function renderEdges(frameIndex: number): void {
    edgePaths.forEach((path) => {
      const from = Number(path.dataset.fromIndex);
      const to = Number(path.dataset.toIndex);
      path.dataset.state =
        from < frameIndex && to <= frameIndex ? "done" : from === frameIndex ? "active" : "pending";
    });
  }

  function animateTransition(
    fromIndex: number,
    toIndex: number | null,
    preview: boolean,
  ): Promise<void> | null {
    cancelAnimation();
    const epoch = ++animationEpoch;
    const fromFrame = frameAt(fromIndex);
    const targetIndex = toIndex === null ? fromIndex : toIndex;
    const targetFrame = frameAt(targetIndex);
    root.dataset.transitioning = "true";
    root.dataset.transitionMode = preview ? "preview" : "execute";
    root.dataset.transitionFrom = String(fromIndex);
    root.dataset.transitionTo = String(targetIndex);

    if (signatureContract !== null) {
      const contractTransition = signatureContract.animateTransition(fromIndex, preview);
      if (contractTransition === null) {
        clearTransition(epoch);
        return null;
      }
      return contractTransition.finally(() => clearTransition(epoch));
    }

    if (reducedMotion) {
      const fade = animateElement(actionTarget, [{ opacity: 0.64 }, { opacity: 1 }], 160);
      if (fade === null) {
        clearTransition(epoch);
        return null;
      }
      currentAnimation = fade;
      return settleAnimation(fade, epoch);
    }

    const sourceTokenId = fromFrame.evidence.activeTokenIds[0];
    const targetTokenId = targetFrame.evidence.activeTokenIds[0];
    if (sourceTokenId !== undefined && targetTokenId !== undefined) {
      const from = valueElements.get(sourceTokenId)?.root;
      const to = valueElements.get(targetTokenId)?.root;
      if (from !== undefined && to !== undefined && from !== to) {
        const mechanismRect = mechanism.getBoundingClientRect();
        const fromRect = from.getBoundingClientRect();
        const toRect = to.getBoundingClientRect();
        const start = rectCenter(fromRect, mechanismRect);
        const end = rectCenter(toRect, mechanismRect);
        movingToken.textContent = latestValue(sourceTokenId, fromIndex)?.value[locale] ?? "";
        movingToken.hidden = false;
        const animation = animateElement(
          movingToken,
          [
            { opacity: 0, transform: translate(start) },
            { opacity: 1, transform: translate(midpoint(start, end)) },
            { opacity: 0.86, transform: translate(end) },
          ],
          260,
        );
        if (animation !== null) {
          currentAnimation = animation;
          return settleAnimation(animation, epoch);
        }
      }
    }

    const activeValue = fromFrame.evidence.activeTokenIds
      .map((id) => valueElements.get(id)?.root)
      .find((candidate): candidate is HTMLButtonElement => candidate !== undefined);
    const changedField = profile.stateShape.find((field) => {
      const before = fromFrame.evidence.stateValues[field.id]!;
      const after = targetFrame.evidence.stateValues[field.id]!;
      return before.zh !== after.zh || before.en !== after.en;
    });
    const changedObservation =
      changedField === undefined ? undefined : observationElements.get(changedField.id)?.root;
    if (changedField !== undefined && changedObservation !== undefined) {
      const mechanismRect = mechanism.getBoundingClientRect();
      const observationRect = changedObservation.getBoundingClientRect();
      const start = rectCenter(observationRect, mechanismRect);
      const end = {
        x: start.x + Math.min(72, Math.max(36, observationRect.width * 0.35)),
        y: start.y,
      };
      movingToken.textContent = targetFrame.evidence.stateValues[changedField.id]![locale];
      movingToken.hidden = false;
      const stateAnimation = animateElement(
        movingToken,
        [
          { opacity: 0, transform: translate(start) },
          { opacity: 1, transform: translate(midpoint(start, end)) },
          { opacity: 0.86, transform: translate(end) },
        ],
        260,
      );
      if (stateAnimation !== null) {
        currentAnimation = stateAnimation;
        return settleAnimation(stateAnimation, epoch);
      }
    }
    const target = activeValue ?? changedObservation ?? actionTarget;
    const animation = animateElement(
      target,
      [
        { opacity: 0.76, transform: "translateX(0)" },
        { opacity: 1, transform: "translateX(8px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      260,
    );
    if (animation === null) {
      clearTransition(epoch);
      return null;
    }
    currentAnimation = animation;
    return settleAnimation(animation, epoch);
  }

  function settleAnimation(animation: Animation, epoch: number): Promise<void> {
    return animation.finished
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        if (currentAnimation === animation) currentAnimation = null;
        clearTransition(epoch);
      });
  }

  function cancelAnimation(): void {
    animationEpoch += 1;
    currentAnimation?.cancel();
    currentAnimation = null;
    signatureContract?.cancelAnimation();
    movingToken.hidden = true;
    movingToken.style.transform = "";
    delete root.dataset.transitioning;
    delete root.dataset.transitionMode;
    delete root.dataset.transitionFrom;
    delete root.dataset.transitionTo;
  }

  function clearTransition(epoch: number): void {
    if (epoch !== animationEpoch) return;
    movingToken.hidden = true;
    movingToken.style.transform = "";
    delete root.dataset.transitioning;
    delete root.dataset.transitionMode;
    delete root.dataset.transitionFrom;
    delete root.dataset.transitionTo;
  }

  function requestLayout(): void {
    const view = ownerDocument.defaultView;
    if (view === null || typeof view.requestAnimationFrame !== "function") {
      layoutEdges();
      return;
    }
    if (layoutFrame !== null) return;
    layoutFrame = view.requestAnimationFrame(() => {
      layoutFrame = null;
      layoutEdges();
    });
  }

  function cancelLayout(): void {
    if (layoutFrame === null) return;
    ownerDocument.defaultView?.cancelAnimationFrame?.(layoutFrame);
    layoutFrame = null;
  }

  function layoutEdges(): void {
    if (destroyed || !root.isConnected) return;
    const diagramRect = mechanism.getBoundingClientRect();
    const width = Math.max(mechanism.clientWidth, mechanism.scrollWidth, diagramRect.width);
    const height = Math.max(mechanism.clientHeight, mechanism.scrollHeight, diagramRect.height);
    svg.setAttribute("viewBox", `0 0 ${String(width)} ${String(height)}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    for (const path of edgePaths) {
      const from = nodes[Number(path.dataset.fromIndex)]?.button.getBoundingClientRect();
      const to = nodes[Number(path.dataset.toIndex)]?.button.getBoundingClientRect();
      if (from === undefined || to === undefined) continue;
      const start = rectCenter(from, diagramRect);
      const end = rectCenter(to, diagramRect);
      const controlX = (start.x + end.x) / 2;
      path.setAttribute(
        "d",
        `M ${String(start.x)} ${String(start.y)} C ${String(controlX)} ${String(start.y)}, ${String(controlX)} ${String(end.y)}, ${String(end.x)} ${String(end.y)}`,
      );
    }
  }

  function assertLive(): void {
    if (destroyed) throw new Error("FOA runtime scene has been destroyed");
  }
}

function mechanismLayout(profile: FoaSceneProfile): string {
  if (profile.learnerControl === "push-pop") return "stack";
  if (profile.learnerControl === "connect") return "memory";
  switch (profile.observableKind) {
    case "branch":
      return "branch";
    case "loop":
      return "loop";
    case "sequence":
    case "search":
    case "sorting":
    case "matrix":
      return "sequence";
    case "call-stack":
      return "stack";
    case "scope":
    case "memory":
    case "pointer":
      return "memory";
    case "stream":
      return "stream";
    case "evidence":
      return "evidence";
    case "scalar":
    case "expression":
      return "state";
  }
}

function buildEdges(
  profile: FoaSceneProfile,
  count: number,
): readonly (readonly [number, number])[] {
  if (profile.edges !== undefined) return profile.edges;
  const result: Array<readonly [number, number]> = [];
  for (let index = 0; index < count - 1; index += 1) result.push([index, index + 1]);
  if (profile.connection === "cycle" && count > 2) result.push([count - 1, 1]);
  if (profile.connection === "grid" && count > 2) result.push([count - 1, 0]);
  if (profile.connection === "unwind") {
    const call = profile.slots.indexOf("call");
    const returning = profile.slots.indexOf("return");
    if (call >= 0 && returning > call) result.push([returning, call]);
  }
  if (profile.connection === "alias") {
    const object = profile.slots.indexOf("object");
    profile.slots.forEach((slot, index) => {
      if (object >= 0 && slot === "pointer") result.push([index, object]);
    });
  }
  if (profile.connection === "branch" && count === 4) {
    const decision = profile.slots.indexOf("decision");
    const merge = profile.slots.indexOf("merge");
    const target = merge >= 0 ? merge : count - 1;
    if (decision >= 0 && target > decision + 1) result.push([decision, target]);
  }
  const seen = new Set<string>();
  return Object.freeze(
    result.filter(([from, to]) => {
      const key = `${String(from)}:${String(to)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

function visibleChannel(value: string, fallback: string): string {
  const compact = value.trim().replace(/\s+/gu, " ");
  return compact.length === 0 ? fallback : compact;
}

function animateElement(
  target: HTMLElement,
  keyframes: Keyframe[],
  duration: number,
): Animation | null {
  if (typeof target.animate !== "function") return null;
  return target.animate(keyframes, {
    duration,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    fill: "both",
  });
}

function rectCenter(rect: DOMRect, origin: DOMRect): ScenePoint {
  return {
    x: rect.left - origin.left + rect.width / 2,
    y: rect.top - origin.top + rect.height / 2,
  };
}

function midpoint(left: ScenePoint, right: ScenePoint): ScenePoint {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function translate(point: ScenePoint): string {
  return `translate(${String(point.x)}px, ${String(point.y)}px) translate(-50%, -50%)`;
}

function pointInside(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function eventTargetIsInsideButton(target: EventTarget | null, boundary: HTMLElement): boolean {
  let current = target as (EventTarget & { readonly parentElement?: HTMLElement | null }) | null;
  while (current !== null && current !== boundary) {
    if ((current as { readonly tagName?: string }).tagName === "BUTTON") return true;
    current = current.parentElement ?? null;
  }
  return false;
}

function mechanismActionButton(ownerDocument: Document, className: string): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = `foa-runtime-scene__branch-lane foa-runtime-scene__mechanism-choice ${className}`;
  resetChoiceButtonAppearance(button);
  return button;
}

function resetChoiceButtonAppearance(button: HTMLButtonElement): void {
  button.style.borderTop = "0";
  button.style.borderRight = "0";
  button.style.borderLeft = "0";
  button.style.borderRadius = "0";
  button.style.font = "inherit";
  button.style.cursor = "pointer";
}

function element<K extends keyof HTMLElementTagNameMap>(
  ownerDocument: Document,
  tag: K,
  className = "",
): HTMLElementTagNameMap[K] {
  const value = ownerDocument.createElement(tag);
  if (className.length > 0) value.className = className;
  return value;
}
