import { describe, expect, it } from "vitest";
import {
  createOnboardingFlow,
  getOnboardingScene,
  ONBOARDING_FLOW_VERSION,
  ONBOARDING_STORAGE_KEY,
  transitionOnboarding,
  type OnboardingLearner,
  type OnboardingState,
  type OnboardingStorage,
} from "../../src/onboarding/flow.js";

const EXPECTED_STEPS = [
  "welcome",
  "dashboard-modules",
  "dashboard-create",
  "dock",
  "import-source",
  "build-presets",
  "free-canvas",
  "node-detail",
  "code-sync",
  "layout-resize",
  "runtime-flow",
  "runtime-metrics",
  "runtime-diagnostics",
  "evidence-mentor",
  "block-lifecycle",
  "library",
] as const;

describe("deterministic onboarding flow v4", () => {
  it("opens with two experience choices and complete visual-target metadata", () => {
    const state = createOnboardingFlow({ storage: new MemoryStorage() }).getState();
    const scene = getOnboardingScene(state);

    expect(state).toMatchObject({ status: "open", completion: null, stepId: "welcome" });
    expect(scene.choices.map(({ id }) => id)).toEqual(["learner-new", "learner-experienced"]);
    expect(scene).toMatchObject({
      pageId: "dashboard",
      targetId: "dashboard",
      placement: "center",
      stepIndex: 1,
      stepCount: EXPECTED_STEPS.length,
      canGoBack: false,
    });
  });

  it("returns the same deeply frozen result for the same state and event", () => {
    const state = createOnboardingFlow({ storage: new MemoryStorage() }).getState();
    const first = transitionOnboarding(state, { type: "choose", choiceId: "learner-new" });
    const second = transitionOnboarding(state, { type: "choose", choiceId: "learner-new" });

    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.history)).toBe(true);
    expect(Object.isFrozen(first.history[0])).toBe(true);
    expect(Object.isFrozen(getOnboardingScene(first))).toBe(true);
  });

  it.each(["new", "experienced"] as const)(
    "takes %s learners through every mainstream feature in the same order",
    (learner) => {
      const states = walkthrough(learner);
      expect(states.map(({ stepId }) => stepId)).toEqual(EXPECTED_STEPS);
      expect(states.map((state) => getOnboardingScene(state).stepIndex)).toEqual(
        EXPECTED_STEPS.map((_, index) => index + 1),
      );
      expect(states.every((state) => getOnboardingScene(state).stepCount === states.length)).toBe(
        true,
      );
    },
  );

  it("covers Dashboard, four-root Dock, free canvas, evidence panels and Library", () => {
    const scenes = walkthrough("new").map(getOnboardingScene);

    expect(scenes.map(({ pageId, targetId }) => `${pageId}:${targetId}`)).toEqual([
      "dashboard:dashboard",
      "dashboard:dashboard-modules",
      "dashboard:create-entry",
      "dashboard:dock-panels-branches",
      "dashboard:import-actions",
      "build:preset-blocks",
      "build:assembly-canvas",
      "build:node-detail",
      "build:code-pane",
      "build:layout-resize",
      "build:runtime-flow",
      "build:runtime-metrics",
      "build:runtime-diagnostics",
      "build:mentor-hints",
      "block-library:block-library-lifecycle",
      "software-library:software-library-content",
    ]);
    const dialogue = scenes.map(({ dialogue }) => dialogue).join("\n");
    expect(dialogue).toMatch(/项目、沙箱、测试/u);
    expect(dialogue).toMatch(/自动保存/u);
    expect(dialogue).toMatch(/文件选择、磁盘拖放或粘贴/u);
    expect(dialogue).toMatch(/预制积木/u);
    expect(dialogue).toMatch(/自由节点画布/u);
    expect(dialogue).toMatch(/浮动详情窗/u);
    expect(dialogue).toMatch(/raw\/partial/u);
    expect(dialogue).toMatch(/flow-view\.json/u);
    expect(dialogue).toMatch(/教学模拟/u);
    expect(dialogue).toMatch(/同源码、同案例和同工具链/u);
    expect(dialogue).toMatch(/编译错误、资源限制/u);
    expect(dialogue).toMatch(/不联网/u);
    expect(dialogue).toMatch(/弃用、恢复与退休/u);
    expect(dialogue).toMatch(/完整软件手册/u);
  });

  it("supports next, choice, back and rejects choices outside the current scene", () => {
    const flow = createOnboardingFlow({ storage: new MemoryStorage() });
    flow.choose("learner-new");
    const modules = flow.getState();
    expect(flow.next().stepId).toBe("dashboard-create");
    expect(flow.back()).toEqual(modules);
    expect(flow.choose("next").stepId).toBe("dashboard-create");
    expect(() => flow.choose("finish")).toThrow(/不支持选择/u);
  });

  it("can skip from every scene", () => {
    for (const state of walkthrough("new")) {
      expect(transitionOnboarding(state, { type: "skip" })).toMatchObject({
        status: "closed",
        completion: "skipped",
      });
    }
  });

  it("persists skip and completion, while reopen starts a fresh tour", () => {
    const skippedStorage = new MemoryStorage();
    const skipped = createOnboardingFlow({ storage: skippedStorage });
    skipped.choose("learner-new");
    skipped.next();
    expect(skipped.skip()).toMatchObject({ status: "closed", completion: "skipped" });
    expect(createOnboardingFlow({ storage: skippedStorage }).getState().status).toBe("closed");
    expect(skipped.reopen()).toMatchObject({
      status: "open",
      stepId: "welcome",
      history: [],
    });

    const completedStorage = new MemoryStorage();
    const completed = createOnboardingFlow({ storage: completedStorage });
    completed.choose("learner-experienced");
    while (completed.getState().stepId !== "library") completed.next();
    completed.choose("finish");
    expect(completed.getState()).toMatchObject({ status: "closed", completion: "completed" });
    expect(createOnboardingFlow({ storage: completedStorage }).getState().status).toBe("closed");
  });

  it("resets stale versions, corrupt and unavailable storage safely", () => {
    const corrupt = new MemoryStorage("{not-json");
    expect(createOnboardingFlow({ storage: corrupt }).getState().status).toBe("open");
    expect(corrupt.removed).toBe(1);

    const stale = new MemoryStorage(JSON.stringify({ version: 1, completion: "completed" }));
    expect(createOnboardingFlow({ storage: stale }).getState().status).toBe("open");
    expect(stale.removed).toBe(1);

    const unavailable: OnboardingStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const flow = createOnboardingFlow({ storage: unavailable });
    expect(() => flow.skip()).not.toThrow();
  });
});

function walkthrough(learner: OnboardingLearner): readonly OnboardingState[] {
  const flow = createOnboardingFlow({ storage: new MemoryStorage() });
  const states: OnboardingState[] = [flow.getState()];
  flow.choose(learner === "new" ? "learner-new" : "learner-experienced");
  states.push(flow.getState());
  while (flow.getState().stepId !== "library") {
    flow.next();
    states.push(flow.getState());
  }
  return states;
}

class MemoryStorage implements OnboardingStorage {
  readonly values = new Map<string, string>();
  removed = 0;

  constructor(initial?: string) {
    if (initial !== undefined) this.values.set(ONBOARDING_STORAGE_KEY, initial);
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.removed += 1;
    this.values.delete(key);
  }
}
