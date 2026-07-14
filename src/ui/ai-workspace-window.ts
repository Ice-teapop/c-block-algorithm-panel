export type AiWorkspacePermissionMode = "read-only" | "review" | "agent";
export type AiWorkspaceMessageRole = "user" | "assistant";
export type AiWorkspaceMessageState = "complete" | "streaming" | "error" | "stopped";

export interface AiWorkspaceConversationSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedLabel?: string | undefined;
}

export interface AiWorkspaceProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly conversations: readonly AiWorkspaceConversationSummary[];
}

export interface AiWorkspaceMessage {
  readonly id: string;
  readonly role: AiWorkspaceMessageRole;
  readonly content: string;
  readonly state?: AiWorkspaceMessageState | undefined;
  readonly changeSummary?: string | undefined;
}

export interface AiWorkspacePendingReview {
  readonly id: string;
  readonly summary: string;
  readonly diffSummary: string;
}

export interface AiWorkspaceWindowState {
  readonly projects: readonly AiWorkspaceProjectSummary[];
  readonly activeProjectId: string | null;
  readonly activeConversationId: string | null;
  readonly messages: readonly AiWorkspaceMessage[];
  readonly mode: AiWorkspacePermissionMode;
  readonly availableModes: readonly AiWorkspacePermissionMode[];
  readonly modelLabel: string;
  readonly suggestedQuestions?: readonly string[] | undefined;
  readonly isResponding?: boolean | undefined;
  readonly pendingReview?: AiWorkspacePendingReview | null | undefined;
}

export interface AiWorkspaceWindowGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AiWorkspaceWindowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AiWorkspaceSubmitContext {
  readonly projectId: string;
  readonly conversationId: string | null;
  readonly mode: AiWorkspacePermissionMode;
}

export interface AiWorkspaceWindowOptions {
  readonly initialState: AiWorkspaceWindowState;
  readonly presentation?: "floating" | "native" | undefined;
  readonly initialGeometry?: Partial<AiWorkspaceWindowGeometry> | undefined;
  readonly storage?: AiWorkspaceWindowStorage | undefined;
  readonly storageKey?: string | undefined;
  readonly onSend: (prompt: string, context: AiWorkspaceSubmitContext) => void;
  readonly onCancel?: (() => void) | undefined;
  readonly onSelectProject?: ((projectId: string) => void) | undefined;
  readonly onSelectConversation?: ((projectId: string, conversationId: string) => void) | undefined;
  readonly onNewConversation?: ((projectId: string) => void) | undefined;
  readonly onModeChange?: ((mode: AiWorkspacePermissionMode) => void) | undefined;
  readonly onOpenModelSettings?: (() => void) | undefined;
  readonly onGeometryChange?: ((geometry: AiWorkspaceWindowGeometry) => void) | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  readonly onMinimizedChange?: ((minimized: boolean) => void) | undefined;
  readonly onReviewDecision?: ((reviewId: string, accepted: boolean) => void) | undefined;
}

export interface AiWorkspaceWindowController {
  readonly element: HTMLElement;
  readonly isOpen: boolean;
  readonly isMinimized: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  minimize(value?: boolean): void;
  setState(state: AiWorkspaceWindowState): void;
  getGeometry(): AiWorkspaceWindowGeometry;
  destroy(): void;
}

export interface AiWorkspaceWindowShortcutState {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

interface ActivePointerOperation {
  readonly kind: "move" | "resize";
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly geometry: AiWorkspaceWindowGeometry;
  readonly edge?: ResizeEdge | undefined;
}

type ResizeEdge = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
type Locale = "zh-CN" | "en";

const DEFAULT_WIDTH = 860;
const DEFAULT_HEIGHT = 680;
const MIN_WIDTH = 680;
const MIN_HEIGHT = 480;
const VIEWPORT_GUTTER = 8;
const MINIMIZED_HEIGHT = 42;
const DEFAULT_STORAGE_KEY = "c-block-algorithm-panel.ai-window.v1";
const MODE_ORDER: readonly AiWorkspacePermissionMode[] = Object.freeze([
  "read-only",
  "review",
  "agent",
]);

const COPY = Object.freeze({
  "zh-CN": Object.freeze({
    noProject: "未打开项目",
    projects: "项目与对话",
    collapse: "收起列表",
    expand: "显示会话",
    newChat: "新对话",
    noChats: "还没有对话",
    noMessages: "从当前算法开始",
    defaultQuestions: Object.freeze([
      "解释当前算法",
      "检查边界条件",
      "设计一组测试",
      "比较两种优化方案",
    ]),
    mode: "权限模式",
    model: "模型",
    minimize: "最小化",
    restore: "恢复",
    close: "关闭",
    transcript: "AI 对话",
    composer: "向 AI 提问",
    placeholder: "询问当前算法…",
    send: "发送",
    stop: "停止",
    user: "你",
    assistant: "AI",
    streaming: "正在回答",
    error: "回答失败",
    stopped: "已停止",
    readOnly: "只读",
    review: "建议修改",
    agent: "代理",
    readOnlyDisclosure: "仅发送当前函数与分析证据，不发送完整 main.c。",
    reviewDisclosure: "会把完整 main.c 发送给所选模型；修改必须由你确认后应用。",
    agentDisclosure: "会把完整 main.c 发送给所选模型；通过安全检查后可自动应用修改。",
    unavailableMode: "需在设置中启用",
    resize: "调整 AI 窗口大小",
    reviewTitle: "等待确认的源码修改",
    apply: "应用",
    discard: "放弃",
  }),
  en: Object.freeze({
    noProject: "No project open",
    projects: "Projects and chats",
    collapse: "Hide list",
    expand: "Show chats",
    newChat: "New chat",
    noChats: "No conversations yet",
    noMessages: "Start with the current algorithm",
    defaultQuestions: Object.freeze([
      "Explain the current algorithm",
      "Check edge cases",
      "Design a test set",
      "Compare two improvements",
    ]),
    mode: "Permission mode",
    model: "Model",
    minimize: "Minimize",
    restore: "Restore",
    close: "Close",
    transcript: "AI conversation",
    composer: "Ask AI",
    placeholder: "Ask about the current algorithm…",
    send: "Send",
    stop: "Stop",
    user: "You",
    assistant: "AI",
    streaming: "Answering",
    error: "Answer failed",
    stopped: "Stopped",
    readOnly: "Read only",
    review: "Review changes",
    agent: "Agent",
    readOnlyDisclosure: "Sends the current function and evidence, not the complete main.c.",
    reviewDisclosure:
      "Sends the complete main.c to the selected model; you must approve each change.",
    agentDisclosure:
      "Sends the complete main.c to the selected model; validated changes may be applied automatically.",
    unavailableMode: "Enable in Settings",
    resize: "Resize AI window",
    reviewTitle: "Source change awaiting review",
    apply: "Apply",
    discard: "Discard",
  }),
});

export function isAiWorkspaceWindowShortcut(
  event: AiWorkspaceWindowShortcutState,
  isMac: boolean,
): boolean {
  if (event.altKey || !event.shiftKey || event.key.toLocaleLowerCase("en-US") !== "a") return false;
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

export function normalizeAiWindowGeometry(
  value: Partial<AiWorkspaceWindowGeometry> | null | undefined,
  viewportWidth: number,
  viewportHeight: number,
): AiWorkspaceWindowGeometry {
  const safeViewportWidth = finiteAtLeast(viewportWidth, MIN_WIDTH + VIEWPORT_GUTTER * 2);
  const safeViewportHeight = finiteAtLeast(viewportHeight, MIN_HEIGHT + VIEWPORT_GUTTER * 2);
  const maximumWidth = Math.max(MIN_WIDTH, safeViewportWidth - VIEWPORT_GUTTER * 2);
  const maximumHeight = Math.max(MIN_HEIGHT, safeViewportHeight - VIEWPORT_GUTTER * 2);
  const width = clamp(finite(value?.width, DEFAULT_WIDTH), MIN_WIDTH, maximumWidth);
  const height = clamp(finite(value?.height, DEFAULT_HEIGHT), MIN_HEIGHT, maximumHeight);
  const defaultX = Math.max(VIEWPORT_GUTTER, (safeViewportWidth - width) / 2);
  const defaultY = Math.max(VIEWPORT_GUTTER, (safeViewportHeight - height) / 2);
  return Object.freeze({
    x: Math.round(
      clamp(
        finite(value?.x, defaultX),
        VIEWPORT_GUTTER,
        Math.max(VIEWPORT_GUTTER, safeViewportWidth - width - VIEWPORT_GUTTER),
      ),
    ),
    y: Math.round(
      clamp(
        finite(value?.y, defaultY),
        VIEWPORT_GUTTER,
        Math.max(VIEWPORT_GUTTER, safeViewportHeight - height - VIEWPORT_GUTTER),
      ),
    ),
    width: Math.round(width),
    height: Math.round(height),
  });
}

export function createAiWorkspaceWindow(
  host: HTMLElement,
  options: AiWorkspaceWindowOptions,
): AiWorkspaceWindowController {
  assertOptions(options);
  const ownerDocument = host.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  const presentation = options.presentation ?? "floating";
  const isMac = /Mac|iPhone|iPad|iPod/u.test(ownerWindow?.navigator.platform ?? "");
  const storage = options.storage ?? safeStorage();
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  const persisted = readPersistedState(storage, storageKey);
  let state = validateState(options.initialState);
  let geometry = normalizeAiWindowGeometry(
    persisted?.geometry ?? options.initialGeometry,
    viewportWidth(ownerWindow),
    viewportHeight(ownerWindow),
  );
  let sidebarCollapsed = persisted?.sidebarCollapsed ?? false;
  let destroyed = false;
  let open = false;
  let minimized = false;
  let previousFocus: HTMLElement | null = null;
  let activePointer: ActivePointerOperation | null = null;

  const element = ownerDocument.createElement("section");
  element.className = "ai-workspace-window";
  element.dataset.presentation = presentation;
  element.hidden = true;
  element.tabIndex = -1;
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-modal", "false");
  element.setAttribute("aria-labelledby", "ai-workspace-window-title");

  const header = ownerDocument.createElement("header");
  header.className = "ai-workspace-window__header";
  const title = ownerDocument.createElement("h2");
  title.id = "ai-workspace-window-title";
  const modeSelect = ownerDocument.createElement("select");
  modeSelect.className = "ai-workspace-window__mode";
  const modelButton = ownerDocument.createElement("button");
  modelButton.type = "button";
  modelButton.className = "ai-workspace-window__model";
  const windowActions = ownerDocument.createElement("div");
  windowActions.className = "ai-workspace-window__window-actions";
  const minimizeButton = ownerDocument.createElement("button");
  minimizeButton.type = "button";
  const closeButton = ownerDocument.createElement("button");
  closeButton.type = "button";
  windowActions.append(minimizeButton, closeButton);
  header.append(title, modeSelect, modelButton, windowActions);

  const body = ownerDocument.createElement("div");
  body.className = "ai-workspace-window__body";
  const rail = ownerDocument.createElement("nav");
  rail.className = "ai-workspace-window__rail";
  const railHeader = ownerDocument.createElement("div");
  railHeader.className = "ai-workspace-window__rail-header";
  const railLabel = ownerDocument.createElement("strong");
  const railToggle = ownerDocument.createElement("button");
  railToggle.type = "button";
  railToggle.className = "ai-workspace-window__rail-toggle";
  railHeader.append(railLabel, railToggle);
  const projectList = ownerDocument.createElement("div");
  projectList.className = "ai-workspace-window__projects";
  rail.append(railHeader, projectList);

  const thread = ownerDocument.createElement("section");
  thread.className = "ai-workspace-window__thread";
  const permissionDisclosure = ownerDocument.createElement("p");
  permissionDisclosure.id = "ai-workspace-permission-disclosure";
  permissionDisclosure.className = "ai-workspace-window__permission-disclosure";
  permissionDisclosure.setAttribute("role", "status");
  const transcript = ownerDocument.createElement("div");
  transcript.className = "ai-workspace-window__transcript";
  transcript.tabIndex = 0;
  const composer = ownerDocument.createElement("form");
  composer.className = "ai-workspace-window__composer";
  const input = ownerDocument.createElement("textarea");
  input.className = "ai-workspace-window__input";
  input.rows = 2;
  const submitButton = ownerDocument.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "ai-workspace-window__submit";
  composer.append(input, submitButton);
  const review = ownerDocument.createElement("section");
  review.className = "ai-workspace-window__review";
  review.hidden = true;
  const reviewTitle = ownerDocument.createElement("strong");
  const reviewSummary = ownerDocument.createElement("span");
  const reviewDiff = ownerDocument.createElement("code");
  const reviewActions = ownerDocument.createElement("div");
  const reviewApply = ownerDocument.createElement("button");
  reviewApply.type = "button";
  const reviewDiscard = ownerDocument.createElement("button");
  reviewDiscard.type = "button";
  reviewActions.append(reviewDiscard, reviewApply);
  review.append(reviewTitle, reviewSummary, reviewDiff, reviewActions);
  thread.append(permissionDisclosure, transcript, review, composer);
  body.append(rail, thread);
  element.append(header, body);

  const resizeHandles = (["n", "e", "s", "w", "ne", "nw", "se", "sw"] as const).map((edge) => {
    const handle = ownerDocument.createElement("div");
    handle.className = "ai-workspace-window__resize-handle";
    handle.dataset.edge = edge;
    handle.tabIndex = edge === "se" ? 0 : -1;
    handle.setAttribute("role", "separator");
    element.append(handle);
    return handle;
  });
  host.append(element);

  const locale = (): Locale => (host.dataset.locale === "en" ? "en" : "zh-CN");
  const activeProject = (): AiWorkspaceProjectSummary | null =>
    state.projects.find((project) => project.id === state.activeProjectId) ?? null;

  const applyGeometry = (): void => {
    element.style.left = `${String(geometry.x)}px`;
    element.style.top = `${String(geometry.y)}px`;
    element.style.width = `${String(geometry.width)}px`;
    element.style.height = `${String(minimized ? MINIMIZED_HEIGHT : geometry.height)}px`;
  };

  const persist = (): void => {
    writePersistedState(storage, storageKey, geometry, sidebarCollapsed);
    options.onGeometryChange?.(geometry);
  };

  const render = (): void => {
    const copy = COPY[locale()];
    const project = activeProject();
    title.textContent = project?.name ?? copy.noProject;
    railLabel.textContent = copy.projects;
    railToggle.textContent = sidebarCollapsed ? copy.expand : copy.collapse;
    railToggle.setAttribute("aria-expanded", String(!sidebarCollapsed));
    rail.setAttribute("aria-label", copy.projects);
    element.dataset.railCollapsed = String(sidebarCollapsed);
    minimizeButton.textContent = minimized ? copy.restore : copy.minimize;
    closeButton.textContent = copy.close;
    minimizeButton.setAttribute("aria-label", minimized ? copy.restore : copy.minimize);
    closeButton.setAttribute("aria-label", copy.close);
    modeSelect.setAttribute("aria-label", copy.mode);
    modeSelect.setAttribute("aria-describedby", permissionDisclosure.id);
    permissionDisclosure.textContent = permissionDisclosureFor(state.mode, copy);
    permissionDisclosure.dataset.mode = state.mode;
    modelButton.textContent = state.modelLabel;
    modelButton.title = `${copy.model} · ${state.modelLabel}`;
    modelButton.disabled = options.onOpenModelSettings === undefined;
    transcript.setAttribute("aria-label", copy.transcript);
    input.setAttribute("aria-label", copy.composer);
    input.placeholder = copy.placeholder;
    input.disabled = project === null || state.isResponding === true;
    submitButton.textContent = state.isResponding === true ? copy.stop : copy.send;
    submitButton.type = state.isResponding === true ? "button" : "submit";
    submitButton.disabled = project === null;
    const pendingReview = state.pendingReview ?? null;
    review.hidden = pendingReview === null;
    reviewTitle.textContent = copy.reviewTitle;
    reviewSummary.textContent = pendingReview?.summary ?? "";
    reviewDiff.textContent = pendingReview?.diffSummary ?? "";
    reviewApply.textContent = copy.apply;
    reviewDiscard.textContent = copy.discard;
    for (const handle of resizeHandles) handle.setAttribute("aria-label", copy.resize);

    modeSelect.replaceChildren(
      ...MODE_ORDER.map((mode) => {
        const option = ownerDocument.createElement("option");
        option.value = mode;
        option.textContent = modeLabel(mode, copy);
        option.disabled = !state.availableModes.includes(mode);
        if (option.disabled) option.title = copy.unavailableMode;
        return option;
      }),
    );
    modeSelect.value = state.mode;

    projectList.replaceChildren(
      ...state.projects.map((item) => renderProject(ownerDocument, item, state, copy, options)),
    );
    transcript.replaceChildren(...renderTranscript(ownerDocument, state, copy, send));
  };

  function send(prompt: string): void {
    const project = activeProject();
    const normalized = prompt.trim();
    if (project === null || normalized.length === 0 || state.isResponding === true) return;
    options.onSend(normalized, {
      projectId: project.id,
      conversationId: state.activeConversationId,
      mode: state.mode,
    });
    input.value = "";
  }

  const setOpen = (value: boolean): void => {
    if (open === value) return;
    open = value;
    if (open) {
      const candidate = ownerDocument.activeElement;
      previousFocus = isFocusable(candidate) && candidate !== element ? candidate : null;
      if (presentation === "floating") {
        geometry = normalizeAiWindowGeometry(
          geometry,
          viewportWidth(ownerWindow),
          viewportHeight(ownerWindow),
        );
        applyGeometry();
      }
      element.hidden = false;
      element.dataset.open = "true";
      (input.disabled ? element : input).focus({ preventScroll: true });
    } else {
      persist();
      element.hidden = true;
      delete element.dataset.open;
      previousFocus?.focus({ preventScroll: true });
      previousFocus = null;
    }
    options.onOpenChange?.(open);
  };

  const setMinimized = (value: boolean): void => {
    if (minimized === value) return;
    minimized = value;
    element.dataset.minimized = String(value);
    applyGeometry();
    render();
    persist();
    options.onMinimizedChange?.(value);
  };

  const onHeaderPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || isInteractiveTarget(event.target)) return;
    event.preventDefault();
    activePointer = {
      kind: "move",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
    element.dataset.moving = "true";
    header.setPointerCapture?.(event.pointerId);
  };

  const onResizePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || minimized) return;
    const target = event.currentTarget as HTMLElement;
    const edge = target.dataset.edge as ResizeEdge | undefined;
    if (edge === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    activePointer = {
      kind: "resize",
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
    element.dataset.resizing = edge;
    target.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (activePointer === null || event.pointerId !== activePointer.pointerId) return;
    const dx = event.clientX - activePointer.startX;
    const dy = event.clientY - activePointer.startY;
    geometry =
      activePointer.kind === "move"
        ? normalizeAiWindowGeometry(
            {
              ...activePointer.geometry,
              x: activePointer.geometry.x + dx,
              y: activePointer.geometry.y + dy,
            },
            viewportWidth(ownerWindow),
            viewportHeight(ownerWindow),
          )
        : resizeGeometry(
            activePointer.geometry,
            activePointer.edge ?? "se",
            dx,
            dy,
            viewportWidth(ownerWindow),
            viewportHeight(ownerWindow),
          );
    applyGeometry();
  };

  const finishActivePointer = (pointerId: number | null): void => {
    if (activePointer === null || (pointerId !== null && pointerId !== activePointer.pointerId)) {
      return;
    }
    const completedPointerId = activePointer.pointerId;
    activePointer = null;
    for (const target of [header, ...resizeHandles]) {
      if (target.hasPointerCapture?.(completedPointerId) === true) {
        target.releasePointerCapture(completedPointerId);
      }
    }
    delete element.dataset.moving;
    delete element.dataset.resizing;
    persist();
  };
  const finishPointer = (event: PointerEvent): void => finishActivePointer(event.pointerId);
  const onWindowBlur = (): void => finishActivePointer(null);

  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (destroyed) return;
    if (presentation === "floating" && isAiWorkspaceWindowShortcut(event, isMac)) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!open);
    } else if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const onComposerSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    send(input.value);
  };
  const onInputKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    send(input.value);
  };
  const onSubmitClick = (): void => {
    if (state.isResponding === true) options.onCancel?.();
  };
  const onLocaleChange = (): void => render();
  const onViewportResize = (): void => {
    geometry = normalizeAiWindowGeometry(
      geometry,
      viewportWidth(ownerWindow),
      viewportHeight(ownerWindow),
    );
    applyGeometry();
    persist();
  };

  if (presentation === "floating") {
    header.addEventListener("pointerdown", onHeaderPointerDown);
    for (const handle of resizeHandles) handle.addEventListener("pointerdown", onResizePointerDown);
    ownerDocument.addEventListener("pointermove", onPointerMove);
    ownerDocument.addEventListener("pointerup", finishPointer);
    ownerDocument.addEventListener("pointercancel", finishPointer);
    element.addEventListener("lostpointercapture", finishPointer);
    ownerWindow?.addEventListener("blur", onWindowBlur);
    ownerWindow?.addEventListener("resize", onViewportResize);
  }
  ownerDocument.addEventListener("keydown", onDocumentKeydown, true);
  composer.addEventListener("submit", onComposerSubmit);
  input.addEventListener("keydown", onInputKeydown);
  submitButton.addEventListener("click", onSubmitClick);
  minimizeButton.addEventListener("click", () => setMinimized(!minimized));
  closeButton.addEventListener("click", () => setOpen(false));
  railToggle.addEventListener("click", () => {
    sidebarCollapsed = !sidebarCollapsed;
    render();
    persist();
  });
  modeSelect.addEventListener("change", () => {
    const next = modeSelect.value as AiWorkspacePermissionMode;
    if (!state.availableModes.includes(next)) {
      modeSelect.value = state.mode;
      return;
    }
    state = Object.freeze({ ...state, mode: next });
    render();
    options.onModeChange?.(next);
  });
  modelButton.addEventListener("click", () => options.onOpenModelSettings?.());
  reviewApply.addEventListener("click", () => {
    const pending = state.pendingReview;
    if (pending !== null && pending !== undefined) options.onReviewDecision?.(pending.id, true);
  });
  reviewDiscard.addEventListener("click", () => {
    const pending = state.pendingReview;
    if (pending !== null && pending !== undefined) options.onReviewDecision?.(pending.id, false);
  });
  host.addEventListener("workbench-locale-change", onLocaleChange);
  if (presentation === "floating") applyGeometry();
  render();

  return Object.freeze({
    element,
    get isOpen(): boolean {
      return open;
    },
    get isMinimized(): boolean {
      return minimized;
    },
    open(): void {
      assertActive(destroyed);
      setOpen(true);
    },
    close(): void {
      assertActive(destroyed);
      setOpen(false);
    },
    toggle(): void {
      assertActive(destroyed);
      setOpen(!open);
    },
    minimize(value = !minimized): void {
      assertActive(destroyed);
      setMinimized(value);
    },
    setState(nextState: AiWorkspaceWindowState): void {
      assertActive(destroyed);
      state = validateState(nextState);
      render();
    },
    getGeometry(): AiWorkspaceWindowGeometry {
      assertActive(destroyed);
      return geometry;
    },
    destroy(): void {
      if (destroyed) return;
      setOpen(false);
      if (presentation === "floating") {
        finishActivePointer(null);
        header.removeEventListener("pointerdown", onHeaderPointerDown);
        for (const handle of resizeHandles)
          handle.removeEventListener("pointerdown", onResizePointerDown);
        ownerDocument.removeEventListener("pointermove", onPointerMove);
        ownerDocument.removeEventListener("pointerup", finishPointer);
        ownerDocument.removeEventListener("pointercancel", finishPointer);
        element.removeEventListener("lostpointercapture", finishPointer);
        ownerWindow?.removeEventListener("blur", onWindowBlur);
        ownerWindow?.removeEventListener("resize", onViewportResize);
      }
      destroyed = true;
      ownerDocument.removeEventListener("keydown", onDocumentKeydown, true);
      composer.removeEventListener("submit", onComposerSubmit);
      input.removeEventListener("keydown", onInputKeydown);
      submitButton.removeEventListener("click", onSubmitClick);
      host.removeEventListener("workbench-locale-change", onLocaleChange);
      element.remove();
    },
  });
}

function renderProject(
  document: Document,
  project: AiWorkspaceProjectSummary,
  state: AiWorkspaceWindowState,
  copy: (typeof COPY)[Locale],
  options: AiWorkspaceWindowOptions,
): HTMLElement {
  const section = document.createElement("section");
  section.className = "ai-workspace-window__project";
  const active = project.id === state.activeProjectId;
  section.dataset.active = String(active);
  const projectButton = document.createElement("button");
  projectButton.type = "button";
  projectButton.className = "ai-workspace-window__project-button";
  projectButton.textContent = project.name;
  projectButton.setAttribute("aria-current", active ? "true" : "false");
  projectButton.addEventListener("click", () => options.onSelectProject?.(project.id));
  section.append(projectButton);
  if (!active) return section;
  const conversationList = document.createElement("div");
  conversationList.className = "ai-workspace-window__conversations";
  if (project.conversations.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = copy.noChats;
    conversationList.append(empty);
  } else {
    conversationList.append(
      ...project.conversations.map((conversation) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ai-workspace-window__conversation";
        button.dataset.active = String(conversation.id === state.activeConversationId);
        const label = document.createElement("span");
        label.textContent = conversation.title;
        button.append(label);
        if (conversation.updatedLabel !== undefined) {
          const time = document.createElement("small");
          time.textContent = conversation.updatedLabel;
          button.append(time);
        }
        button.addEventListener("click", () =>
          options.onSelectConversation?.(project.id, conversation.id),
        );
        return button;
      }),
    );
  }
  const newChat = document.createElement("button");
  newChat.type = "button";
  newChat.className = "ai-workspace-window__new-chat";
  newChat.textContent = copy.newChat;
  newChat.addEventListener("click", () => options.onNewConversation?.(project.id));
  conversationList.append(newChat);
  section.append(conversationList);
  return section;
}

function renderTranscript(
  document: Document,
  state: AiWorkspaceWindowState,
  copy: (typeof COPY)[Locale],
  send: (prompt: string) => void,
): readonly HTMLElement[] {
  if (state.messages.length === 0) {
    const empty = document.createElement("section");
    empty.className = "ai-workspace-window__empty";
    const heading = document.createElement("h3");
    heading.textContent = copy.noMessages;
    const suggestions = document.createElement("div");
    suggestions.className = "ai-workspace-window__suggestions";
    const questions = (state.suggestedQuestions ?? copy.defaultQuestions)
      .filter(Boolean)
      .slice(0, 4);
    suggestions.append(
      ...questions.map((question) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = question;
        button.addEventListener("click", () => send(question));
        return button;
      }),
    );
    empty.append(heading, suggestions);
    return [empty];
  }
  return state.messages.map((message) => {
    const row = document.createElement("article");
    row.className = "ai-workspace-window__message";
    row.dataset.role = message.role;
    row.dataset.state = message.state ?? "complete";
    const role = document.createElement("strong");
    role.textContent = message.role === "user" ? copy.user : copy.assistant;
    const content = document.createElement("p");
    content.textContent = message.content;
    row.append(role, content);
    if (message.changeSummary !== undefined) {
      const changes = document.createElement("output");
      changes.className = "ai-workspace-window__change-summary";
      changes.textContent = message.changeSummary;
      row.append(changes);
    }
    if (message.state !== undefined && message.state !== "complete") {
      const status = document.createElement("small");
      status.textContent =
        message.state === "streaming"
          ? copy.streaming
          : message.state === "error"
            ? copy.error
            : copy.stopped;
      row.append(status);
    }
    return row;
  });
}

function modeLabel(mode: AiWorkspacePermissionMode, copy: (typeof COPY)[Locale]): string {
  if (mode === "read-only") return copy.readOnly;
  if (mode === "review") return copy.review;
  return copy.agent;
}

function permissionDisclosureFor(
  mode: AiWorkspacePermissionMode,
  copy: (typeof COPY)[Locale],
): string {
  if (mode === "read-only") return copy.readOnlyDisclosure;
  if (mode === "review") return copy.reviewDisclosure;
  return copy.agentDisclosure;
}

function resizeGeometry(
  origin: AiWorkspaceWindowGeometry,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  viewportWidthValue: number,
  viewportHeightValue: number,
): AiWorkspaceWindowGeometry {
  let x = origin.x;
  let y = origin.y;
  let width = origin.width;
  let height = origin.height;
  if (edge.includes("e")) width += dx;
  if (edge.includes("s")) height += dy;
  if (edge.includes("w")) {
    x += dx;
    width -= dx;
  }
  if (edge.includes("n")) {
    y += dy;
    height -= dy;
  }
  if (width < MIN_WIDTH) {
    if (edge.includes("w")) x -= MIN_WIDTH - width;
    width = MIN_WIDTH;
  }
  if (height < MIN_HEIGHT) {
    if (edge.includes("n")) y -= MIN_HEIGHT - height;
    height = MIN_HEIGHT;
  }
  return normalizeAiWindowGeometry(
    { x, y, width, height },
    viewportWidthValue,
    viewportHeightValue,
  );
}

function validateState(state: AiWorkspaceWindowState): AiWorkspaceWindowState {
  if (
    state === null ||
    typeof state !== "object" ||
    !Array.isArray(state.projects) ||
    !Array.isArray(state.messages)
  ) {
    throw new TypeError("AI workspace window state is invalid");
  }
  if (
    !MODE_ORDER.includes(state.mode) ||
    !Array.isArray(state.availableModes) ||
    !state.availableModes.includes(state.mode)
  ) {
    throw new TypeError("AI workspace permission mode is invalid or unavailable");
  }
  if (typeof state.modelLabel !== "string" || state.modelLabel.trim().length === 0) {
    throw new TypeError("AI workspace model label is required");
  }
  if (
    state.pendingReview !== undefined &&
    state.pendingReview !== null &&
    (typeof state.pendingReview.id !== "string" ||
      typeof state.pendingReview.summary !== "string" ||
      typeof state.pendingReview.diffSummary !== "string")
  ) {
    throw new TypeError("AI workspace pending review is invalid");
  }
  return state;
}

function assertOptions(options: AiWorkspaceWindowOptions): void {
  if (options === null || typeof options !== "object" || typeof options.onSend !== "function") {
    throw new TypeError("AI workspace window options are invalid");
  }
  validateState(options.initialState);
}

function readPersistedState(
  storage: AiWorkspaceWindowStorage | undefined,
  key: string,
): { geometry: Partial<AiWorkspaceWindowGeometry>; sidebarCollapsed: boolean } | null {
  try {
    const parsed = JSON.parse(storage?.getItem(key) ?? "null") as unknown;
    if (parsed === null || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (
      record.schemaVersion !== 1 ||
      record.geometry === null ||
      typeof record.geometry !== "object"
    )
      return null;
    return {
      geometry: record.geometry as Partial<AiWorkspaceWindowGeometry>,
      sidebarCollapsed: record.sidebarCollapsed === true,
    };
  } catch {
    return null;
  }
}

function writePersistedState(
  storage: AiWorkspaceWindowStorage | undefined,
  key: string,
  geometry: AiWorkspaceWindowGeometry,
  sidebarCollapsed: boolean,
): void {
  try {
    storage?.setItem(key, JSON.stringify({ schemaVersion: 1, geometry, sidebarCollapsed }));
  } catch {
    /* Session state remains usable. */
  }
}

function safeStorage(): AiWorkspaceWindowStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function viewportWidth(view: Window | null): number {
  return finiteAtLeast(view?.innerWidth, 1440);
}
function viewportHeight(view: Window | null): number {
  return finiteAtLeast(view?.innerHeight, 900);
}
function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function finiteAtLeast(value: unknown, fallback: number): number {
  const numeric = finite(value, fallback);
  return numeric > 0 ? numeric : fallback;
}
function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
function isFocusable(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HTMLElement).focus === "function"
  );
}
function isInteractiveTarget(value: EventTarget | null): boolean {
  let current = value as
    | (EventTarget & {
        tagName?: string;
        parentElement?: Element | null;
        getAttribute?: (name: string) => string | null;
      })
    | null;
  while (current !== null) {
    if (
      ["BUTTON", "SELECT", "INPUT", "TEXTAREA", "A", "SUMMARY"].includes(
        current.tagName?.toUpperCase() ?? "",
      ) ||
      current.getAttribute?.("contenteditable") === "true" ||
      ["button", "link", "menuitem", "option", "slider", "switch", "tab"].includes(
        current.getAttribute?.("role") ?? "",
      )
    )
      return true;
    current = current.parentElement ?? null;
  }
  return false;
}
function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("AI workspace window has been destroyed");
}
