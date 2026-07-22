export type TaskLessonMotionKind = "pick-key" | "compare" | "shift" | "insert" | "settle";

export interface TaskLessonMotionPoint {
  readonly left: number;
  readonly top: number;
}

export type TaskLessonMotionLayout = ReadonlyMap<string, TaskLessonMotionPoint>;

export type TaskLessonMotionPresence = "enter" | "exit";

export interface TaskLessonMotionControllerOptions {
  readonly reducedMotion?: boolean | undefined;
  readonly playbackRate?: number | undefined;
}

export interface TaskLessonMotionController {
  readonly playbackRate: number;
  readonly reducedMotion: boolean;
  capture(elements: Iterable<HTMLElement>): TaskLessonMotionLayout;
  animateFrom(
    previous: TaskLessonMotionLayout,
    elements: Iterable<HTMLElement>,
    kind: TaskLessonMotionKind,
  ): Promise<void>;
  /**
   * Animates a mounted token into or out of the lesson stage. Enter and exit use the exact same
   * spatial path in opposite directions, so a caller can reverse a pending removal without a jump.
   * The caller remains responsible for mounting before enter and hiding/removing after exit.
   */
  animatePresence(
    elements: Iterable<HTMLElement>,
    kind: TaskLessonMotionKind,
    presence: TaskLessonMotionPresence,
    displacement?: TaskLessonMotionPoint,
  ): Promise<void>;
  setReducedMotion(reducedMotion: boolean): void;
  setRate(rate: number): void;
  pause(): void;
  play(): void;
  finish(): void;
  cancel(): void;
  destroy(): void;
}

/** Keeps semantic playback readable even at the fastest supported transport rate. */
export const MIN_TASK_LESSON_PLAYBACK_STEP_MS = 1_200;

export function readableTaskLessonSemanticDuration(
  durationMs: number,
  maximumPlaybackRate: number,
): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RangeError("教学事件时长必须是非负有限数");
  }
  const rate = normalizedRate(maximumPlaybackRate);
  return Math.max(durationMs, MIN_TASK_LESSON_PLAYBACK_STEP_MS * rate);
}

const MOTION_DURATIONS: Readonly<Record<TaskLessonMotionKind, number>> = Object.freeze({
  "pick-key": 260,
  compare: 180,
  shift: 280,
  insert: 320,
  settle: 180,
});

const EASING = "cubic-bezier(0.25, 1, 0.5, 1)";
const MIN_RATE = 0.5;
const MAX_RATE = 2;

/**
 * Cross-platform FLIP motion for stable teaching tokens. It relies only on Chromium Web
 * Animations and has a no-animation fallback for reduced-motion and test DOMs.
 */
export function createTaskLessonMotionController(
  options: TaskLessonMotionControllerOptions = {},
): TaskLessonMotionController {
  let playbackRate = normalizedRate(options.playbackRate ?? 1);
  const reducedMotionQuery =
    options.reducedMotion === undefined
      ? (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)") ?? null)
      : null;
  let reducedMotion = options.reducedMotion ?? reducedMotionQuery?.matches === true;
  let destroyed = false;
  let paused = false;
  const animations = new Map<HTMLElement, Animation>();

  const cancel = (): void => {
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
  };

  const cancelElementAnimation = (element: HTMLElement): void => {
    const animation = animations.get(element);
    if (animation === undefined) return;
    animation.cancel();
    animations.delete(element);
  };

  const trackAnimation = (
    element: HTMLElement,
    animation: Animation,
    pending: Promise<unknown>[],
  ): void => {
    animation.playbackRate = playbackRate;
    if (paused) animation.pause();
    animations.set(element, animation);
    pending.push(
      animation.finished
        .catch(() => undefined)
        .finally(() => {
          if (animations.get(element) === animation) animations.delete(element);
        }),
    );
  };

  const setReducedMotion = (nextReducedMotion: boolean): void => {
    if (destroyed || reducedMotion === nextReducedMotion) return;
    reducedMotion = nextReducedMotion;
    if (reducedMotion) cancel();
  };

  const onReducedMotionChange = (event: MediaQueryListEvent): void => {
    if (destroyed || options.reducedMotion !== undefined) return;
    setReducedMotion(event.matches);
  };
  const removeReducedMotionListener = subscribeToReducedMotion(
    reducedMotionQuery,
    onReducedMotionChange,
  );

  return Object.freeze({
    get playbackRate(): number {
      return playbackRate;
    },
    get reducedMotion(): boolean {
      return reducedMotion;
    },
    capture(elements: Iterable<HTMLElement>): TaskLessonMotionLayout {
      const result = new Map<string, TaskLessonMotionPoint>();
      if (destroyed) return result;
      for (const element of elements) {
        const id = element.dataset.teachingTokenId;
        if (id === undefined || id.length === 0) continue;
        const rectangle = element.getBoundingClientRect?.();
        // A hidden teaching token reports an origin-like 0×0 rectangle. Persisting that as a
        // FLIP start makes a newly revealed stack frame fly in from the page origin.
        if (rectangle === undefined || rectangle.width <= 0 || rectangle.height <= 0) continue;
        result.set(id, Object.freeze({ left: rectangle.left, top: rectangle.top }));
      }
      return result;
    },
    async animateFrom(
      previous: TaskLessonMotionLayout,
      elements: Iterable<HTMLElement>,
      kind: TaskLessonMotionKind,
    ): Promise<void> {
      if (destroyed) return;
      const pending: Promise<unknown>[] = [];
      for (const element of elements) {
        const id = element.dataset.teachingTokenId;
        const before = id === undefined ? undefined : previous.get(id);
        /*
         * The previous layout is captured from getBoundingClientRect(), so it represents the
         * presentation position even when an older WAAPI animation is half-finished. Cancel the
         * older animation only after that capture and only for this element. The replacement FLIP
         * animation then starts at the same on-screen point instead of jumping through an old
         * logical target. Unrelated tokens keep moving.
         */
        cancelElementAnimation(element);
        if (reducedMotion || typeof element.animate !== "function") {
          continue;
        }
        const after = element.getBoundingClientRect();
        if (after.width <= 0 || after.height <= 0) continue;
        if (before === undefined) {
          // Keep newly revealed state readable when playback is paused mid-transition.
          const animation = element.animate([{ opacity: 0.35 }, { opacity: 1 }], {
            duration: MOTION_DURATIONS.settle,
            easing: EASING,
            fill: "none",
          });
          trackAnimation(element, animation, pending);
          continue;
        }
        const deltaX = before.left - after.left;
        const deltaY = before.top - after.top;
        const moved = Math.abs(deltaX) >= 0.5 || Math.abs(deltaY) >= 0.5;
        const emphasizeComparison = kind === "compare" && element.dataset.state === "active";
        const settleOpacity = kind === "settle" && element.dataset.state === "sorted";
        if (!moved && !emphasizeComparison && !settleOpacity) continue;
        const keyframes: Keyframe[] = moved
          ? [
              { transform: `translate(${String(deltaX)}px, ${String(deltaY)}px)` },
              { transform: "translate(0, 0)" },
            ]
          : [{ opacity: emphasizeComparison ? 0.58 : 0.76 }, { opacity: 1 }];
        const animation = element.animate(keyframes, {
          duration: MOTION_DURATIONS[kind],
          easing: EASING,
          fill: "none",
        });
        trackAnimation(element, animation, pending);
      }
      await Promise.all(pending);
    },
    async animatePresence(
      elements: Iterable<HTMLElement>,
      kind: TaskLessonMotionKind,
      presence: TaskLessonMotionPresence,
      displacement: TaskLessonMotionPoint = { left: 0, top: -12 },
    ): Promise<void> {
      if (destroyed) return;
      const pending: Promise<unknown>[] = [];
      for (const element of elements) {
        const activeAnimation = animations.get(element);
        const hadActiveAnimation = activeAnimation !== undefined;
        const presentationRectangle = element.getBoundingClientRect();
        const presentationOpacity = readPresentationOpacity(element);

        // Read the presentation state first. Cancelling before this read would snap an interrupted
        // token back to its logical position and make a reversed push/pop visibly jump.
        cancelElementAnimation(element);
        if (reducedMotion || typeof element.animate !== "function") continue;

        const logicalRectangle = element.getBoundingClientRect();
        if (logicalRectangle.width <= 0 || logicalRectangle.height <= 0) continue;
        const currentX = presentationRectangle.left - logicalRectangle.left;
        const currentY = presentationRectangle.top - logicalRectangle.top;
        const startsAtRest = !hadActiveAnimation;
        const startX = presence === "enter" && startsAtRest ? displacement.left : currentX;
        const startY = presence === "enter" && startsAtRest ? displacement.top : currentY;
        const startOpacity = presence === "enter" && startsAtRest ? 0 : presentationOpacity;
        const targetX = presence === "enter" ? 0 : displacement.left;
        const targetY = presence === "enter" ? 0 : displacement.top;
        const targetOpacity = presence === "enter" ? 1 : 0;
        const animation = element.animate(
          [
            {
              transform: translate(startX, startY),
              opacity: startOpacity,
            },
            {
              transform: translate(targetX, targetY),
              opacity: targetOpacity,
            },
          ],
          {
            duration: MOTION_DURATIONS[kind],
            easing: EASING,
            fill: "none",
          },
        );
        trackAnimation(element, animation, pending);
      }
      await Promise.all(pending);
    },
    setReducedMotion,
    setRate(rate: number): void {
      playbackRate = normalizedRate(rate);
      for (const animation of animations.values()) animation.playbackRate = playbackRate;
    },
    pause(): void {
      paused = true;
      for (const animation of animations.values()) animation.pause();
    },
    play(): void {
      paused = false;
      for (const animation of animations.values()) animation.play();
    },
    finish(): void {
      for (const animation of animations.values()) animation.finish();
      animations.clear();
    },
    cancel,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      removeReducedMotionListener();
      cancel();
    },
  });
}

function translate(x: number, y: number): string {
  return `translate(${String(x)}px, ${String(y)}px)`;
}

function readPresentationOpacity(element: HTMLElement): number {
  const value = element.ownerDocument?.defaultView?.getComputedStyle(element).opacity;
  if (value === undefined) return 1;
  const opacity = Number.parseFloat(value);
  return Number.isFinite(opacity) ? opacity : 1;
}

function normalizedRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) {
    throw new RangeError(`教学动画速率必须在 ${String(MIN_RATE)} 到 ${String(MAX_RATE)} 之间`);
  }
  return rate;
}

function subscribeToReducedMotion(
  query: MediaQueryList | null,
  listener: (event: MediaQueryListEvent) => void,
): () => void {
  if (query === null) return () => undefined;
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }
  if (typeof query.addListener === "function") {
    query.addListener(listener);
    return () => query.removeListener(listener);
  }
  return () => undefined;
}
