import type { FoaLessonDefinition, FoaLocale } from "../tutorials/foa-contracts.js";
import {
  createFoaFlowLessonGraph,
  getFoaFlowLessonModel,
  type FoaFlowLessonKind,
  type FoaFlowLessonModel,
} from "../tutorials/foa-flow-lesson-models.js";
import {
  createFlowTimeline,
  createFlowTimelineController,
  type FlowFrame,
} from "../tutorials/flow-lesson-model.js";
import { observeViewportZoom, transportKeyframes } from "./foa-data-flow-demo-geometry.js";
import {
  FOA_DATA_FLOW_DEMO_COPY as COPY,
  inputDialogTitle,
  mountDemo,
  movingValueText,
  nearestFrameForNode,
  nodeDetail,
  parseInteger,
  prefersReducedMotion,
  transitionValueText,
} from "./foa-data-flow-demo-presentation.js";

export type FoaDataFlowDemoKind = FoaFlowLessonKind;

export interface FoaDataFlowFrameChange {
  readonly frameIndex: number;
  readonly previousFrameIndex: number | null;
  readonly sourceEventIndex: number;
  readonly previousSourceEventIndex: number | null;
  readonly summary: string;
}

export interface FoaDataFlowDemoOptions {
  readonly locale: FoaLocale;
  readonly reducedMotion?: boolean | undefined;
  readonly onSubmitInput: () => void;
  readonly onCancelInitialInput: () => void;
  readonly onFrameChange: (change: FoaDataFlowFrameChange) => void;
  readonly onComplete: () => void;
}

export interface FoaDataFlowDemoController {
  readonly kind: FoaDataFlowDemoKind;
  readonly root: HTMLElement;
  readonly hasInput: boolean;
  readonly inputText: string;
  readonly outputText: string;
  openInput(initial: boolean): void;
  closeInput(): void;
  reset(): void;
  setLocale(locale: FoaLocale): void;
  setReducedMotion(reducedMotion: boolean): void;
  focusFrame(): void;
  destroy(): void;
}

const PLAYBACK_STEP_MS = 1_200;

export function createFoaDataFlowDemo(
  ownerDocument: Document,
  lesson: FoaLessonDefinition,
  options: FoaDataFlowDemoOptions,
): FoaDataFlowDemoController | null {
  const registeredDefinition = getFoaFlowLessonModel(lesson);
  if (registeredDefinition === null) return null;
  const definition: FoaFlowLessonModel = registeredDefinition;
  const graph = createFoaFlowLessonGraph(definition);
  let locale = options.locale;
  let inputValue = definition.input.defaultValue;
  let hasInput = false;
  let initialDialog = true;
  let destroyed = false;
  let previousFocus: HTMLElement | null = null;
  let reducedMotion = options.reducedMotion ?? prefersReducedMotion(ownerDocument);
  let timeline = createFlowTimeline(graph, inputValue);
  let controller = createFlowTimelineController(timeline, { reducedMotion });
  // The timeline controller owns committed frames; these fields own only in-flight motion.
  let previousFrameIndex: number | null = null;
  let completionEmitted = false;
  let directTerminal = false;
  let predictionError = false;
  let transitioning = false;
  let transitionPlaybackPaused = false;
  let transitionTargetIndex: number | null = null;
  let pendingTransitionCommit: (() => void) | null = null;
  let pendingTransitionCancel: (() => void) | null = null;
  const answeredPredictions = new Set<string>();
  let playbackTimer: ReturnType<typeof setTimeout> | null = null;
  const animations = new Set<Animation>();
  const elements = mountDemo(ownerDocument, lesson.order, definition, graph);
  const disconnectViewportCompensation = observeViewportZoom(ownerDocument, elements);

  wireInteractions();
  applyLocale();
  render();

  return Object.freeze({
    kind: definition.kind,
    root: elements.root,
    get hasInput(): boolean {
      return hasInput;
    },
    get inputText(): string {
      return String(inputValue);
    },
    get outputText(): string {
      return timeline.at(-1)?.output ?? "";
    },
    openInput,
    closeInput,
    reset(): void {
      assertLive();
      stopPlayback();
      cancelAnimations();
      previousFrameIndex = null;
      completionEmitted = false;
      directTerminal = false;
      predictionError = false;
      answeredPredictions.clear();
      controller.reset();
      render();
    },
    setLocale(nextLocale: FoaLocale): void {
      assertLive();
      cancelAnimations();
      locale = nextLocale;
      applyLocale();
      render();
    },
    setReducedMotion(nextReducedMotion: boolean): void {
      assertLive();
      reducedMotion = nextReducedMotion;
      elements.root.dataset.reducedMotion = String(reducedMotion);
      controller.setReducedMotion(reducedMotion);
      if (reducedMotion && transitioning) {
        finishPendingTransition();
      }
    },
    focusFrame(): void {
      elements.frame.focus({ preventScroll: true });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      stopPlayback();
      cancelAnimations();
      disconnectViewportCompensation();
      elements.disconnectEdgeGeometry();
      closeInput();
      elements.root.remove();
    },
  });

  function wireInteractions(): void {
    elements.changeInput.addEventListener("click", () => openInput(false));
    elements.cancel.addEventListener("click", cancelInput);
    elements.dialog.addEventListener("cancel", cancelInput);
    elements.dialog.addEventListener("close", restoreFocus);
    elements.dialog.querySelector("form")?.addEventListener("submit", submitInput);
    elements.previous.addEventListener("click", stepBack);
    elements.next.addEventListener("click", stepForward);
    elements.playPause.addEventListener("click", togglePlayback);
    elements.timeline.addEventListener("input", seekTimeline);
    elements.frame.addEventListener("keydown", onFrameKeyDown);
    for (const node of elements.nodeElements.values()) {
      node.addEventListener("click", () => {
        const nodeId = node.dataset.flowNodeId;
        if (nodeId === undefined) return;
        const nextIndex = nearestFrameForNode(timeline, nodeId, controller.getState().index);
        if (nextIndex === null) return;
        seek(nextIndex);
      });
    }
    for (const [answer, button] of elements.predictionButtons) {
      button.addEventListener("click", () => submitBranchPrediction(answer));
    }
  }

  function openInput(initial: boolean): void {
    assertLive();
    if (transitioning) {
      cancelAnimations();
      render();
    }
    initialDialog = initial;
    previousFocus =
      ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : null;
    elements.input.value = String(inputValue);
    elements.error.textContent = "";
    if (!elements.dialog.open) elements.dialog.showModal();
    elements.input.focus({ preventScroll: true });
    elements.input.select();
  }

  function closeInput(): void {
    if (elements.dialog.open) elements.dialog.close("dismissed");
  }

  function cancelInput(event: Event): void {
    event.preventDefault();
    closeInput();
    if (initialDialog && !hasInput) options.onCancelInitialInput();
  }

  function submitInput(event: Event): void {
    event.preventDefault();
    const parsed = parseInteger(
      elements.input.value,
      definition.input.minimum,
      definition.input.maximum,
    );
    if (parsed === null) {
      elements.error.textContent = COPY[locale].invalid(
        definition.input.minimum,
        definition.input.maximum,
      );
      elements.input.focus({ preventScroll: true });
      elements.input.select();
      return;
    }
    stopPlayback();
    cancelAnimations();
    inputValue = parsed;
    hasInput = true;
    timeline = createFlowTimeline(graph, inputValue);
    controller = createFlowTimelineController(timeline, { reducedMotion });
    previousFrameIndex = null;
    completionEmitted = false;
    directTerminal = false;
    predictionError = false;
    answeredPredictions.clear();
    rebuildIterations();
    closeInput();
    options.onSubmitInput();
    applyDirectTerminalState();
    render();
    elements.frame.focus({ preventScroll: true });
  }

  function applyDirectTerminalState(): void {
    directTerminal = definition.kind === "loop" && inputValue === 0;
    if (!directTerminal) return;
    controller.seek(timeline.length - 1);
    completionEmitted = true;
    options.onComplete();
  }

  function restoreFocus(): void {
    if (hasInput) elements.frame.focus({ preventScroll: true });
    else previousFocus?.focus({ preventScroll: true });
    previousFocus = null;
  }

  function stepBack(): void {
    if (directTerminal) return;
    if (transitioning) {
      stopPlayback();
      cancelPendingTransition();
      return;
    }
    stopPlayback();
    const current = controller.getState();
    if (!current.canStepBack) return;
    beginTransition(current.index - 1);
  }

  function stepForward(): void {
    if (directTerminal) return;
    if (transitioning) {
      finishPendingTransition();
      return;
    }
    const current = controller.getState();
    if (requiresBranchPrediction(current.frame)) return;
    if (!current.canStepForward) return;
    beginTransition(current.index + 1);
  }

  function seekTimeline(): void {
    if (directTerminal) return;
    seek(Number(elements.timeline.value));
  }

  function seek(index: number): void {
    if (directTerminal || !Number.isSafeInteger(index)) return;
    stopPlayback();
    if (transitioning) cancelPendingTransition();
    const current = controller.getState();
    if (index === current.index) return;
    if (requiresBranchPrediction(current.frame) && index > current.index) return;
    if (current.frame.activeNodeId === "branch.decision") predictionError = false;
    resetPredictionForReturn(index, current.index);
    previousFrameIndex = current.index;
    controller.seek(index);
    render();
    emitCompletionIfNeeded();
  }

  function togglePlayback(): void {
    if (directTerminal) return;
    const state = controller.getState();
    if (transitioning) {
      if (state.playing) {
        pauseTransitionPlayback();
      } else if (transitionPlaybackPaused) {
        resumeTransitionPlayback();
      }
      return;
    }
    if (requiresBranchPrediction(state.frame)) return;
    if (state.playing) {
      stopPlayback();
      render();
      return;
    }
    if (!state.canStepForward) {
      previousFrameIndex = state.index;
      answeredPredictions.clear();
      predictionError = false;
      controller.reset();
    }
    controller.play();
    render();
    schedulePlayback();
  }

  function schedulePlayback(): void {
    clearPlaybackTimer();
    if (!controller.getState().playing || destroyed) return;
    if (requiresBranchPrediction(controller.getState().frame)) {
      controller.pause();
      render();
      return;
    }
    playbackTimer = setTimeout(() => {
      playbackTimer = null;
      if (destroyed || !controller.getState().playing) return;
      const current = controller.getState();
      if (!current.canStepForward) {
        stopPlayback();
        render();
        return;
      }
      beginTransition(current.index + 1, () => {
        if (controller.getState().playing) schedulePlayback();
      });
    }, PLAYBACK_STEP_MS / controller.getState().rate);
  }

  function stopPlayback(): void {
    clearPlaybackTimer();
    controller.pause();
  }

  function pauseTransitionPlayback(): void {
    if (!transitioning || !controller.getState().playing) return;
    stopPlayback();
    transitionPlaybackPaused = true;
    for (const animation of animations) animation.pause();
    syncTransportState();
    applyPlaybackCopy();
    renderRuntimeState();
  }

  function resumeTransitionPlayback(): void {
    if (!transitioning || !transitionPlaybackPaused || destroyed) return;
    controller.play();
    transitionPlaybackPaused = false;
    for (const animation of animations) animation.play();
    syncTransportState();
    applyPlaybackCopy();
    renderRuntimeState();
  }

  function clearPlaybackTimer(): void {
    if (playbackTimer === null) return;
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }

  function emitCompletionIfNeeded(): void {
    const state = controller.getState();
    if (state.index !== state.frameCount - 1 || completionEmitted) return;
    completionEmitted = true;
    options.onComplete();
  }

  function requiresBranchPrediction(frame: FlowFrame): boolean {
    return (
      definition.prediction !== undefined &&
      frame.activeNodeId === definition.prediction.nodeId &&
      !answeredPredictions.has(frame.id)
    );
  }

  function submitBranchPrediction(answer: string): void {
    const frame = controller.getState().frame;
    if (!requiresBranchPrediction(frame)) return;
    const expected = predictionAnswer(frame) === answer;
    if (!expected) {
      predictionError = true;
      render();
      return;
    }
    predictionError = false;
    answeredPredictions.add(frame.id);
    elements.prediction.dataset.state = "correct";
    elements.predictionPrompt.textContent = COPY[locale].predictionCorrect;
    for (const button of elements.predictionButtons.values()) button.disabled = true;
    stepForward();
  }

  function predictionAnswer(frame: FlowFrame): string | null {
    const explicit = frame.values.prediction;
    if (explicit !== undefined) return explicit;
    for (const edgeId of frame.activeEdgeIds) {
      const kind = graph.edges.find((edge) => edge.id === edgeId)?.kind;
      if (kind === "true" || kind === "false") return kind;
    }
    return null;
  }

  function onFrameKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepBack();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepForward();
    } else if (event.key === " ") {
      event.preventDefault();
      togglePlayback();
    }
  }

  function applyLocale(): void {
    const copy = COPY[locale];
    elements.root.dataset.locale = locale;
    elements.title.textContent = copy.title;
    elements.evidence.textContent = copy.evidence;
    elements.changeInput.textContent = copy.changeInput;
    elements.previous.textContent = copy.previous;
    elements.next.textContent = copy.next;
    elements.timeline.setAttribute("aria-label", copy.timeline);
    elements.predictionPrompt.textContent =
      definition.prediction?.prompt[locale] ?? copy.predictBranch;
    for (const choice of definition.prediction?.choices ?? []) {
      const button = elements.predictionButtons.get(choice.id);
      if (button !== undefined) button.textContent = choice.label[locale];
    }
    elements.dialogTitle.textContent = inputDialogTitle(
      definition.lessonOrder,
      definition.kind,
      locale,
    );
    elements.dialogDescription.textContent = definition.summary[locale];
    elements.inputLabel.textContent = definition.input.label[locale];
    elements.cancel.textContent = copy.cancel;
    elements.submit.textContent = copy.confirm;
    for (const node of graph.nodes) {
      elements.nodeLabels.get(node.id)!.textContent = node.label[locale];
    }
    for (const edgeLabel of elements.root.querySelectorAll<SVGTextElement>(
      "[data-flow-edge-label]",
    )) {
      edgeLabel.textContent = edgeLabel.dataset[locale === "zh" ? "labelZh" : "labelEn"] ?? "";
    }
  }

  function render(): void {
    const copy = COPY[locale];
    const state = controller.getState();
    const frame = state.frame;
    const predictionRequired = requiresBranchPrediction(frame);
    elements.root.dataset.reducedMotion = String(reducedMotion);
    elements.frame.dataset.frameIndex = String(state.index);
    elements.frame.dataset.frameId = frame.id;
    elements.frame.dataset.motionState = "idle";
    elements.inputSummary.textContent = `${copy.input}: ${String(inputValue)}`;
    elements.observation.textContent = predictionError
      ? `${frame.summary[locale]} · ${copy.predictionWrong}`
      : frame.summary[locale];
    renderRuntimeState(predictionRequired);
    elements.timeline.max = String(state.frameCount - 1);
    elements.timeline.value = String(state.index);
    elements.timeline.setAttribute("aria-valuemin", "0");
    elements.timeline.setAttribute("aria-valuemax", String(state.frameCount - 1));
    elements.timeline.setAttribute("aria-valuenow", String(state.index));
    elements.timeline.setAttribute(
      "aria-valuetext",
      `${String(state.index + 1)} / ${String(state.frameCount)}`,
    );
    syncTransportState();
    applyPlaybackCopy();
    elements.prediction.hidden = !predictionRequired;
    elements.prediction.dataset.state = predictionError ? "error" : "ready";
    if (predictionRequired) {
      elements.predictionPrompt.textContent =
        definition.prediction?.prompt[locale] ?? copy.predictBranch;
    }

    const cumulativeEdges = new Set<string>();
    // Mark an edge taken only after leaving its frame, never while it is still future work.
    for (let index = 0; index < state.index; index += 1) {
      for (const edgeId of timeline[index]!.activeEdgeIds) cumulativeEdges.add(edgeId);
    }
    for (const edge of graph.edges) {
      const element = elements.edgeElements.get(edge.id)!;
      element.dataset.state = cumulativeEdges.has(edge.id) ? "taken" : "idle";
    }

    for (const node of graph.nodes) {
      const element = elements.nodeElements.get(node.id)!;
      delete element.dataset.arrivalState;
      // Revealing the skipped branch before prediction would give away the answer.
      const branchOutcomeRevealed =
        definition.kind !== "branch" || (state.index > 0 && !predictionRequired);
      const skipped = branchOutcomeRevealed && frame.skippedNodeIds.includes(node.id);
      const done = frame.completedNodeIds.includes(node.id);
      const nodeState = skipped
        ? "skipped"
        : node.id === frame.activeNodeId
          ? "active"
          : done
            ? "done"
            : "pending";
      element.dataset.state = nodeState;
      element.dataset.stateLabel =
        nodeState === "active"
          ? copy.active
          : nodeState === "done"
            ? copy.done
            : nodeState === "skipped"
              ? copy.skipped
              : "";
      element.setAttribute("aria-current", nodeState === "active" ? "step" : "false");
      element.setAttribute(
        "aria-label",
        `${node.label[locale]} · ${nodeState === "active" ? copy.active : nodeState === "done" ? copy.done : nodeState === "skipped" ? copy.skipped : copy.pending}`,
      );
      elements.nodeDetails.get(node.id)!.textContent =
        nodeState === "skipped"
          ? copy.skipped
          : node.id === frame.activeNodeId
            ? nodeDetail(frame, definition.kind, locale)
            : "";
    }

    placeValue(frame.activeNodeId, frame);
    renderIterations(frame);
    for (const outputNode of graph.nodes.filter((item) => item.role === "output")) {
      const outputElement = elements.nodeElements.get(outputNode.id)!;
      outputElement.dataset.flowOutput = "true";
      if (frame.output !== undefined && outputNode.id === frame.activeNodeId) {
        outputElement.dataset.state = "done";
      }
      const outputDetail = elements.nodeDetails.get(outputNode.id)!;
      outputDetail.textContent = "";
    }
    options.onFrameChange({
      frameIndex: state.index,
      previousFrameIndex,
      sourceEventIndex: frame.sourceEventIndex,
      previousSourceEventIndex:
        previousFrameIndex === null
          ? null
          : (timeline[previousFrameIndex]?.sourceEventIndex ?? null),
      summary: frame.summary[locale],
    });
    previousFrameIndex = null;
  }

  function placeValue(nodeId: string, frame: FlowFrame): void {
    const mount = elements.valueMounts.get(nodeId);
    if (mount === undefined) return;
    if (elements.movingValue.parentElement !== mount) mount.append(elements.movingValue);
    elements.movingValue.textContent = movingValueText(frame, definition.kind);
    elements.movingValue.setAttribute("aria-label", frame.summary[locale]);
    elements.movingValue.dataset.motionState = "settled";
  }

  function beginTransition(targetIndex: number, afterCommit?: () => void): void {
    if (transitioning || directTerminal) return;
    const source = controller.getState();
    const target = timeline[targetIndex];
    const targetMount =
      target === undefined ? undefined : elements.valueMounts.get(target.activeNodeId);
    if (target === undefined || targetMount === undefined || targetIndex === source.index) return;

    cancelAnimations();
    const sourceIndex = source.index;
    const traversedEdgeIds =
      targetIndex > sourceIndex ? source.frame.activeEdgeIds : target.activeEdgeIds;
    elements.refreshEdgeGeometry();
    const before = elements.movingValue.getBoundingClientRect();
    const travelingText = transitionValueText(
      source.frame,
      target,
      definition.kind,
      targetIndex > sourceIndex,
    );
    targetMount.append(elements.movingValue);
    elements.movingValue.textContent = travelingText;
    elements.movingValue.setAttribute("aria-label", target.summary[locale]);
    const after = elements.movingValue.getBoundingClientRect();
    const deltaX = before.left - after.left;
    const deltaY = before.top - after.top;
    const traversedEdge = traversedEdgeIds
      .map((edgeId) => elements.edgeElements.get(edgeId))
      .find((edge): edge is SVGPathElement => edge !== undefined);

    transitioning = true;
    transitionPlaybackPaused = false;
    transitionTargetIndex = targetIndex;
    elements.frame.dataset.motionState = "moving";
    elements.movingValue.dataset.motionState = "moving";
    elements.nodeElements.get(target.activeNodeId)?.setAttribute("data-arrival-state", "receiving");
    for (const edgeId of traversedEdgeIds) {
      elements.edgeElements.get(edgeId)?.setAttribute("data-state", "traversing");
    }
    syncTransportState();
    renderRuntimeState();

    let settled = false;
    // Timeline state changes only at this commit boundary, after motion settles or is cancelled.
    const settle = (commit: boolean): void => {
      if (settled) return;
      settled = true;
      for (const animation of animations) animation.cancel();
      animations.clear();
      pendingTransitionCommit = null;
      pendingTransitionCancel = null;
      transitioning = false;
      transitionPlaybackPaused = false;
      transitionTargetIndex = null;
      previousFrameIndex = sourceIndex;
      if (commit) {
        resetPredictionForReturn(targetIndex, sourceIndex);
        controller.seek(targetIndex);
      } else {
        // A cancelled branch traversal must reopen the source prediction gate.
        resetPredictionForReturn(sourceIndex, targetIndex);
      }
      render();
      if (commit) {
        emitCompletionIfNeeded();
        afterCommit?.();
      }
    };
    pendingTransitionCommit = () => settle(true);
    pendingTransitionCancel = () => settle(false);

    if (
      reducedMotion ||
      typeof elements.movingValue.animate !== "function" ||
      !Number.isFinite(deltaX) ||
      !Number.isFinite(deltaY)
    ) {
      settle(true);
      return;
    }

    const animation = elements.movingValue.animate(
      transportKeyframes(traversedEdge, before, after, deltaX, deltaY, targetIndex > sourceIndex),
      { duration: 480, easing: "linear" },
    );
    animations.add(animation);
    void animation.finished
      .then(() => {
        if (!destroyed) settle(true);
      })
      .catch(() => undefined)
      .finally(() => animations.delete(animation));
  }

  function rebuildIterations(): void {
    elements.iterations.replaceChildren();
    if (definition.kind !== "loop" || inputValue === 0) return;
    const bodyFrames = timeline.filter((item) => item.activeNodeId === "loop.body");
    for (const item of bodyFrames) {
      const marker = ownerDocument.createElement("span");
      marker.dataset.flowIteration = item.values.iteration ?? "";
      marker.textContent = `${COPY[locale].iteration} ${item.values.iteration ?? ""}`;
      elements.iterations.append(marker);
    }
  }

  function resetPredictionForReturn(targetIndex: number, sourceIndex: number): void {
    if (definition.kind !== "branch" || targetIndex >= sourceIndex) return;
    const targetFrame = timeline[targetIndex];
    if (targetFrame === undefined || targetFrame.activeNodeId !== definition.prediction?.nodeId) {
      return;
    }
    answeredPredictions.delete(targetFrame.id);
    predictionError = false;
  }

  function renderIterations(frame: FlowFrame): void {
    const currentIteration = frame.iteration ?? 0;
    for (const marker of elements.iterations.children) {
      if (!(marker instanceof HTMLElement)) continue;
      const iteration = Number(marker.dataset.flowIteration ?? "0");
      marker.dataset.state =
        iteration === currentIteration
          ? "active"
          : iteration < currentIteration
            ? "done"
            : "pending";
      marker.textContent = `${COPY[locale].iteration} ${String(iteration)}`;
    }
  }

  function cancelAnimations(): void {
    if (transitioning && controller.getState().playing) stopPlayback();
    for (const animation of animations) animation.cancel();
    animations.clear();
    pendingTransitionCommit = null;
    pendingTransitionCancel = null;
    transitioning = false;
    transitionPlaybackPaused = false;
    transitionTargetIndex = null;
  }

  function finishPendingTransition(): void {
    pendingTransitionCommit?.();
  }

  function cancelPendingTransition(): void {
    pendingTransitionCancel?.();
  }

  function applyPlaybackCopy(): void {
    const playing = controller.getState().playing;
    elements.playPause.textContent = playing ? COPY[locale].pause : COPY[locale].play;
    elements.playPause.setAttribute("aria-pressed", String(playing));
  }

  function renderRuntimeState(
    predictionRequired = requiresBranchPrediction(controller.getState().frame),
  ) {
    const state = controller.getState();
    const runtimeState = predictionRequired
      ? "prediction"
      : transitioning
        ? transitionPlaybackPaused
          ? "paused"
          : "running"
        : !state.canStepForward
          ? "completed"
          : state.playing
            ? "running"
            : state.index === 0
              ? "ready"
              : "paused";
    const copy = COPY[locale];
    elements.root.dataset.runState = runtimeState;
    elements.evidence.dataset.runtimeState = runtimeState;
    elements.position.textContent = `${copy[runtimeState]} · ${String(state.index + 1)}/${String(state.frameCount)}`;
    if (definition.lessonOrder !== 5) {
      elements.evidence.textContent = copy.evidence;
      return;
    }

    const currentLabel =
      graph.nodes.find((node) => node.id === state.frame.activeNodeId)?.label[locale] ?? "";
    const targetFrame =
      transitionTargetIndex === null ? undefined : timeline[transitionTargetIndex];
    const targetLabel =
      targetFrame === undefined
        ? ""
        : (graph.nodes.find((node) => node.id === targetFrame.activeNodeId)?.label[locale] ?? "");
    if (transitioning && targetLabel.length > 0) {
      elements.evidence.textContent = `${copy.traversingPath}: ${currentLabel} → ${targetLabel}`;
      return;
    }
    if (state.index === 0) {
      elements.evidence.textContent = `${copy.currentPath}: ${currentLabel}`;
      return;
    }
    const route = timeline
      .slice(0, state.index + 1)
      .map(
        (frame) => graph.nodes.find((node) => node.id === frame.activeNodeId)?.label[locale] ?? "",
      )
      .filter((label, index, labels) => label.length > 0 && label !== labels[index - 1]);
    elements.evidence.textContent = `${copy.completedPath}: ${route.join(" → ")}`;
  }

  function syncTransportState(): void {
    const state = controller.getState();
    const predictionRequired = requiresBranchPrediction(state.frame);
    elements.previous.disabled = directTerminal || (!transitioning && !state.canStepBack);
    elements.next.disabled =
      transitioning || directTerminal || predictionRequired || !state.canStepForward;
    elements.playPause.disabled =
      directTerminal ||
      predictionRequired ||
      (transitioning && !state.playing && !transitionPlaybackPaused);
    elements.timeline.disabled = directTerminal || state.playing || predictionRequired;
    for (const button of elements.predictionButtons.values()) {
      button.disabled = transitioning;
    }
  }

  function assertLive(): void {
    if (destroyed) throw new Error("FOA data-flow demo has been destroyed");
  }
}
