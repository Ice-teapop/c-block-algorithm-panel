export type WorkbenchMenuRootId = "settings" | "presets" | "library" | "panels";

export type WorkbenchMenuBranchKind = "command" | "panel" | "layout";

export interface WorkbenchMenuBranch {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly kind: WorkbenchMenuBranchKind;
}

export interface WorkbenchMenuDefinition {
  readonly id: WorkbenchMenuRootId;
  readonly label: string;
  readonly branches: readonly WorkbenchMenuBranch[];
}

export interface WorkbenchMenuSelection {
  readonly rootId: WorkbenchMenuRootId;
  readonly branchId: string;
}

export interface WorkbenchMenuOptions {
  readonly onSelect?: ((selection: WorkbenchMenuSelection) => void) | undefined;
  readonly onOpenChange?: ((rootId: WorkbenchMenuRootId | null) => void) | undefined;
  readonly definitions?: readonly WorkbenchMenuDefinition[] | undefined;
}

export interface WorkbenchMenuController {
  readonly element: HTMLElement;
  open(rootId: WorkbenchMenuRootId, focusFirstItem?: boolean): void;
  close(options?: { readonly restoreFocus?: boolean }): void;
  setBranchEnabled(rootId: WorkbenchMenuRootId, branchId: string, enabled: boolean): void;
  destroy(): void;
}

const SETTINGS_BRANCHES: readonly WorkbenchMenuBranch[] = Object.freeze([
  branch("appearance", "外观", "界面", "command"),
  branch("workspace-files", "文件与自动保存", "工作区", "command"),
  branch("canvas-connections", "画布与连线", "工作区", "command"),
  branch("execution", "编译与运行", "执行", "command"),
  branch("ai-privacy", "AI 与隐私", "执行", "command"),
  branch("keyboard", "快捷键", "辅助", "command"),
  branch("accessibility", "无障碍", "辅助", "command"),
  branch("about-logs", "版本与日志", "系统", "command"),
]);

const PRESET_BRANCHES: readonly WorkbenchMenuBranch[] = Object.freeze([
  branch("recent-favorites", "最近与收藏", "个人", "command"),
  branch("flow-control", "流程控制", "基础", "command"),
  branch("c-basics", "C 基础", "基础", "command"),
  branch("functions-io", "函数与 I/O", "语言", "command"),
  branch("arrays-strings", "数组与字符串", "语言", "command"),
  branch("pointers-memory", "指针与内存", "语言", "command"),
  branch("data-structures", "数据结构", "算法", "command"),
  branch("algorithm-patterns", "算法模式", "算法", "command"),
  branch("testing-analysis", "测试与分析", "工具", "command"),
  branch("custom-lifecycle", "自定义块生命周期", "工具", "command"),
]);

const LIBRARY_BRANCHES: readonly WorkbenchMenuBranch[] = Object.freeze([
  branch("manual", "完整软件手册", "使用", "command"),
  branch("canvas-wires", "画布与连线规则", "使用", "command"),
  branch("execution-diagnostics", "运行与诊断", "使用", "command"),
  branch("c-syntax", "C 语法词典", "词典", "command"),
  branch("standard-library", "标准库词典", "词典", "command"),
  branch("data-structure-dictionary", "数据结构词典", "词典", "command"),
  branch("algorithms-complexity", "算法与复杂度", "课程", "command"),
  branch("examples", "案例与情景", "课程", "command"),
  branch("recovery", "故障与恢复", "支持", "command"),
  branch("extension-api", "扩展开发文档", "扩展", "command"),
  branch("onboarding", "新手引导", "支持", "command"),
]);

const PANEL_BRANCHES: readonly WorkbenchMenuBranch[] = Object.freeze([
  branch("project", "项目", "显示面板", "panel"),
  branch("presets", "预设", "显示面板", "panel"),
  branch("canvas", "画布", "显示面板", "panel"),
  branch("code", "代码", "显示面板", "panel"),
  branch("inspector", "属性", "显示面板", "panel"),
  branch("runtime", "运行流程", "显示面板", "panel"),
  branch("metrics", "指标", "显示面板", "panel"),
  branch("diagnostics", "诊断", "显示面板", "panel"),
  branch("mentor", "AI 提示", "显示面板", "panel"),
  branch("software-library", "Library", "显示面板", "panel"),
  branch("learn", "学习布局", "布局", "layout"),
  branch("build", "搭建布局", "布局", "layout"),
  branch("debug", "调试布局", "布局", "layout"),
  branch("analyze", "分析布局", "布局", "layout"),
  branch("minimal", "极简布局", "布局", "layout"),
  branch("save-layout", "保存当前布局", "布局", "command"),
  branch("reset-layout", "恢复默认布局", "布局", "command"),
]);

export const WORKBENCH_MENU_DEFINITIONS: readonly WorkbenchMenuDefinition[] = Object.freeze([
  definition("settings", "设置", SETTINGS_BRANCHES),
  definition("presets", "预设块", PRESET_BRANCHES),
  definition("library", "Library", LIBRARY_BRANCHES),
  definition("panels", "面板预览", PANEL_BRANCHES),
]);

interface MountedMenu {
  readonly definition: WorkbenchMenuDefinition;
  readonly root: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly popup: HTMLElement;
  readonly items: readonly HTMLButtonElement[];
}

let menuInstanceSequence = 0;

export function createWorkbenchMenu(
  host: HTMLElement,
  options: WorkbenchMenuOptions = {},
): WorkbenchMenuController {
  if (host === null || typeof host !== "object") {
    throw new TypeError("Workbench menu host 必须是 HTMLElement");
  }

  const ownerDocument = host.ownerDocument;
  const instanceId = ++menuInstanceSequence;
  const navigation = ownerDocument.createElement("nav");
  navigation.className = "workbench-menu";
  navigation.setAttribute("aria-label", "工作台功能");

  const definitions = normalizeDefinitions(options.definitions ?? WORKBENCH_MENU_DEFINITIONS);
  const mounted: MountedMenu[] = definitions.map((menu, rootIndex) => {
    const root = ownerDocument.createElement("div");
    root.className = "workbench-menu__root";
    root.dataset.menuRoot = menu.id;

    const trigger = ownerDocument.createElement("button");
    trigger.className = "workbench-menu__trigger";
    trigger.type = "button";
    trigger.textContent = menu.label;
    trigger.dataset.menuRootTrigger = menu.id;
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.tabIndex = rootIndex === 0 ? 0 : -1;

    const popup = ownerDocument.createElement("div");
    popup.className = "workbench-menu__popup";
    popup.id = `workbench-menu-${instanceId}-${menu.id}`;
    popup.dataset.menuPopup = menu.id;
    popup.dataset.tourTarget = `dock-${menu.id}-branches`;
    popup.setAttribute("role", "menu");
    popup.setAttribute("aria-label", menu.label);
    popup.hidden = true;
    trigger.setAttribute("aria-controls", popup.id);

    const items: HTMLButtonElement[] = [];
    let previousGroup: string | null = null;
    for (const item of menu.branches) {
      if (item.group !== previousGroup) {
        const groupLabel = ownerDocument.createElement("div");
        groupLabel.className = "workbench-menu__group-label";
        groupLabel.textContent = item.group;
        groupLabel.setAttribute("role", "presentation");
        popup.append(groupLabel);
        previousGroup = item.group;
      }
      const button = ownerDocument.createElement("button");
      button.className = "workbench-menu__item";
      button.type = "button";
      button.textContent = item.label;
      button.dataset.menuRoot = menu.id;
      button.dataset.menuBranch = item.id;
      button.dataset.menuBranchKind = item.kind;
      button.setAttribute("role", "menuitem");
      button.tabIndex = -1;
      popup.append(button);
      items.push(button);
    }

    root.append(trigger, popup);
    navigation.append(root);
    return { definition: menu, root, trigger, popup, items: Object.freeze(items) };
  });

  host.replaceChildren(navigation);
  let openRootId: WorkbenchMenuRootId | null = null;
  let destroyed = false;

  const mountedFor = (rootId: WorkbenchMenuRootId): MountedMenu => {
    const match = mounted.find((entry) => entry.definition.id === rootId);
    if (match === undefined) throw new RangeError(`未知 Workbench menu：${rootId}`);
    return match;
  };

  const renderOpenState = (): void => {
    for (const menu of mounted) {
      const open = menu.definition.id === openRootId;
      menu.trigger.setAttribute("aria-expanded", String(open));
      menu.popup.hidden = !open;
      menu.root.classList.toggle("is-open", open);
    }
  };

  const notifyOpenChange = (): void => options.onOpenChange?.(openRootId);

  const open = (rootId: WorkbenchMenuRootId, focusFirstItem = false): void => {
    assertActive(destroyed);
    const menu = mountedFor(rootId);
    openRootId = rootId;
    renderOpenState();
    notifyOpenChange();
    if (focusFirstItem) focusEnabledItem(menu, 0);
  };

  const close = (closeOptions: { readonly restoreFocus?: boolean } = {}): void => {
    assertActive(destroyed);
    const previous = openRootId === null ? null : mountedFor(openRootId);
    if (openRootId === null) return;
    openRootId = null;
    renderOpenState();
    notifyOpenChange();
    if (closeOptions.restoreFocus === true) previous?.trigger.focus();
  };

  const focusRoot = (index: number): void => {
    const normalized = moveRovingIndex(0, "direct", mounted.length, index);
    for (const [position, menu] of mounted.entries()) {
      menu.trigger.tabIndex = position === normalized ? 0 : -1;
    }
    mounted[normalized]?.trigger.focus();
  };

  const switchOpenRoot = (rootIndex: number): void => {
    const menu = mounted[rootIndex];
    if (menu === undefined) return;
    focusRoot(rootIndex);
    open(menu.definition.id, true);
  };

  const onNavigationClick = (event: MouseEvent): void => {
    if (destroyed) return;
    const target = elementClosest(event.target, "button");
    if (!(target instanceof HTMLButtonElement)) return;
    const rootId = asRootId(target.dataset.menuRootTrigger);
    if (rootId !== null) {
      if (openRootId === rootId) close();
      else open(rootId);
      return;
    }
    const itemRootId = asRootId(target.dataset.menuRoot);
    const branchId = target.dataset.menuBranch;
    if (itemRootId === null || branchId === undefined || target.disabled) return;
    options.onSelect?.(Object.freeze({ rootId: itemRootId, branchId }));
    close({ restoreFocus: true });
  };

  const onNavigationKeydown = (event: KeyboardEvent): void => {
    if (destroyed) return;
    const target = elementClosest(event.target, "button");
    if (!(target instanceof HTMLButtonElement)) return;
    const rootId = asRootId(target.dataset.menuRootTrigger);
    if (rootId !== null) {
      const rootIndex = mounted.findIndex((menu) => menu.definition.id === rootId);
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const direction =
          event.key === "Home"
            ? "home"
            : event.key === "End"
              ? "end"
              : event.key === "ArrowRight"
                ? "next"
                : "previous";
        focusRoot(moveRovingIndex(rootIndex, direction, mounted.length));
      } else if (["ArrowDown", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open(rootId, true);
      } else if (event.key === "Escape" && openRootId !== null) {
        event.preventDefault();
        close({ restoreFocus: true });
      }
      return;
    }

    const itemRootId = asRootId(target.dataset.menuRoot);
    if (itemRootId === null) return;
    const menu = mountedFor(itemRootId);
    const enabledItems = menu.items.filter((item) => !item.disabled);
    const itemIndex = enabledItems.indexOf(target);
    if (itemIndex < 0) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const direction =
        event.key === "Home"
          ? "home"
          : event.key === "End"
            ? "end"
            : event.key === "ArrowDown"
              ? "next"
              : "previous";
      enabledItems[moveRovingIndex(itemIndex, direction, enabledItems.length)]?.focus();
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const rootIndex = mounted.indexOf(menu);
      const direction = event.key === "ArrowRight" ? "next" : "previous";
      switchOpenRoot(moveRovingIndex(rootIndex, direction, mounted.length));
    } else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      close({ restoreFocus: event.key === "Escape" });
    }
  };

  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (destroyed || openRootId === null) return;
    const target = event.target;
    if (target instanceof Node && !navigation.contains(target)) close();
  };

  navigation.addEventListener("click", onNavigationClick);
  navigation.addEventListener("keydown", onNavigationKeydown);
  ownerDocument.addEventListener("pointerdown", onDocumentPointerDown);

  return Object.freeze({
    element: navigation,
    open,
    close,
    setBranchEnabled(rootId: WorkbenchMenuRootId, branchId: string, enabled: boolean): void {
      assertActive(destroyed);
      if (typeof enabled !== "boolean") throw new TypeError("enabled 必须是布尔值");
      const item = mountedFor(rootId).items.find(
        (candidate) => candidate.dataset.menuBranch === branchId,
      );
      if (item === undefined) throw new RangeError(`未知 menu branch：${rootId}/${branchId}`);
      item.disabled = !enabled;
      item.setAttribute("aria-disabled", String(!enabled));
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      navigation.removeEventListener("click", onNavigationClick);
      navigation.removeEventListener("keydown", onNavigationKeydown);
      ownerDocument.removeEventListener("pointerdown", onDocumentPointerDown);
      navigation.remove();
    },
  });
}

/** Converts the immutable registry snapshot into the four visible Dock roots. */
export function workbenchMenuDefinitionsFromRegistry(
  snapshot: WorkbenchRegistrySnapshot,
): readonly WorkbenchMenuDefinition[] {
  const expected = WORKBENCH_MENU_DEFINITIONS.map((definition) => definition.id);
  const menus = [...snapshot.dockMenus].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
  return normalizeDefinitions(
    expected.map((rootId) => {
      const menu = menus.find(
        (candidate) =>
          candidate.id === rootId || (rootId === "panels" && candidate.id === "panel-preview"),
      );
      if (menu === undefined) throw new TypeError(`工作台注册表缺少 Dock 根菜单 ${rootId}`);
      const fallback = WORKBENCH_MENU_DEFINITIONS.find((candidate) => candidate.id === rootId)!;
      return Object.freeze({
        id: rootId,
        label: menu.label,
        branches: Object.freeze(
          [...menu.branches]
            .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
            .map((contribution) => {
              const known = fallback.branches.find(
                (candidate) => candidate.id === contribution.actionId,
              );
              return branch(
                contribution.actionId,
                contribution.label,
                known?.group ?? "扩展",
                known?.kind ?? "command",
              );
            }),
        ),
      });
    }),
  );
}

function normalizeDefinitions(
  definitions: readonly WorkbenchMenuDefinition[],
): readonly WorkbenchMenuDefinition[] {
  const required: readonly WorkbenchMenuRootId[] = ["settings", "presets", "library", "panels"];
  if (
    definitions.length !== required.length ||
    definitions.some((definition, index) => definition.id !== required[index])
  ) {
    throw new TypeError("Dock 必须严格包含设置、预设块、Library、面板预览四个根菜单");
  }
  return Object.freeze(
    definitions.map((definition) =>
      Object.freeze({ ...definition, branches: Object.freeze([...definition.branches]) }),
    ),
  );
}

export type RovingDirection = "next" | "previous" | "home" | "end" | "direct";

export function moveRovingIndex(
  current: number,
  direction: RovingDirection,
  count: number,
  directIndex = current,
): number {
  if (!Number.isSafeInteger(count) || count <= 0) throw new RangeError("count 必须是正整数");
  const normalizedCurrent = clampInteger(current, 0, count - 1);
  if (direction === "home") return 0;
  if (direction === "end") return count - 1;
  if (direction === "direct") return clampInteger(directIndex, 0, count - 1);
  if (direction === "next") return (normalizedCurrent + 1) % count;
  return (normalizedCurrent - 1 + count) % count;
}

function focusEnabledItem(menu: MountedMenu, preferredIndex: number): void {
  const enabled = menu.items.filter((item) => !item.disabled);
  if (enabled.length === 0) {
    menu.trigger.focus();
    return;
  }
  enabled[clampInteger(preferredIndex, 0, enabled.length - 1)]?.focus();
}

function branch(
  id: string,
  label: string,
  group: string,
  kind: WorkbenchMenuBranchKind,
): WorkbenchMenuBranch {
  return Object.freeze({ id, label, group, kind });
}

function definition(
  id: WorkbenchMenuRootId,
  label: string,
  branches: readonly WorkbenchMenuBranch[],
): WorkbenchMenuDefinition {
  return Object.freeze({ id, label, branches });
}

function asRootId(value: string | undefined): WorkbenchMenuRootId | null {
  return WORKBENCH_MENU_DEFINITIONS.some((definition) => definition.id === value)
    ? (value as WorkbenchMenuRootId)
    : null;
}

function elementClosest(target: EventTarget | null, selector: string): Element | null {
  return target instanceof Element ? target.closest(selector) : null;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("Workbench menu 已销毁");
}
import type { WorkbenchRegistrySnapshot } from "../workbench/contracts.js";
