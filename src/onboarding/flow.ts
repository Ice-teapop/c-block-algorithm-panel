export const ONBOARDING_FLOW_VERSION = 4;
export const ONBOARDING_STORAGE_KEY = "c-block-algorithm-panel.onboarding";

export type OnboardingLearner = "new" | "experienced";
export type OnboardingCompletion = "completed" | "skipped";
export type OnboardingPlacement = "top" | "right" | "bottom" | "left" | "center";
export type OnboardingStepId =
  | "welcome"
  | "dashboard-modules"
  | "dashboard-create"
  | "dock"
  | "import-source"
  | "build-presets"
  | "free-canvas"
  | "node-detail"
  | "code-sync"
  | "layout-resize"
  | "runtime-flow"
  | "runtime-metrics"
  | "runtime-diagnostics"
  | "evidence-mentor"
  | "block-lifecycle"
  | "library";

const STEP_IDS: readonly OnboardingStepId[] = Object.freeze([
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
]);

export interface OnboardingCheckpoint {
  readonly stepId: OnboardingStepId;
  readonly learner: OnboardingLearner | null;
}

export interface OnboardingState {
  readonly version: typeof ONBOARDING_FLOW_VERSION;
  readonly status: "open" | "closed";
  readonly completion: OnboardingCompletion | null;
  readonly stepId: OnboardingStepId;
  readonly learner: OnboardingLearner | null;
  readonly history: readonly OnboardingCheckpoint[];
}

export interface OnboardingChoice {
  readonly id: string;
  readonly label: string;
}

export interface OnboardingScene {
  readonly stepId: OnboardingStepId;
  readonly pageId: string;
  readonly targetId: string;
  readonly placement: OnboardingPlacement;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly speaker: string;
  readonly dialogue: string;
  readonly choices: readonly OnboardingChoice[];
  readonly canGoBack: boolean;
}

export type OnboardingEvent =
  | { readonly type: "choose"; readonly choiceId: string }
  | { readonly type: "next" }
  | { readonly type: "back" }
  | { readonly type: "skip" }
  | { readonly type: "reopen" };

export type OnboardingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface OnboardingFlowOptions {
  readonly storage?: OnboardingStorage | undefined;
}

export interface OnboardingFlow {
  getState(): OnboardingState;
  choose(choiceId: string): OnboardingState;
  next(): OnboardingState;
  back(): OnboardingState;
  skip(): OnboardingState;
  reopen(): OnboardingState;
}

export function createOnboardingFlow(options: OnboardingFlowOptions = {}): OnboardingFlow {
  const storage = options.storage ?? defaultStorage();
  const storedCompletion = readCompletion(storage);
  let state = initialState(storedCompletion, storedCompletion === null);

  const apply = (event: OnboardingEvent): OnboardingState => {
    state = transitionOnboarding(state, event);
    if (state.status === "closed" && state.completion !== null) {
      writeCompletion(storage, state.completion);
    }
    return state;
  };

  return Object.freeze({
    getState: () => state,
    choose: (choiceId: string) => apply({ type: "choose", choiceId }),
    next: () => apply({ type: "next" }),
    back: () => apply({ type: "back" }),
    skip: () => apply({ type: "skip" }),
    reopen: () => apply({ type: "reopen" }),
  });
}

/** Pure deterministic transition: the same state and event always produce the same result. */
export function transitionOnboarding(
  state: OnboardingState,
  event: OnboardingEvent,
): OnboardingState {
  assertState(state);
  if (event.type === "reopen") return initialState(state.completion, true);
  if (state.status !== "open") throw new Error("新手引导当前未打开");
  if (event.type === "back") return previousState(state);
  if (event.type === "skip") {
    return freezeState({ ...state, status: "closed", completion: state.completion ?? "skipped" });
  }
  return chooseNextState(state, event.type === "next" ? "next" : event.choiceId);
}

export function getOnboardingScene(state: OnboardingState): OnboardingScene {
  assertState(state);
  const content = sceneContent(state);
  const stepIndex = STEP_IDS.indexOf(state.stepId) + 1;
  return Object.freeze({
    ...content,
    stepIndex,
    stepCount: STEP_IDS.length,
    canGoBack: state.history.length > 0,
  });
}

function chooseNextState(state: OnboardingState, choiceId: string): OnboardingState {
  if (!getOnboardingScene(state).choices.some((choice) => choice.id === choiceId)) {
    throw new RangeError(`当前对白不支持选择：${choiceId}`);
  }
  if (choiceId === "learner-new" || choiceId === "learner-experienced") {
    return advance(state, "dashboard-modules", {
      learner: choiceId === "learner-new" ? "new" : "experienced",
    });
  }
  if (choiceId === "finish") {
    return freezeState({ ...state, status: "closed", completion: "completed" });
  }
  if (choiceId === "next") return advance(state, requireNextStep(state.stepId));
  throw new RangeError(`未知新手引导选择：${choiceId}`);
}

function requireNextStep(stepId: OnboardingStepId): OnboardingStepId {
  const currentIndex = STEP_IDS.indexOf(stepId);
  const next = STEP_IDS[currentIndex + 1];
  if (next === undefined) throw new RangeError("新手引导已到最后一步");
  return next;
}

function advance(
  state: OnboardingState,
  stepId: OnboardingStepId,
  patch: Partial<Pick<OnboardingState, "learner">> = {},
): OnboardingState {
  const checkpoint = Object.freeze({
    stepId: state.stepId,
    learner: state.learner,
  });
  return freezeState({
    ...state,
    ...patch,
    stepId,
    history: [...state.history, checkpoint],
  });
}

function previousState(state: OnboardingState): OnboardingState {
  const checkpoint = state.history.at(-1);
  if (checkpoint === undefined) return state;
  return freezeState({
    ...state,
    ...checkpoint,
    history: state.history.slice(0, -1),
  });
}

function initialState(completion: OnboardingCompletion | null, open: boolean): OnboardingState {
  return freezeState({
    version: ONBOARDING_FLOW_VERSION,
    status: open ? "open" : "closed",
    completion,
    stepId: "welcome",
    learner: null,
    history: [],
  });
}

function freezeState(state: OnboardingState): OnboardingState {
  return Object.freeze({
    ...state,
    history: Object.freeze(state.history.map((checkpoint) => Object.freeze({ ...checkpoint }))),
  });
}

function sceneContent(
  state: OnboardingState,
): Omit<OnboardingScene, "stepIndex" | "stepCount" | "canGoBack"> {
  switch (state.stepId) {
    case "welcome":
      return scene(
        "welcome",
        "dashboard",
        "dashboard",
        "center",
        "工作台导师",
        "先确认你的经验。两条路线都会走完全部核心功能，只调整说明密度。",
        [choice("learner-new", "我是初学者"), choice("learner-experienced", "我写过 C / 算法")],
      );
    case "dashboard-modules":
      return scene(
        state.stepId,
        "dashboard",
        "dashboard-modules",
        "right",
        "工作台导师",
        personalized(
          state,
          "首页按项目、沙箱、测试组织学习文件；它们都保存在 Documents 专属目录中。",
          "Dashboard 把持久项目、临时沙箱和测试夹具分开管理，并映射到本地 Documents。",
        ),
        nextChoice(),
      );
    case "dashboard-create":
      return scene(
        state.stepId,
        "dashboard",
        "create-entry",
        "bottom",
        "工作台导师",
        "新建条目会创建独立子文件夹并启用自动保存；创建完成后直接进入搭建工作区。",
        nextChoice(),
      );
    case "dock":
      return scene(
        state.stepId,
        "dashboard",
        "dock-panels-branches",
        "bottom",
        "导航员",
        "顶部 Dock 只保留设置、预设块、Library、面板预览四个根入口。当前已展开面板预览，所有子分支都可直接切换真实工作区。",
        nextChoice(),
      );
    case "import-source":
      return scene(
        state.stepId,
        "dashboard",
        "import-actions",
        "bottom",
        "解析器",
        "已有 C 可以通过文件选择、磁盘拖放或粘贴载入；外部源码保持为临时文档，不会被静默覆盖。",
        nextChoice(),
      );
    case "build-presets":
      return scene(
        state.stepId,
        "build",
        "preset-blocks",
        "right",
        "装配员",
        "预制积木按学习阶段分类，可直接拖入或调用；以后也能加入课程模板和自定义片段。",
        nextChoice(),
      );
    case "free-canvas":
      return scene(
        state.stepId,
        "build",
        "assembly-canvas",
        "left",
        "装配员",
        "这里是真正的自由节点画布：节点可随意摆放、框选、平移和缩放；实线是控制流，锁定区域不会接受危险改线。",
        nextChoice(),
      );
    case "node-detail":
      return scene(
        state.stepId,
        "build",
        "node-detail",
        "left",
        "审校员",
        "单击节点会在画布内打开唯一的浮动详情窗。源码编辑、解释、端口、诊断、运行证据和生命周期都在这里，不会跳页。",
        nextChoice(),
      );
    case "code-sync":
      return scene(
        state.stepId,
        "build",
        "code-pane",
        "left",
        "同步器",
        "main.c 始终是权威事实源。代码与节点实时同步；任意导入 C 都能查看，无法安全分析的 raw/partial 区域保持原文并锁定改线。",
        nextChoice(),
      );
    case "layout-resize":
      return scene(
        state.stepId,
        "build",
        "layout-resize",
        "bottom",
        "布局管理员",
        "左侧、画布、代码、详情和运行区都可用鼠标或键盘拉伸；布局与节点坐标写入 flow-view.json，不会改写 main.c。",
        nextChoice(),
      );
    case "runtime-flow":
      return scene(
        state.stepId,
        "build",
        "runtime-flow",
        "top",
        "执行器",
        "真实运行由输入和 C 条件决定路径；教学模拟会明确标记且不进入真实性能历史。下方实时显示编译、分支、成功、错误和资源限制。",
        nextChoice(),
      );
    case "runtime-metrics":
      return scene(
        state.stepId,
        "build",
        "runtime-metrics",
        "top",
        "性能分析员",
        "指标页分开呈现墙钟时间、峰值内存、执行节点与操作计数；只有同源码、同案例和同工具链的记录才直接比较。",
        nextChoice(),
      );
    case "runtime-diagnostics":
      return scene(
        state.stepId,
        "build",
        "runtime-diagnostics",
        "top",
        "诊断员",
        "诊断页集中显示编译错误、资源限制和分析发现。点击带定位信息的条目可以回到对应源码或节点。",
        nextChoice(),
      );
    case "evidence-mentor":
      return scene(
        state.stepId,
        "build",
        "mentor-hints",
        "top",
        "本地导师",
        "提示只使用本地分析、真实路径和运行历史作为证据。它不联网、不上传源码、不自动修改代码，也不会制造综合效率分。",
        nextChoice(),
      );
    case "block-lifecycle":
      return scene(
        state.stepId,
        "block-library",
        "block-library-lifecycle",
        "left",
        "版本管理员",
        "积木库管理创建、弃用、恢复与退休；库生命周期不会偷偷改写已经生成的源码。",
        nextChoice(),
      );
    case "library":
      return scene(
        state.stepId,
        "software-library",
        "software-library-content",
        "left",
        "工作台导师",
        "Library 同时是完整软件手册、C/标准库/数据结构词典、算法与复杂度参考、案例库、故障恢复和扩展开发文档。",
        [choice("finish", "完成引导")],
      );
  }
}

function scene(
  stepId: OnboardingStepId,
  pageId: string,
  targetId: string,
  placement: OnboardingPlacement,
  speaker: string,
  dialogue: string,
  choices: readonly OnboardingChoice[],
): Omit<OnboardingScene, "stepIndex" | "stepCount" | "canGoBack"> {
  return Object.freeze({
    stepId,
    pageId,
    targetId,
    placement,
    speaker,
    dialogue,
    choices: Object.freeze([...choices]),
  });
}

function personalized(
  state: OnboardingState,
  beginnerDialogue: string,
  experiencedDialogue: string,
): string {
  return state.learner === "experienced" ? experiencedDialogue : beginnerDialogue;
}

function nextChoice(): readonly OnboardingChoice[] {
  return [choice("next", "下一步")];
}

function choice(id: string, label: string): OnboardingChoice {
  return Object.freeze({ id, label });
}

function readCompletion(storage: OnboardingStorage | undefined): OnboardingCompletion | null {
  if (storage === undefined) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(ONBOARDING_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (
      value !== null &&
      typeof value === "object" &&
      "version" in value &&
      value.version === ONBOARDING_FLOW_VERSION &&
      "completion" in value &&
      (value.completion === "completed" || value.completion === "skipped")
    ) {
      return value.completion;
    }
  } catch {
    // Invalid persisted data is removed below and treated as a first launch.
  }
  try {
    storage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    // A blocked storage backend must not block the deterministic in-memory flow.
  }
  return null;
}

function writeCompletion(
  storage: OnboardingStorage | undefined,
  completion: OnboardingCompletion,
): void {
  try {
    storage?.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({ version: ONBOARDING_FLOW_VERSION, completion }),
    );
  } catch {
    // Completion still applies for this session when persistence is unavailable.
  }
}

function defaultStorage(): OnboardingStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function assertState(state: OnboardingState): void {
  if (state.version !== ONBOARDING_FLOW_VERSION) {
    throw new TypeError("新手引导状态版本不受支持");
  }
}
