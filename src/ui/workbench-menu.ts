import type { InterfaceLocale } from "../shared/interface-locale.js";
import type { WorkbenchRegistrySnapshot } from "../workbench/contracts.js";

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
  readonly localeHost?: HTMLElement | undefined;
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
  branch("general", "通用", "", "command"),
  branch("ai-privacy", "AI 助手", "", "command"),
  branch("keyboard", "快捷键", "", "command"),
  branch("about-logs", "关于", "", "command"),
]);

const PRESET_BRANCHES: readonly WorkbenchMenuBranch[] = Object.freeze([
  branch("search", "搜索", "", "command"),
  branch("flow-c-basics", "流程与 C 基础", "", "command"),
  branch("data-memory", "数据与内存", "", "command"),
  branch("algorithm-patterns", "算法模式", "", "command"),
  branch("custom-lifecycle", "自定义", "", "command"),
]);

const LIBRARY_BRANCHES: readonly WorkbenchMenuBranch[] = Object.freeze([
  branch("c-syntax", "语法", "", "command"),
  branch("standard-library", "标准库", "", "command"),
  branch("data-structure-dictionary", "数据结构", "", "command"),
  branch("algorithms-complexity", "算法", "", "command"),
  branch("examples", "案例", "", "command"),
  branch("manual", "帮助", "", "command"),
]);

const PANEL_BRANCHES: readonly WorkbenchMenuBranch[] = Object.freeze([
  branch("build", "搭建", "", "layout"),
  branch("debug", "调试", "", "layout"),
  branch("analyze", "分析", "", "layout"),
  branch("minimal", "专注画布", "", "layout"),
  branch("reset-layout", "恢复尺寸", "", "command"),
]);

export const WORKBENCH_MENU_DEFINITIONS: readonly WorkbenchMenuDefinition[] = Object.freeze([
  definition("settings", "设置", SETTINGS_BRANCHES),
  definition("presets", "积木", PRESET_BRANCHES),
  definition("library", "Library", LIBRARY_BRANCHES),
  definition("panels", "布局", PANEL_BRANCHES),
]);

interface MountedMenu {
  readonly definition: WorkbenchMenuDefinition;
  readonly root: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly popup: HTMLElement;
  readonly items: readonly HTMLButtonElement[];
  readonly groups: readonly HTMLElement[];
}

const ENGLISH_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "root:settings": "Settings",
  "root:presets": "Blocks",
  "root:library": "Library",
  "root:panels": "Layout",
  "settings:general": "General",
  "settings:ai-privacy": "AI Assistant",
  "settings:keyboard": "Keyboard",
  "settings:about-logs": "About",
  "presets:search": "Search",
  "presets:flow-c-basics": "Flow and C Basics",
  "presets:data-memory": "Data and Memory",
  "presets:algorithm-patterns": "Algorithm Patterns",
  "presets:custom-lifecycle": "Custom",
  "library:c-syntax": "Syntax",
  "library:standard-library": "Standard Library",
  "library:data-structure-dictionary": "Data Structures",
  "library:algorithms-complexity": "Algorithms",
  "library:examples": "Examples",
  "library:manual": "Help",
  "panels:build": "Build",
  "panels:debug": "Debug",
  "panels:analyze": "Analyze",
  "panels:minimal": "Canvas Focus",
  "panels:reset-layout": "Reset Sizes",
});

let menuInstanceSequence = 0;

export function createWorkbenchMenu(
  host: HTMLElement,
  options: WorkbenchMenuOptions = {},
): WorkbenchMenuController {
  if (host === null || typeof host !== "object") {
    throw new TypeError("Workbench menu host 必须是 HTMLElement");
  }

  const ownerDocument = host.ownerDocument;
  const localeHost = options.localeHost ?? host;
  let locale: InterfaceLocale = localeHost.dataset.locale === "en" ? "en" : "zh-CN";
  const instanceId = ++menuInstanceSequence;
  const navigation = ownerDocument.createElement("nav");
  navigation.className = "workbench-menu";
  navigation.setAttribute("aria-label", locale === "en" ? "Workbench features" : "工作台功能");

  const definitions = normalizeDefinitions(options.definitions ?? WORKBENCH_MENU_DEFINITIONS);
  const mounted: MountedMenu[] = definitions.map((menu, rootIndex) => {
    const direct = menu.id === "library";
    const root = ownerDocument.createElement("div");
    root.className = "workbench-menu__root";
    root.dataset.menuRoot = menu.id;

    const trigger = ownerDocument.createElement("button");
    trigger.className = "workbench-menu__trigger";
    trigger.type = "button";
    trigger.textContent = visibleMenuLabel(menu.id, menu.label, locale);
    trigger.dataset.labelZh = menu.label;
    trigger.dataset.menuRootTrigger = menu.id;
    if (!direct) trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", "false");
    trigger.tabIndex = rootIndex === 0 ? 0 : -1;

    const popup = ownerDocument.createElement("div");
    popup.className = "workbench-menu__popup";
    popup.id = `workbench-menu-${instanceId}-${menu.id}`;
    popup.dataset.menuPopup = menu.id;
    popup.dataset.tourTarget = `dock-${menu.id}-branches`;
    popup.setAttribute("role", "menu");
    popup.setAttribute("aria-label", visibleMenuLabel(menu.id, menu.label, locale));
    popup.hidden = true;
    if (!direct) trigger.setAttribute("aria-controls", popup.id);

    const items: HTMLButtonElement[] = [];
    const groups: HTMLElement[] = [];
    let previousGroup: string | null = null;
    for (const item of menu.branches) {
      if (item.group.length > 0 && item.group !== previousGroup) {
        const groupLabel = ownerDocument.createElement("div");
        groupLabel.className = "workbench-menu__group-label";
        groupLabel.textContent = visibleGroupLabel(item.group, locale);
        groupLabel.dataset.labelZh = item.group;
        groupLabel.setAttribute("role", "presentation");
        popup.append(groupLabel);
        groups.push(groupLabel);
        previousGroup = item.group;
      }
      const button = ownerDocument.createElement("button");
      button.className = "workbench-menu__item";
      button.type = "button";
      button.textContent = visibleBranchLabel(menu.id, item.id, item.label, locale);
      button.dataset.labelZh = item.label;
      button.dataset.menuRoot = menu.id;
      button.dataset.menuBranch = item.id;
      button.dataset.menuBranchKind = item.kind;
      button.setAttribute("role", "menuitem");
      button.tabIndex = -1;
      popup.append(button);
      items.push(button);
    }

    if (direct) root.append(trigger);
    else root.append(trigger, popup);
    navigation.append(root);
    return {
      definition: menu,
      root,
      trigger,
      popup,
      items: Object.freeze(items),
      groups: Object.freeze(groups),
    };
  });

  host.replaceChildren(navigation);
  let openRootId: WorkbenchMenuRootId | null = null;
  let destroyed = false;
  const popupCloseTimers = new Map<WorkbenchMenuRootId, ReturnType<typeof setTimeout>>();

  const mountedFor = (rootId: WorkbenchMenuRootId): MountedMenu => {
    const match = mounted.find((entry) => entry.definition.id === rootId);
    if (match === undefined) throw new RangeError(`未知 Workbench menu：${rootId}`);
    return match;
  };

  const cancelPopupClose = (menu: MountedMenu): void => {
    const timer = popupCloseTimers.get(menu.definition.id);
    if (timer !== undefined) clearTimeout(timer);
    popupCloseTimers.delete(menu.definition.id);
  };

  const prefersReducedMotion = (): boolean =>
    ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

  const renderOpenState = (): void => {
    for (const menu of mounted) {
      const open = menu.definition.id === openRootId;
      menu.trigger.setAttribute("aria-expanded", String(open));
      menu.root.classList.toggle("is-open", open);
      if (open) {
        cancelPopupClose(menu);
        menu.popup.hidden = false;
        menu.popup.dataset.state = "opening";
        continue;
      }
      if (menu.popup.hidden) {
        menu.popup.dataset.state = "closed";
        continue;
      }
      cancelPopupClose(menu);
      menu.popup.dataset.state = "closing";
      if (prefersReducedMotion()) {
        menu.popup.hidden = true;
        menu.popup.dataset.state = "closed";
        continue;
      }
      popupCloseTimers.set(
        menu.definition.id,
        setTimeout(() => {
          popupCloseTimers.delete(menu.definition.id);
          if (destroyed || openRootId === menu.definition.id) return;
          menu.popup.hidden = true;
          menu.popup.dataset.state = "closed";
        }, 90),
      );
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
      if (rootId === "library") {
        options.onSelect?.(Object.freeze({ rootId, branchId: "c-syntax" }));
        close();
        return;
      }
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
      } else if ((event.key === "Enter" || event.key === " ") && rootId === "library") {
        event.preventDefault();
        options.onSelect?.(Object.freeze({ rootId, branchId: "c-syntax" }));
        close();
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

  const renderLocale = (): void => {
    navigation.setAttribute("aria-label", locale === "en" ? "Workbench features" : "工作台功能");
    for (const menu of mounted) {
      const rootLabel = visibleMenuLabel(menu.definition.id, menu.definition.label, locale);
      menu.trigger.textContent = rootLabel;
      menu.popup.setAttribute("aria-label", rootLabel);
      for (const [index, item] of menu.items.entries()) {
        const definition = menu.definition.branches[index];
        if (definition === undefined) continue;
        item.textContent = visibleBranchLabel(
          menu.definition.id,
          definition.id,
          definition.label,
          locale,
        );
      }
      for (const group of menu.groups) {
        group.textContent = visibleGroupLabel(group.dataset.labelZh ?? "", locale);
      }
    }
  };
  const onLocaleChange = (): void => {
    locale = localeHost.dataset.locale === "en" ? "en" : "zh-CN";
    renderLocale();
  };

  navigation.addEventListener("click", onNavigationClick);
  navigation.addEventListener("keydown", onNavigationKeydown);
  ownerDocument.addEventListener("pointerdown", onDocumentPointerDown);
  localeHost.addEventListener("workbench-locale-change", onLocaleChange);

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
      for (const timer of popupCloseTimers.values()) clearTimeout(timer);
      popupCloseTimers.clear();
      navigation.removeEventListener("click", onNavigationClick);
      navigation.removeEventListener("keydown", onNavigationKeydown);
      ownerDocument.removeEventListener("pointerdown", onDocumentPointerDown);
      localeHost.removeEventListener("workbench-locale-change", onLocaleChange);
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
    throw new TypeError("Dock 必须严格包含设置、积木、Library、布局四个根菜单");
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

function visibleMenuLabel(
  rootId: WorkbenchMenuRootId,
  fallback: string,
  locale: InterfaceLocale,
): string {
  return locale === "en"
    ? (ENGLISH_LABELS[`root:${rootId}`] ?? englishFallback(fallback, rootId))
    : fallback;
}

function visibleBranchLabel(
  rootId: WorkbenchMenuRootId,
  branchId: string,
  fallback: string,
  locale: InterfaceLocale,
): string {
  return locale === "en"
    ? (ENGLISH_LABELS[`${rootId}:${branchId}`] ?? englishFallback(fallback, branchId))
    : fallback;
}

function visibleGroupLabel(label: string, locale: InterfaceLocale): string {
  return locale === "en" ? englishFallback(label, "extensions") : label;
}

export function workbenchMenuLabel(rootId: WorkbenchMenuRootId, locale: InterfaceLocale): string {
  const definition = WORKBENCH_MENU_DEFINITIONS.find((item) => item.id === rootId);
  if (definition === undefined) return rootId;
  return visibleMenuLabel(rootId, definition.label, locale);
}

export function workbenchMenuBranchLabel(
  rootId: WorkbenchMenuRootId,
  branchId: string,
  locale: InterfaceLocale,
): string {
  const definition = WORKBENCH_MENU_DEFINITIONS.find((item) => item.id === rootId);
  const branchDefinition = definition?.branches.find((item) => item.id === branchId);
  return visibleBranchLabel(rootId, branchId, branchDefinition?.label ?? branchId, locale);
}

function englishFallback(label: string, id: string): string {
  if (!/[\p{Script=Han}]/u.test(label)) return label;
  return id
    .split(/[-_.]/u)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
