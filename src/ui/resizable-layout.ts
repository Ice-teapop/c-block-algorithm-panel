import type { InterfaceLocale } from "../shared/interface-locale.js";

export type ResizableLayoutAxis = "horizontal" | "vertical";

export interface ResizablePaneDefinition {
  readonly id: string;
  readonly element: HTMLElement;
  readonly initialSize: number;
  readonly minSize: number;
  readonly maxSize: number;
  readonly label?: string | undefined;
}

export type ResizableLayoutChangeReason = "drag" | "drag-end" | "keyboard" | "reset" | "restore";

export interface ResizableLayoutSnapshot {
  readonly schemaVersion: 1;
  readonly axis: ResizableLayoutAxis;
  readonly sizes: Readonly<Record<string, number>>;
}

export interface ResizableLayoutOptions {
  readonly axis: ResizableLayoutAxis;
  readonly panes: readonly ResizablePaneDefinition[];
  readonly keyboardStep?: number | undefined;
  readonly localeHost?: HTMLElement | undefined;
  readonly onResize?:
    ((snapshot: ResizableLayoutSnapshot, reason: ResizableLayoutChangeReason) => void) | undefined;
  readonly onPersist?:
    | ((
        snapshot: ResizableLayoutSnapshot,
        reason: Exclude<ResizableLayoutChangeReason, "drag">,
      ) => void)
    | undefined;
}

export interface ResizableLayoutController {
  readonly element: HTMLElement;
  getSnapshot(): ResizableLayoutSnapshot;
  restore(sizes: Readonly<Record<string, number>>): void;
  reset(): void;
  destroy(): void;
}

export interface SplitterKeyboardResolution {
  readonly handled: boolean;
  readonly size: number;
}

interface MountedPane {
  readonly definition: ResizablePaneDefinition;
  readonly element: HTMLElement;
  size: number;
}

interface MountedSplitter {
  readonly paneIndex: number;
  readonly element: HTMLDivElement;
}

interface ActiveResize {
  readonly pointerId: number;
  readonly paneIndex: number;
  readonly originCoordinate: number;
  readonly originSize: number;
}

const DEFAULT_KEYBOARD_STEP = 8;

export function createResizableLayout(
  host: HTMLElement,
  options: ResizableLayoutOptions,
): ResizableLayoutController {
  assertOptions(options);
  const ownerDocument = host.ownerDocument;
  const localeHost = options.localeHost ?? host;
  const currentLocale = (): InterfaceLocale =>
    localeHost.dataset.locale === "en" ? "en" : "zh-CN";
  const panes: MountedPane[] = options.panes.map((definition) => ({
    definition,
    element: definition.element,
    size: clampPaneSize(definition.initialSize, definition),
  }));
  const keyboardStep = options.keyboardStep ?? DEFAULT_KEYBOARD_STEP;
  const splitters: MountedSplitter[] = [];
  let activeResize: ActiveResize | null = null;
  let destroyed = false;

  host.classList.add("resizable-layout");
  host.dataset.resizableAxis = options.axis;
  host.style.display = "flex";
  host.style.flexDirection = options.axis === "horizontal" ? "row" : "column";
  host.style.overflow = "hidden";
  host.replaceChildren();

  for (const [index, pane] of panes.entries()) {
    preparePane(pane, options.axis, index === panes.length - 1);
    host.append(pane.element);
    if (index < panes.length - 1) {
      const splitter = ownerDocument.createElement("div");
      splitter.className = "resizable-layout__splitter";
      splitter.dataset.splitterFor = pane.definition.id;
      splitter.tabIndex = 0;
      splitter.setAttribute("role", "separator");
      splitter.setAttribute(
        "aria-orientation",
        options.axis === "horizontal" ? "vertical" : "horizontal",
      );
      splitter.setAttribute(
        "aria-label",
        splitterAriaLabel(pane.definition.label ?? pane.definition.id, currentLocale()),
      );
      splitter.title = splitterPointerTitle(currentLocale());
      splitter.setAttribute("aria-controls", pane.element.id || pane.definition.id);
      updateSplitterAria(splitter, pane);
      host.append(splitter);
      splitters.push({ paneIndex: index, element: splitter });
    }
  }

  const snapshot = (): ResizableLayoutSnapshot =>
    createResizableLayoutSnapshot(
      options.axis,
      Object.fromEntries(panes.map((pane) => [pane.definition.id, pane.size])),
    );

  const applyPane = (paneIndex: number): void => {
    const pane = panes[paneIndex];
    if (pane === undefined) return;
    const dimension = `${String(pane.size)}px`;
    pane.element.style.flexBasis = dimension;
    const splitter = splitters.find((candidate) => candidate.paneIndex === paneIndex);
    if (splitter !== undefined) updateSplitterAria(splitter.element, pane);
  };

  const setPaneSize = (
    paneIndex: number,
    requestedSize: number,
    reason: ResizableLayoutChangeReason,
  ): boolean => {
    const pane = panes[paneIndex];
    if (pane === undefined) return false;
    const nextSize = clampPaneSize(requestedSize, pane.definition);
    if (nextSize === pane.size) return false;
    pane.size = nextSize;
    applyPane(paneIndex);
    options.onResize?.(snapshot(), reason);
    return true;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (destroyed || event.button !== 0) return;
    const splitter = splitterFromTarget(event.target, splitters);
    if (splitter === undefined) return;
    const pane = panes[splitter.paneIndex];
    if (pane === undefined) return;
    event.preventDefault();
    activeResize = {
      pointerId: event.pointerId,
      paneIndex: splitter.paneIndex,
      originCoordinate: pointerCoordinate(event, options.axis),
      originSize: pane.size,
    };
    splitter.element.classList.add("is-resizing");
    host.classList.add("is-resizing");
    splitter.element.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (destroyed || activeResize === null || event.pointerId !== activeResize.pointerId) return;
    const delta = pointerCoordinate(event, options.axis) - activeResize.originCoordinate;
    setPaneSize(activeResize.paneIndex, activeResize.originSize + delta, "drag");
  };

  const finishActiveResize = (pointerId: number | null): void => {
    if (
      destroyed ||
      activeResize === null ||
      (pointerId !== null && pointerId !== activeResize.pointerId)
    ) {
      return;
    }
    const completed = activeResize;
    activeResize = null;
    const splitter = splitters.find((item) => item.paneIndex === completed.paneIndex);
    splitter?.element.classList.remove("is-resizing");
    if (splitter?.element.hasPointerCapture?.(completed.pointerId) === true) {
      splitter.element.releasePointerCapture(completed.pointerId);
    }
    host.classList.remove("is-resizing");
    options.onPersist?.(snapshot(), "drag-end");
  };
  const finishPointerResize = (event: PointerEvent): void => finishActiveResize(event.pointerId);
  const onWindowBlur = (): void => finishActiveResize(null);

  const onKeydown = (event: KeyboardEvent): void => {
    if (destroyed) return;
    const splitter = splitterFromTarget(event.target, splitters);
    if (splitter === undefined) return;
    const pane = panes[splitter.paneIndex];
    if (pane === undefined) return;
    const resolution = resolveSplitterKeyboardSize({
      axis: options.axis,
      key: event.key,
      currentSize: pane.size,
      initialSize: pane.definition.initialSize,
      minSize: pane.definition.minSize,
      maxSize: pane.definition.maxSize,
      step: event.shiftKey ? keyboardStep * 4 : keyboardStep,
    });
    if (!resolution.handled) return;
    event.preventDefault();
    setPaneSize(splitter.paneIndex, resolution.size, "keyboard");
    options.onPersist?.(snapshot(), "keyboard");
  };
  const onLocaleChange = (): void => {
    for (const splitter of splitters) {
      const pane = panes[splitter.paneIndex];
      if (pane === undefined) continue;
      splitter.element.setAttribute(
        "aria-label",
        splitterAriaLabel(pane.definition.label ?? pane.definition.id, currentLocale()),
      );
      splitter.element.title = splitterPointerTitle(currentLocale());
    }
  };

  host.addEventListener("pointerdown", onPointerDown);
  host.addEventListener("keydown", onKeydown);
  host.addEventListener("lostpointercapture", finishPointerResize);
  ownerDocument.addEventListener("pointermove", onPointerMove);
  ownerDocument.addEventListener("pointerup", finishPointerResize);
  ownerDocument.addEventListener("pointercancel", finishPointerResize);
  ownerDocument.defaultView?.addEventListener("blur", onWindowBlur);
  localeHost.addEventListener("workbench-locale-change", onLocaleChange);

  return Object.freeze({
    element: host,
    getSnapshot(): ResizableLayoutSnapshot {
      assertActive(destroyed);
      return snapshot();
    },
    restore(sizes: Readonly<Record<string, number>>): void {
      assertActive(destroyed);
      if (sizes === null || typeof sizes !== "object") {
        throw new TypeError("sizes 必须是 pane id 到尺寸的映射");
      }
      for (const [index, pane] of panes.entries()) {
        const requested = sizes[pane.definition.id];
        if (requested !== undefined) setPaneSize(index, requested, "restore");
      }
      options.onPersist?.(snapshot(), "restore");
    },
    reset(): void {
      assertActive(destroyed);
      for (const [index, pane] of panes.entries()) {
        setPaneSize(index, pane.definition.initialSize, "reset");
      }
      options.onPersist?.(snapshot(), "reset");
    },
    destroy(): void {
      if (destroyed) return;
      const pendingResize = activeResize;
      activeResize = null;
      if (pendingResize !== null) {
        const splitter = splitters.find((item) => item.paneIndex === pendingResize.paneIndex);
        splitter?.element.classList.remove("is-resizing");
        if (splitter?.element.hasPointerCapture?.(pendingResize.pointerId) === true) {
          splitter.element.releasePointerCapture(pendingResize.pointerId);
        }
      }
      destroyed = true;
      host.classList.remove("is-resizing", "resizable-layout");
      delete host.dataset.resizableAxis;
      host.style.removeProperty("display");
      host.style.removeProperty("flex-direction");
      host.style.removeProperty("overflow");
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("keydown", onKeydown);
      host.removeEventListener("lostpointercapture", finishPointerResize);
      ownerDocument.removeEventListener("pointermove", onPointerMove);
      ownerDocument.removeEventListener("pointerup", finishPointerResize);
      ownerDocument.removeEventListener("pointercancel", finishPointerResize);
      ownerDocument.defaultView?.removeEventListener("blur", onWindowBlur);
      localeHost.removeEventListener("workbench-locale-change", onLocaleChange);
      for (const splitter of splitters) splitter.element.remove();
      for (const pane of panes) clearPanePreparation(pane.element, options.axis);
    },
  });
}

export function splitterAriaLabel(label: string, locale: InterfaceLocale): string {
  if (locale === "en") {
    return /[\p{Script=Han}]/u.test(label) ? "Panel size" : `${label} size`;
  }
  return `${label} 尺寸`;
}

function splitterPointerTitle(locale: InterfaceLocale): string {
  return locale === "en" ? "Drag to resize adjacent panels" : "拖动调整相邻面板";
}

export interface SplitterKeyboardInput {
  readonly axis: ResizableLayoutAxis;
  readonly key: string;
  readonly currentSize: number;
  readonly initialSize: number;
  readonly minSize: number;
  readonly maxSize: number;
  readonly step?: number | undefined;
}

export function resolveSplitterKeyboardSize(
  input: SplitterKeyboardInput,
): SplitterKeyboardResolution {
  const step = input.step ?? DEFAULT_KEYBOARD_STEP;
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("step 必须大于 0");
  const decreaseKey = input.axis === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const increaseKey = input.axis === "horizontal" ? "ArrowRight" : "ArrowDown";
  let nextSize: number;
  if (input.key === decreaseKey) nextSize = input.currentSize - step;
  else if (input.key === increaseKey) nextSize = input.currentSize + step;
  else if (input.key === "Home") nextSize = input.minSize;
  else if (input.key === "End") nextSize = input.maxSize;
  else if (input.key === "Enter") nextSize = input.initialSize;
  else return Object.freeze({ handled: false, size: input.currentSize });
  return Object.freeze({
    handled: true,
    size: clampNumber(nextSize, input.minSize, input.maxSize),
  });
}

export function createResizableLayoutSnapshot(
  axis: ResizableLayoutAxis,
  sizes: Readonly<Record<string, number>>,
): ResizableLayoutSnapshot {
  if (axis !== "horizontal" && axis !== "vertical") {
    throw new TypeError("axis 必须是 horizontal 或 vertical");
  }
  const normalized: Record<string, number> = {};
  for (const [id, size] of Object.entries(sizes)) {
    if (id.length === 0 || !Number.isFinite(size) || size <= 0) {
      throw new TypeError("pane size 必须使用非空 id 和正数尺寸");
    }
    normalized[id] = size;
  }
  return Object.freeze({
    schemaVersion: 1,
    axis,
    sizes: Object.freeze(normalized),
  });
}

function preparePane(pane: MountedPane, axis: ResizableLayoutAxis, last: boolean): void {
  pane.element.classList.add("resizable-layout__pane");
  pane.element.dataset.resizablePaneId = pane.definition.id;
  pane.element.style.overflow = "auto";
  pane.element.style.flexGrow = last ? "1" : "0";
  pane.element.style.flexShrink = "1";
  pane.element.style.flexBasis = `${String(pane.size)}px`;
  if (axis === "horizontal") {
    pane.element.style.minWidth = "0";
    pane.element.style.maxWidth = `${String(pane.definition.maxSize)}px`;
  } else {
    pane.element.style.minHeight = "0";
    pane.element.style.maxHeight = `${String(pane.definition.maxSize)}px`;
  }
}

function clearPanePreparation(element: HTMLElement, axis: ResizableLayoutAxis): void {
  element.classList.remove("resizable-layout__pane");
  delete element.dataset.resizablePaneId;
  element.style.removeProperty("overflow");
  element.style.removeProperty("flex-grow");
  element.style.removeProperty("flex-shrink");
  element.style.removeProperty("flex-basis");
  element.style.removeProperty(axis === "horizontal" ? "min-width" : "min-height");
  element.style.removeProperty(axis === "horizontal" ? "max-width" : "max-height");
}

function updateSplitterAria(splitter: HTMLElement, pane: MountedPane): void {
  splitter.setAttribute("aria-valuemin", String(pane.definition.minSize));
  splitter.setAttribute("aria-valuemax", String(pane.definition.maxSize));
  splitter.setAttribute("aria-valuenow", String(pane.size));
}

function splitterFromTarget(
  target: EventTarget | null,
  splitters: readonly MountedSplitter[],
): MountedSplitter | undefined {
  if (!(target instanceof Element)) return undefined;
  const element = target.closest<HTMLElement>("[data-splitter-for]");
  return splitters.find((splitter) => splitter.element === element);
}

function pointerCoordinate(event: PointerEvent, axis: ResizableLayoutAxis): number {
  return axis === "horizontal" ? event.clientX : event.clientY;
}

function clampPaneSize(size: number, definition: ResizablePaneDefinition): number {
  return clampNumber(size, definition.minSize, definition.maxSize);
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function assertOptions(options: ResizableLayoutOptions): void {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Resizable layout options 必须是对象");
  }
  if (options.axis !== "horizontal" && options.axis !== "vertical") {
    throw new TypeError("axis 必须是 horizontal 或 vertical");
  }
  if (options.panes.length < 2) throw new RangeError("Resizable layout 至少需要两个 pane");
  const ids = new Set<string>();
  for (const pane of options.panes) {
    if (pane.id.length === 0 || ids.has(pane.id)) throw new TypeError("pane id 必须唯一且非空");
    if (
      !Number.isFinite(pane.minSize) ||
      !Number.isFinite(pane.maxSize) ||
      pane.minSize <= 0 ||
      pane.maxSize < pane.minSize ||
      !Number.isFinite(pane.initialSize)
    ) {
      throw new RangeError(`pane ${pane.id} 的尺寸约束无效`);
    }
    ids.add(pane.id);
  }
  const step = options.keyboardStep ?? DEFAULT_KEYBOARD_STEP;
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("keyboardStep 必须大于 0");
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("Resizable layout 已销毁");
}
