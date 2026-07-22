import { describe, expect, it, vi } from "vitest";
import {
  createTaskLessonMotionController,
  MIN_TASK_LESSON_PLAYBACK_STEP_MS,
  readableTaskLessonSemanticDuration,
} from "../../src/ui/task-lesson-motion.js";

describe("task lesson motion controller", () => {
  it("pads short semantic events to remain readable at the fastest playback rate", () => {
    const semanticDuration = readableTaskLessonSemanticDuration(180, 1.5);

    expect(semanticDuration).toBe(MIN_TASK_LESSON_PLAYBACK_STEP_MS * 1.5);
    expect(semanticDuration / 1.5).toBe(MIN_TASK_LESSON_PLAYBACK_STEP_MS);
    expect(readableTaskLessonSemanticDuration(2_000, 1.5)).toBe(2_000);
    expect(() => readableTaskLessonSemanticDuration(-1, 1)).toThrow(/非负/u);
  });

  it("animates stable token identity with the semantic duration and current rate", async () => {
    const element = new FakeElement("token-1", 10, 20);
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    const before = controller.capture([element as unknown as HTMLElement]);
    element.left = 110;
    element.top = 50;

    controller.setRate(1.5);
    await controller.animateFrom(before, [element as unknown as HTMLElement], "shift");

    expect(element.animate).toHaveBeenCalledWith(
      [{ transform: "translate(-100px, -30px)" }, { transform: "translate(0, 0)" }],
      expect.objectContaining({ duration: 280, fill: "none" }),
    );
    expect(element.animation.playbackRate).toBe(1.5);
  });

  it("keeps the final state without spatial animation under reduced motion", async () => {
    const element = new FakeElement("token-1", 0, 0);
    const controller = createTaskLessonMotionController({ reducedMotion: true });
    const before = controller.capture([element as unknown as HTMLElement]);
    element.left = 50;

    await controller.animateFrom(before, [element as unknown as HTMLElement], "insert");

    expect(element.animate).not.toHaveBeenCalled();
    expect(controller.reducedMotion).toBe(true);
  });

  it("maps the operating-system reduced-motion preference without platform APIs", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    try {
      const controller = createTaskLessonMotionController();
      expect(controller.reducedMotion).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reacts to operating-system preference changes and removes the listener on destroy", async () => {
    const media = fakeReducedMotionQuery(false);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media.query),
    );
    try {
      const element = new FakeElement("token-1", 0, 0);
      const controller = createTaskLessonMotionController();
      const before = controller.capture([element as unknown as HTMLElement]);
      element.left = 40;
      const pending = controller.animateFrom(before, [element as unknown as HTMLElement], "shift");

      media.setMatches(true);
      expect(controller.reducedMotion).toBe(true);
      expect(element.animation.cancel).toHaveBeenCalledOnce();
      await pending;

      const animateCalls = element.animate.mock.calls.length;
      element.left = 80;
      await controller.animateFrom(before, [element as unknown as HTMLElement], "insert");
      expect(element.animate).toHaveBeenCalledTimes(animateCalls);

      media.setMatches(false);
      expect(controller.reducedMotion).toBe(false);
      controller.destroy();
      expect(media.removeEventListener).toHaveBeenCalledOnce();
      media.setMatches(true);
      expect(controller.reducedMotion).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps an explicit reduced-motion option independent from system changes", () => {
    const media = fakeReducedMotionQuery(true);
    const matchMedia = vi.fn(() => media.query);
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      const controller = createTaskLessonMotionController({ reducedMotion: false });
      expect(controller.reducedMotion).toBe(false);
      expect(matchMedia).not.toHaveBeenCalled();
      expect(media.addEventListener).not.toHaveBeenCalled();
      media.setMatches(true);
      expect(controller.reducedMotion).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("lets the owning stage update reduced motion and cancels in-flight animations", async () => {
    const element = new FakeElement("token-1", 0, 0);
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    const before = controller.capture([element as unknown as HTMLElement]);
    element.left = 48;
    const pending = controller.animateFrom(before, [element as unknown as HTMLElement], "shift");

    controller.setReducedMotion(true);
    expect(controller.reducedMotion).toBe(true);
    expect(element.animation.cancel).toHaveBeenCalledOnce();
    await pending;

    const callsWhileReduced = element.animate.mock.calls.length;
    element.left = 96;
    await controller.animateFrom(before, [element as unknown as HTMLElement], "insert");
    expect(element.animate).toHaveBeenCalledTimes(callsWhileReduced);

    controller.setReducedMotion(false);
    expect(controller.reducedMotion).toBe(false);
    await controller.animateFrom(before, [element as unknown as HTMLElement], "insert");
    expect(element.animate).toHaveBeenCalledTimes(callsWhileReduced + 1);
  });

  it("uses the same spatial path in reverse for token entry and exit", async () => {
    const entering = new FakeElement("entering", 20, 30);
    const exiting = new FakeElement("exiting", 20, 30);
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    const displacement = { left: -8, top: -20 };

    await controller.animatePresence(
      [entering as unknown as HTMLElement],
      "shift",
      "enter",
      displacement,
    );
    await controller.animatePresence(
      [exiting as unknown as HTMLElement],
      "shift",
      "exit",
      displacement,
    );

    expect(entering.animate).toHaveBeenCalledWith(
      [
        { transform: "translate(-8px, -20px)", opacity: 0 },
        { transform: "translate(0px, 0px)", opacity: 1 },
      ],
      expect.objectContaining({ duration: 280, fill: "none" }),
    );
    expect(exiting.animate).toHaveBeenCalledWith(
      [
        { transform: "translate(0px, 0px)", opacity: 1 },
        { transform: "translate(-8px, -20px)", opacity: 0 },
      ],
      expect.objectContaining({ duration: 280, fill: "none" }),
    );
  });

  it("reverses an interrupted presence animation from its presentation position", async () => {
    const element = new FakeElement("stack-frame", 0, 0);
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    const exiting = controller.animatePresence(
      [element as unknown as HTMLElement],
      "shift",
      "exit",
      { left: 0, top: -20 },
    );

    // The token is seven pixels into its exit when the learner steps back.
    element.top = -7;
    element.resetPositionOnCancel = { left: 0, top: 0 };
    const entering = controller.animatePresence(
      [element as unknown as HTMLElement],
      "shift",
      "enter",
      { left: 0, top: -20 },
    );

    expect(element.animations[0]!.cancel).toHaveBeenCalledOnce();
    expect(element.animate).toHaveBeenLastCalledWith(
      [
        { transform: "translate(0px, -7px)", opacity: 1 },
        { transform: "translate(0px, 0px)", opacity: 1 },
      ],
      expect.objectContaining({ duration: 280 }),
    );
    await Promise.all([exiting, entering]);
  });

  it("does not spatially animate presence changes under reduced motion", async () => {
    const element = new FakeElement("token-1", 0, 0);
    const controller = createTaskLessonMotionController({ reducedMotion: true });

    await controller.animatePresence([element as unknown as HTMLElement], "shift", "exit");

    expect(element.animate).not.toHaveBeenCalled();
  });

  it("uses a short opacity cue when a comparison changes meaning without moving tokens", async () => {
    const element = new FakeElement("token-1", 10, 20);
    element.dataset.state = "active";
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    const before = controller.capture([element as unknown as HTMLElement]);

    await controller.animateFrom(before, [element as unknown as HTMLElement], "compare");

    expect(element.animate).toHaveBeenCalledWith(
      [{ opacity: 0.58 }, { opacity: 1 }],
      expect.objectContaining({ duration: 180, fill: "none" }),
    );
  });

  it("controls active animations and rejects unsupported rates", async () => {
    const element = new FakeElement("token-1", 0, 0);
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    const before = controller.capture([element as unknown as HTMLElement]);
    element.left = 20;
    const pending = controller.animateFrom(before, [element as unknown as HTMLElement], "settle");

    controller.pause();
    controller.play();
    controller.finish();
    await pending;

    expect(element.animation.pause).toHaveBeenCalledOnce();
    expect(element.animation.play).toHaveBeenCalledOnce();
    expect(element.animation.finish).toHaveBeenCalledOnce();
    expect(() => controller.setRate(0.25)).toThrow(/0\.5/u);
    expect(() => controller.setRate(Number.NaN)).toThrow(/动画速率/u);
  });

  it("retargets a moving token from its captured presentation position", async () => {
    const element = new FakeElement("token-1", 0, 0);
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    const firstLayout = controller.capture([element as unknown as HTMLElement]);
    element.left = 100;
    const first = controller.animateFrom(firstLayout, [element as unknown as HTMLElement], "shift");

    // Simulate the token being interrupted 40px into its first transition.
    element.left = 40;
    const presentationLayout = controller.capture([element as unknown as HTMLElement]);
    element.left = 160;
    const second = controller.animateFrom(
      presentationLayout,
      [element as unknown as HTMLElement],
      "insert",
    );

    expect(element.animations[0]!.cancel).toHaveBeenCalledOnce();
    expect(element.animate).toHaveBeenLastCalledWith(
      [{ transform: "translate(-120px, 0px)" }, { transform: "translate(0, 0)" }],
      expect.objectContaining({ duration: 320 }),
    );
    await Promise.all([first, second]);
  });

  it("keeps newly retargeted motion paused until playback resumes", async () => {
    const element = new FakeElement("token-1", 0, 0);
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    controller.pause();
    const before = controller.capture([element as unknown as HTMLElement]);
    element.left = 32;

    const pending = controller.animateFrom(before, [element as unknown as HTMLElement], "shift");

    expect(element.animation.pause).toHaveBeenCalledOnce();
    controller.play();
    expect(element.animation.play).toHaveBeenCalledOnce();
    await pending;
  });

  it("does not treat a hidden zero-size token as a FLIP origin", async () => {
    const element = new FakeElement("stack-frame", 0, 0);
    element.width = 0;
    element.height = 0;
    const controller = createTaskLessonMotionController({ reducedMotion: false });
    const hiddenLayout = controller.capture([element as unknown as HTMLElement]);
    expect(hiddenLayout.has("stack-frame")).toBe(false);

    element.width = 80;
    element.height = 28;
    element.left = 240;
    element.top = 120;
    await controller.animateFrom(hiddenLayout, [element as unknown as HTMLElement], "shift");

    expect(element.animate).toHaveBeenCalledWith(
      [{ opacity: 0.35 }, { opacity: 1 }],
      expect.objectContaining({ duration: 180, fill: "none" }),
    );
  });
});

class FakeElement {
  readonly dataset: DOMStringMap;
  readonly animations: ReturnType<typeof fakeAnimation>[] = [];
  readonly animate = vi.fn(() => {
    const animation = fakeAnimation(() => {
      if (this.resetPositionOnCancel === null) return;
      this.left = this.resetPositionOnCancel.left;
      this.top = this.resetPositionOnCancel.top;
      this.resetPositionOnCancel = null;
    });
    this.animations.push(animation);
    return animation as unknown as Animation;
  });
  left: number;
  top: number;
  width = 40;
  height = 40;
  resetPositionOnCancel: { left: number; top: number } | null = null;

  constructor(id: string, left: number, top: number) {
    this.dataset = { teachingTokenId: id } as DOMStringMap;
    this.left = left;
    this.top = top;
  }

  get animation(): ReturnType<typeof fakeAnimation> {
    return this.animations.at(-1) ?? fakeAnimation();
  }

  getBoundingClientRect(): DOMRect {
    return {
      left: this.left,
      top: this.top,
      right: this.left + this.width,
      bottom: this.top + this.height,
      width: this.width,
      height: this.height,
      x: this.left,
      y: this.top,
      toJSON: () => ({}),
    };
  }
}

function fakeAnimation(onCancel: () => void = () => undefined) {
  return {
    playbackRate: 1,
    finished: Promise.resolve(),
    cancel: vi.fn(onCancel),
    pause: vi.fn(),
    play: vi.fn(),
    finish: vi.fn(),
  };
}

function fakeReducedMotionQuery(initialMatches: boolean) {
  let listener: ((event: MediaQueryListEvent) => void) | null = null;
  const query = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: string, next: (event: MediaQueryListEvent) => void) => {
      listener = next;
    }),
    removeEventListener: vi.fn((_type: string, next: (event: MediaQueryListEvent) => void) => {
      if (listener === next) listener = null;
    }),
  } as unknown as MediaQueryList;
  return {
    query,
    addEventListener: query.addEventListener as ReturnType<typeof vi.fn>,
    removeEventListener: query.removeEventListener as ReturnType<typeof vi.fn>,
    setMatches(matches: boolean): void {
      (query as unknown as { matches: boolean }).matches = matches;
      listener?.({ matches } as MediaQueryListEvent);
    },
  };
}
