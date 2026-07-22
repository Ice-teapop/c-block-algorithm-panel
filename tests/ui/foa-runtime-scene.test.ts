import { describe, expect, it, vi } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import {
  defaultFoaInteractiveRun,
  evaluateFoaInteractiveInput,
  getFoaInteractiveInputDefinition,
} from "../../src/tutorials/foa-interactive-inputs.js";
import { createFoaRuntimeModel } from "../../src/tutorials/foa-runtime-frames.js";
import { getFoaSceneProfile } from "../../src/tutorials/foa-scene-profiles.js";
import { createFoaRuntimeScene } from "../../src/ui/foa-runtime-scene.js";

const REPRESENTATIVE_SCENES = [
  {
    order: 1,
    visualFamily: "execution",
    layout: "evidence",
    region: "foa-runtime-scene__evidence",
  },
  { order: 17, visualFamily: "decision", layout: "branch", region: "foa-runtime-scene__branch" },
  { order: 23, visualFamily: "loop", layout: "loop", region: null },
  { order: 28, visualFamily: "search", layout: "sequence", region: null },
  {
    order: 32,
    visualFamily: "call-stack",
    layout: "stack",
    region: "foa-runtime-scene__stack",
  },
  {
    order: 48,
    visualFamily: "pointer-graph",
    layout: "memory",
    region: "foa-runtime-scene__memory",
  },
  {
    order: 38,
    visualFamily: "evidence",
    layout: "evidence",
    region: "foa-runtime-scene__evidence",
  },
] as const;

describe("FOA runtime scene", () => {
  it("renders mechanism-specific runtime evidence for representative lesson families", () => {
    for (const expected of REPRESENTATIVE_SCENES) {
      const document = new FakeDocument();
      const lesson = FOA_LESSONS[expected.order - 1]!;
      const profile = getFoaSceneProfile(lesson);
      const model = createFoaRuntimeModel(lesson, profile, null);
      const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
        locale: "zh",
        reducedMotion: false,
        onAttempt: vi.fn(),
      });
      const root = scene.root as unknown as FakeElement;
      const mechanism = elementByClass(root, "foa-runtime-scene__mechanism");

      expect(root.dataset.sceneKind, `lesson ${String(expected.order)} scene kind`).toBe(
        profile.kind,
      );
      expect(mechanism.dataset.visualFamily).toBe(expected.visualFamily);
      expect(mechanism.dataset.layout).toBe(expected.layout);
      expect(mechanism.dataset.mechanismId).toBe(profile.mechanismId);
      expect(mechanism.dataset.observableKind).toBe(profile.observableKind);
      expect(mechanism.dataset.learnerControl).toBe(profile.learnerControl);
      expect(root.textContent).toContain(profile.caseGoal.zh);
      for (const label of profile.observableLabels) expect(root.textContent).toContain(label.zh);
      expect(elementsByClass(root, "foa-semantic-scene__node")).toHaveLength(4);
      expect(elementsByClass(root, "foa-runtime-scene__history-item")).toHaveLength(4);
      expect(elementsByClass(root, "foa-runtime-scene__value").length).toBeGreaterThanOrEqual(
        model.frames[0]!.values.length,
      );
      expect(elementByClass(root, "foa-runtime-scene__relation").dataset.actionKind).toBe(
        model.frames[0]!.actionKind,
      );

      if (expected.region !== null) {
        expect(elementByClass(root, expected.region).hidden).toBe(false);
      }
    }
  });

  it("advances evidence without remounting values and reveals output only on completion", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[27]!;
    const profile = getFoaSceneProfile(lesson);
    const model = createFoaRuntimeModel(lesson, profile, null);
    const attempts = vi.fn();
    const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
      locale: "zh",
      reducedMotion: false,
      onAttempt: attempts,
    });
    const root = scene.root as unknown as FakeElement;
    const firstValueElements = new Map(
      elementsByClass(root, "foa-runtime-scene__value-choice").map((element) => [
        element.dataset.valueId!,
        element,
      ]),
    );
    const action = elementByClass(root, "foa-runtime-scene__action-target");
    const output = channelValues(root)[1]!;

    expect(action.hidden).toBe(true);
    const visibleValueChoices = elementsByClass(root, "foa-runtime-scene__value-choice").filter(
      (value) => !value.hidden,
    );
    const firstIncompatibleValue = visibleValueChoices.find(
      (value) => value.dataset.compatible === "false",
    );
    const firstCompatibleValue = visibleValueChoices.find(
      (value) => value.dataset.compatible === "true",
    );
    expect(firstIncompatibleValue).toBeDefined();
    expect(firstCompatibleValue?.textContent).not.toContain("—");
    firstIncompatibleValue!.emit("click");
    expect(attempts).toHaveBeenLastCalledWith(lesson.semanticEvents[1]!.id);
    expect(root.dataset.confirmedCount).toBe("0");
    attempts.mockClear();
    expect(firstCompatibleValue).toBeDefined();
    firstCompatibleValue!.emit("click");
    expect(attempts).toHaveBeenCalledWith(lesson.semanticEvents[0]!.id);

    for (let index = 0; index < model.frames.length; index += 1) {
      scene.setState({
        displayIndex: index,
        confirmedCount: index,
        previewing: false,
        completed: false,
        runtimeState: index === 0 ? "ready" : "running",
      });

      expect(root.dataset.currentEventId).toBe(model.frames[index]!.eventId);
      expect(visibleElementsByClass(root, "foa-runtime-scene__history-item")).toHaveLength(
        index + 1,
      );
      expect(elementByClass(root, "foa-runtime-scene__frame-title").textContent).toBe(
        model.frames[index]!.label.zh,
      );
      expect(elementByClass(root, "foa-runtime-scene__relation").dataset.actionKind).toBe(
        model.frames[index]!.actionKind,
      );
      expect(output.textContent).toBe("完成后显示");

      for (const [valueId, firstElement] of firstValueElements) {
        const current = elementsByClass(root, "foa-runtime-scene__value").find(
          (element) => element.dataset.valueId === valueId,
        );
        expect(current, `stable value element ${valueId}`).toBe(firstElement);
      }
    }

    scene.setState({
      displayIndex: 3,
      confirmedCount: 4,
      previewing: false,
      completed: true,
      runtimeState: "completed",
    });
    expect(output.textContent).toBe(model.stdout.trim());
    expect(root.dataset.completed).toBe("true");
    expect(
      elementsByClass(root, "foa-semantic-scene__node").every(
        (node) => node.dataset.state === "done",
      ),
    ).toBe(true);

    scene.setLocale("en");
    expect(root.textContent).toContain("Execution path");
    expect(root.textContent).toContain(model.frames[3]!.detail.en);
    expect(root.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("animates stable value relations and uses an opacity-only reduced-motion fallback", async () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[0]!;
    const profile = getFoaSceneProfile(lesson);
    const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
      locale: "en",
      reducedMotion: false,
      onAttempt: vi.fn(),
    });
    const root = scene.root as unknown as FakeElement;
    const mechanism = elementByClass(root, "foa-runtime-scene__mechanism");
    const movingToken = elementByClass(root, "foa-runtime-scene__moving-token");
    const values = elementsByClass(root, "foa-runtime-scene__value");
    mechanism.setRect({ left: 0, top: 0, width: 720, height: 320 });
    values.forEach((value, index) => {
      value.setRect({ left: 40 + index * 80, top: 120, width: 64, height: 36 });
    });

    const transition = scene.animateAdvance(0, 1);

    expect(transition).not.toBeNull();
    expect(root.dataset.transitioning).toBe("true");
    expect(root.dataset.transitionMode).toBe("execute");
    expect(movingToken.hidden).toBe(false);
    expect(movingToken.animationCalls).toHaveLength(1);
    expect(
      movingToken.animationCalls[0]!.keyframes.some(
        (keyframe) => typeof keyframe.transform === "string" && keyframe.transform.includes("px"),
      ),
    ).toBe(true);

    await transition;
    expect(root.dataset.transitioning).toBeUndefined();
    expect(movingToken.hidden).toBe(true);

    scene.setReducedMotion(true);
    const action = elementByClass(root, "foa-runtime-scene__action-target");
    const reducedTransition = scene.animatePreviewAdvance(1, 2);

    expect(reducedTransition).not.toBeNull();
    expect(root.dataset.reducedMotion).toBe("true");
    expect(root.dataset.transitionMode).toBe("preview");
    expect(movingToken.hidden).toBe(true);
    expect(action.animationCalls).toHaveLength(1);
    expect(action.animationCalls[0]!.options?.duration).toBe(160);
    expect(
      action.animationCalls[0]!.keyframes.every((keyframe) => keyframe.transform === undefined),
    ).toBe(true);

    await reducedTransition;
    expect(root.dataset.transitioning).toBeUndefined();
  });

  it("renders course 33 as three stable contract stations with four authored motion routes", async () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[32]!;
    const profile = getFoaSceneProfile(lesson);
    const attempts = vi.fn();
    const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
      locale: "en",
      reducedMotion: false,
      onAttempt: attempts,
    });
    const root = scene.root as unknown as FakeElement;
    const contract = elementByClass(root, "foa-signature-contract");
    const stations = elementsByClass(contract, "foa-signature-contract__station");
    const routes = elementsByClass(contract, "foa-signature-contract__route");
    const initialPrototype = stations.find((station) => station.dataset.stationId === "prototype");

    expect(contract.dataset.motionBlueprint).toBe("signature-contract-v1");
    expect(stations).toHaveLength(3);
    expect(routes.map((route) => route.dataset.routeId)).toEqual([
      "prototype-call",
      "prototype-call-parameters",
      "prototype-definition",
      "definition-return",
    ]);
    expect(routes[0]!.dataset.state).toBe("active");

    const firstSource = elementsByClass(contract, "foa-signature-contract__port").find(
      (port) => port.dataset.compatible === "true",
    );
    expect(firstSource).toBeDefined();
    firstSource!.emit("click");
    expect(attempts).toHaveBeenLastCalledWith(lesson.semanticEvents[0]!.id);

    scene.setState({
      displayIndex: 1,
      confirmedCount: 1,
      previewing: false,
      completed: false,
      runtimeState: "running",
    });
    expect(stations.find((station) => station.dataset.stationId === "prototype")).toBe(
      initialPrototype,
    );
    expect(routes[0]!.dataset.state).toBe("done");
    expect(routes[1]!.dataset.state).toBe("active");
    const secondSource = elementsByClass(contract, "foa-signature-contract__port").find(
      (port) => port.dataset.compatible === "true",
    );
    secondSource!.emit("click");
    expect(attempts).toHaveBeenLastCalledWith(lesson.semanticEvents[1]!.id);

    const transition = scene.animateAdvance(1, 2);
    expect(transition).not.toBeNull();
    expect(routes[1]!.animationCalls).toHaveLength(1);
    expect(routes[1]!.animationCalls[0]!.keyframes).toEqual(
      expect.arrayContaining([expect.objectContaining({ strokeDashoffset: "0" })]),
    );
    await transition;

    scene.setReducedMotion(true);
    const reducedTransition = scene.animatePreviewAdvance(2, 3);
    expect(reducedTransition).not.toBeNull();
    const reducedCall = routes[2]!.animationCalls.at(-1)!;
    expect(reducedCall.options?.duration).toBe(160);
    expect(reducedCall.keyframes.every((keyframe) => keyframe.transform === undefined)).toBe(true);
    await reducedTransition;

    expect(contract.textContent).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("grades true/false choices and blocks every mechanism control during preview", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[13]!;
    const profile = getFoaSceneProfile(lesson);
    const definition = getFoaInteractiveInputDefinition(lesson.order)!;
    const defaultRun = defaultFoaInteractiveRun(definition);
    const authoredChoiceIndex = lesson.semanticEvents.findIndex(
      (event) => event.type === "compare" || event.type === "branch",
    );
    const interactiveRun = Object.freeze({
      ...defaultRun,
      eventDetails: Object.freeze(
        defaultRun.eventDetails.map((detail, index) =>
          index === authoredChoiceIndex ? { zh: "条件成立", en: "Condition is true" } : detail,
        ),
      ),
    });
    const model = createFoaRuntimeModel(lesson, profile, interactiveRun);
    const choiceIndex = model.frames.findIndex((frame) => frame.branchOutcome !== null);
    expect(choiceIndex).toBeGreaterThanOrEqual(0);
    const attempts = vi.fn();
    const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
      locale: "en",
      reducedMotion: true,
      onAttempt: attempts,
    });
    const root = scene.root as unknown as FakeElement;
    scene.setRuntimeCase?.(interactiveRun);
    scene.setState({
      displayIndex: choiceIndex,
      confirmedCount: choiceIndex,
      previewing: false,
      completed: false,
      runtimeState: "paused",
    });
    const expectedOutcome = String(model.frames[choiceIndex]!.branchOutcome);
    const branchChoices = elementsByClass(root, "foa-runtime-scene__branch-lane").filter(
      (element) => element.dataset.outcome !== undefined,
    );
    const correct = branchChoices.find((choice) => choice.dataset.outcome === expectedOutcome)!;
    const incorrect = branchChoices.find((choice) => choice.dataset.outcome !== expectedOutcome)!;

    expect(correct.tagName).toBe("button");
    incorrect.emit("click");
    expect(attempts).toHaveBeenLastCalledWith(
      lesson.semanticEvents[(choiceIndex + 1) % lesson.semanticEvents.length]!.id,
    );
    expect(root.dataset.confirmedCount).toBe(String(choiceIndex));
    attempts.mockClear();
    correct.focus();
    correct.emit("click");
    expect(document.activeElement).toBe(correct);
    expect(attempts).toHaveBeenCalledWith(lesson.semanticEvents[choiceIndex]!.id);

    attempts.mockClear();
    scene.setState({
      displayIndex: choiceIndex,
      confirmedCount: choiceIndex,
      previewing: true,
      completed: false,
      runtimeState: "running",
    });
    correct.emit("click");
    expect(attempts).not.toHaveBeenCalled();
    expect(root.dataset.confirmedCount).toBe(String(choiceIndex));
    expect(channelValues(root)[1]!.textContent).toBe("Shown on completion");
  });

  it("keeps every learner-supplied array token visible before lesson 52 consumes it", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[51]!;
    const profile = getFoaSceneProfile(lesson);
    const definition = getFoaInteractiveInputDefinition(lesson.order)!;
    const result = evaluateFoaInteractiveInput(definition, {
      count: "3",
      values: "9 2 7",
    });
    if (!result.ok) throw new Error(result.message.en);
    const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
      locale: "en",
      reducedMotion: true,
      onAttempt: vi.fn(),
    });
    const root = scene.root as unknown as FakeElement;

    scene.setRuntimeCase?.(result.run);

    const tokenValues = elementsByClass(root, "foa-runtime-scene__value-choice").map(
      (value) => elementByClass(value, "foa-runtime-scene__value-content").textContent,
    );
    expect(tokenValues).toEqual(["9", "2", "7"]);
    expect(
      elementsByClass(root, "foa-runtime-scene__value-choice").map((value) => value.dataset.state),
    ).toEqual(["active", "known", "known"]);
  });

  it("rebuilds lesson 52 mechanism evidence when the learner changes the input", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[51]!;
    const profile = getFoaSceneProfile(lesson);
    const definition = getFoaInteractiveInputDefinition(lesson.order)!;
    const first = evaluateFoaInteractiveInput(definition, {
      count: "3",
      values: "9 8 7",
    });
    const second = evaluateFoaInteractiveInput(definition, {
      count: "2",
      values: "4 6",
    });
    if (!first.ok || !second.ok) throw new Error("lesson 52 test input is invalid");
    const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
      locale: "en",
      reducedMotion: true,
      onAttempt: vi.fn(),
    });
    const root = scene.root as unknown as FakeElement;

    scene.setRuntimeCase?.(first.run);
    expect(channelValues(root)[0]!.textContent).toContain("3 9 8 7");
    expect(
      elementsByClass(root, "foa-runtime-scene__value-choice").map(
        (value) => elementByClass(value, "foa-runtime-scene__value-content").textContent,
      ),
    ).toEqual(["9", "8", "7"]);

    scene.setRuntimeCase?.(second.run);
    expect(channelValues(root)[0]!.textContent).toContain("2 4 6");
    expect(channelValues(root)[0]!.textContent).not.toContain("9 8 7");
    expect(
      elementsByClass(root, "foa-runtime-scene__value-choice").map(
        (value) => elementByClass(value, "foa-runtime-scene__value-content").textContent,
      ),
    ).toEqual(["4", "6"]);
    expect(root.textContent).not.toContain("9 8 7");
  });

  it("does not leak authored default inputs into the visible model or action after input changes", () => {
    const cases = [
      {
        order: 9,
        values: { value: "77" },
        forbidden: {
          zh: { model: [], action: [/41/u, /abc/iu] },
          en: { model: [], action: [/41/u, /abc/iu] },
        },
      },
      {
        order: 13,
        values: { left: "17", right: "5" },
        forbidden: {
          zh: { model: [/七个/u, /每组三个/u], action: [] },
          en: { model: [/seven tokens/iu, /groups of three/iu], action: [] },
        },
      },
      {
        order: 14,
        values: { left: "8", right: "3" },
        forbidden: {
          zh: { model: [/3、8/u], action: [/3\s*<\s*8/u] },
          en: { model: [/3,\s*8/u], action: [/3\s*<\s*8/u] },
        },
      },
      {
        order: 15,
        values: { value: "-2" },
        forbidden: {
          zh: { model: [], action: [/拖动\s*10/u] },
          en: { model: [], action: [/drag\s*10/iu] },
        },
      },
      {
        order: 18,
        values: { value: "85" },
        forbidden: {
          zh: { model: [], action: [/把\s*74/u] },
          en: { model: [], action: [/place\s*74/iu] },
        },
      },
      {
        order: 19,
        values: { value: "70000" },
        forbidden: {
          zh: { model: [], action: [/60000/u] },
          en: { model: [], action: [/60000/u] },
        },
      },
      {
        order: 20,
        values: { value: "11" },
        forbidden: {
          zh: { model: [], action: [/旋转到\s*2/u] },
          en: { model: [], action: [/rotate to\s*2/iu] },
        },
      },
      {
        order: 21,
        values: { value: "-4" },
        forbidden: {
          zh: { model: [], action: [/count\s*=\s*0/iu] },
          en: { model: [], action: [/count\s*=\s*0/iu] },
        },
      },
      {
        order: 25,
        values: { values: "2 3 -1" },
        forbidden: {
          zh: { model: [/3\s*,\s*4\s*,\s*-1/u], action: [] },
          en: { model: [/3\s*,\s*4\s*,\s*-1/u], action: [] },
        },
      },
      {
        order: 27,
        values: { count: "3", values: "1 5 9" },
        forbidden: {
          zh: { model: [/count\s*=\s*4/iu, /四个输入槽/u], action: [/四个值/u] },
          en: {
            model: [/count\s*=\s*4/iu, /four input slots/iu],
            action: [/four values/iu],
          },
        },
      },
      {
        order: 32,
        values: { value: "9" },
        forbidden: {
          zh: { model: [], action: [/实参\s*6/u] },
          en: { model: [], action: [/argument\s*6/iu] },
        },
      },
      {
        order: 34,
        values: { value: "12" },
        forbidden: {
          zh: { model: [], action: [/把\s*-9/u] },
          en: { model: [], action: [/feed\s*-9/iu] },
        },
      },
      {
        order: 50,
        values: { value: "bad-token" },
        forbidden: {
          zh: { model: [], action: [/\b11\b/u] },
          en: { model: [], action: [/\b11\b/u] },
        },
      },
      {
        order: 52,
        values: { count: "2", values: "4 6" },
        forbidden: {
          zh: { model: [/9\s+8\s+7/u], action: [/9\s+8\s+7/u] },
          en: { model: [/9\s+8\s+7/u], action: [/9\s+8\s+7/u] },
        },
      },
      {
        order: 59,
        values: { value: "6" },
        forbidden: {
          zh: { model: [], action: [/索引\s*3/u] },
          en: { model: [], action: [/index\s*3/iu] },
        },
      },
    ] as const;

    for (const runtimeCase of cases) {
      const document = new FakeDocument();
      const lesson = FOA_LESSONS[runtimeCase.order - 1]!;
      const profile = getFoaSceneProfile(lesson);
      const definition = getFoaInteractiveInputDefinition(runtimeCase.order)!;
      const result = evaluateFoaInteractiveInput(definition, runtimeCase.values);
      if (!result.ok) throw new Error(result.message.en);
      const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
        locale: "zh",
        reducedMotion: true,
        onAttempt: vi.fn(),
      });
      const root = scene.root as unknown as FakeElement;

      scene.setRuntimeCase?.(result.run);
      for (const locale of ["zh", "en"] as const) {
        scene.setLocale(locale);
        const model = elementByClass(root, "foa-runtime-scene__model").textContent;
        const action = elementByClass(root, "foa-runtime-scene__primary-action").textContent;
        for (const pattern of runtimeCase.forbidden[locale].model) {
          expect(model, `lesson ${String(runtimeCase.order)} ${locale} model`).not.toMatch(pattern);
        }
        for (const pattern of runtimeCase.forbidden[locale].action) {
          expect(action, `lesson ${String(runtimeCase.order)} ${locale} action`).not.toMatch(
            pattern,
          );
        }
      }
    }
  });

  it("grades connect versus inspect using the course mechanism contract", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[32]!;
    const profile = getFoaSceneProfile(lesson);
    const attempts = vi.fn();
    const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
      locale: "en",
      reducedMotion: true,
      onAttempt: attempts,
    });
    const root = scene.root as unknown as FakeElement;
    const connect = elementsByClass(root, "foa-runtime-scene__memory-action").find(
      (button) => button.dataset.memoryAction === "connect",
    )!;
    const inspect = elementsByClass(root, "foa-runtime-scene__memory-action").find(
      (button) => button.dataset.memoryAction === "inspect",
    )!;

    expect(profile.learnerControl).toBe("connect");
    inspect.emit("click");
    expect(attempts).toHaveBeenLastCalledWith(lesson.semanticEvents[1]!.id);
    expect(root.dataset.confirmedCount).toBe("0");
    attempts.mockClear();
    connect.emit("click");
    expect(attempts).toHaveBeenCalledWith(lesson.semanticEvents[0]!.id);
  });

  it("requires the authored stack control instead of allowing click-through", () => {
    const document = new FakeDocument();
    const lesson = FOA_LESSONS[31]!;
    const profile = getFoaSceneProfile(lesson);
    const model = createFoaRuntimeModel(lesson, profile, null);
    const attempts = vi.fn();
    const scene = createFoaRuntimeScene(document as unknown as Document, lesson, profile, {
      locale: "en",
      reducedMotion: true,
      onAttempt: attempts,
    });
    const root = scene.root as unknown as FakeElement;
    const pushPopIndex = model.frames.findIndex((frame) => frame.actionKind === "push-pop");

    expect(pushPopIndex).toBeGreaterThanOrEqual(0);
    scene.setState({
      displayIndex: pushPopIndex,
      confirmedCount: pushPopIndex,
      previewing: false,
      completed: false,
      runtimeState: "paused",
    });
    expect(elementByClass(root, "foa-runtime-scene__stack").hidden).toBe(false);
    expect(elementsByClass(root, "foa-runtime-scene__stack-frame").length).toBeGreaterThan(0);
    expect(root.dataset.runState).toBe("paused");

    elementByClass(root, "foa-runtime-scene__mechanism").emit("click");
    expect(attempts).not.toHaveBeenCalled();
    const stackActions = elementsByClass(root, "foa-runtime-scene__stack-action");
    const expectedAction = stackActions.find((button) => button.dataset.compatible === "true");
    const wrongAction = stackActions.find((button) => button.dataset.compatible === "false");
    expect(wrongAction).toBeDefined();
    wrongAction!.emit("click");
    expect(attempts).toHaveBeenLastCalledWith(
      lesson.semanticEvents[(pushPopIndex + 1) % lesson.semanticEvents.length]!.id,
    );
    expect(root.dataset.confirmedCount).toBe(String(pushPopIndex));
    attempts.mockClear();
    expect(expectedAction).toBeDefined();
    expectedAction!.emit("click");
    expect(attempts).toHaveBeenCalledWith(lesson.semanticEvents[pushPopIndex]!.id);
    scene.focusActive();
    expect(document.activeElement).not.toBeNull();
    expect(hasClass(document.activeElement!, "foa-runtime-scene__stack-action")).toBe(true);
  });
});

function channelValues(root: FakeElement): FakeElement[] {
  return walk(root).filter((element) => element.tagName === "dd");
}

function visibleElementsByClass(root: FakeElement, className: string): FakeElement[] {
  return elementsByClass(root, className).filter((element) => !element.hidden);
}

function elementsByClass(root: FakeElement, className: string): FakeElement[] {
  return walk(root).filter((element) => hasClass(element, className));
}

function elementByClass(root: FakeElement, className: string): FakeElement {
  const found = elementsByClass(root, className)[0];
  if (found === undefined) throw new Error(`Missing element with class ${className}`);
  return found;
}

function hasClass(element: FakeElement, className: string): boolean {
  return element.className.split(/\s+/u).includes(className);
}

function walk(root: FakeElement): FakeElement[] {
  return [root, ...root.children.flatMap(walk)];
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  readonly defaultView = {
    requestAnimationFrame: (_callback: FrameRequestCallback) => 1,
    cancelAnimationFrame: (_handle: number) => undefined,
  };

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return this.createElement(tagName);
  }
}

class FakeElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Set<(event: FakeEvent) => void>>();
  readonly animationCalls: Array<{
    keyframes: Keyframe[];
    options: KeyframeAnimationOptions | undefined;
  }> = [];
  readonly classList = {
    add: (...names: string[]) => {
      this.className = [
        ...new Set([...this.className.split(/\s+/u).filter(Boolean), ...names]),
      ].join(" ");
    },
  };
  readonly style: Record<string, string> = {};
  parentElement: FakeElement | null = null;
  className = "";
  id = "";
  title = "";
  hidden = false;
  disabled = false;
  type = "";
  tabIndex = 0;
  readonly isConnected = true;
  scrollLeft = 0;
  scrollTop = 0;
  private rect = makeRect(0, 0, 0, 0);
  private ownText = "";

  constructor(
    readonly ownerDocument: FakeDocument,
    readonly tagName: string,
  ) {}

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
    this.clearChildren();
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.attach(node, this.children.length);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.clearChildren();
    this.append(...nodes);
  }

  removeChild(node: FakeElement): void {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    node.parentElement = null;
  }

  remove(): void {
    this.parentElement?.removeChild(this);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    const event = { type, target: this, currentTarget: this };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  animate(keyframes: Keyframe[], options?: KeyframeAnimationOptions): Animation {
    this.animationCalls.push({ keyframes, options });
    return {
      finished: Promise.resolve(),
      cancel: () => undefined,
      finish: () => undefined,
    } as unknown as Animation;
  }

  get clientWidth(): number {
    return this.rect.width;
  }

  get clientHeight(): number {
    return this.rect.height;
  }

  get scrollWidth(): number {
    return this.rect.width;
  }

  get scrollHeight(): number {
    return this.rect.height;
  }

  setRect(rect: Readonly<{ left: number; top: number; width: number; height: number }>): void {
    this.rect = makeRect(rect.left, rect.top, rect.width, rect.height);
  }

  getBoundingClientRect(): DOMRect {
    return this.rect;
  }

  private attach(node: FakeElement, index: number): void {
    node.parentElement?.removeChild(node);
    node.parentElement = this;
    this.children.splice(index, 0, node);
  }

  private clearChildren(): void {
    for (const child of this.children) child.parentElement = null;
    this.children.splice(0);
  }
}

interface FakeEvent {
  readonly type: string;
  readonly target: FakeElement;
  readonly currentTarget: FakeElement;
}

function makeRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  };
}
