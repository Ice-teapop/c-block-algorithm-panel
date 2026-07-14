import {
  WORKBENCH_QUICK_OPEN_ACTIVATE_EVENT,
  WORKBENCH_QUICK_OPEN_COLLECT_EVENT,
  WorkbenchCommandRegistry,
  quickOpenItemId,
  type QuickOpenItem,
  type WorkbenchCommandHandler,
  type WorkbenchQuickOpenActivateDetail,
  type WorkbenchQuickOpenCollectDetail,
} from "../commands/index.js";
import {
  createQuickOpen,
  parseQuickOpenQuery,
  type QuickOpenController,
} from "../ui/quick-open.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";
import type { WorkbenchRegistrySnapshot } from "../workbench/contracts.js";

export interface WorkbenchCommandSurfaceOptions {
  readonly elements: WorkbenchElements;
  readonly registrySnapshot: WorkbenchRegistrySnapshot;
}

export interface WorkbenchCommandSurface {
  readonly quickOpen: QuickOpenController;
  destroy(): void;
}

const MAX_EXTERNAL_ITEMS_PER_KIND = 400;
const COMMAND_DETAIL_EN: Readonly<Record<string, string>> = Object.freeze({
  "navigation.projects": "Open local projects and sandboxes",
  "navigation.workspace": "Return to the flow canvas and C source workspace",
  "navigation.analysis": "Open full runtime and complexity analysis",
  "navigation.library": "Open the C and algorithm dictionary",
  "source.open": "Choose and open a local .c file",
  "source.paste": "Paste C source into the workbench",
  "settings.general": "Language, background and theme",
  "settings.ai": "API credential, provider and model",
  "settings.shortcuts": "Review keyboard controls",
  "settings.about": "Version and local log information",
  "panel.presets": "Focus the draggable block library",
  "panel.canvas": "Focus the free node canvas",
  "panel.code": "Focus the exact C source editor",
  "panel.runtime": "Focus scenarios, Trace and run controls",
  "panel.metrics": "Focus runtime metrics",
  "panel.mentor": "Focus local hints and AI chat",
  "layout.build": "Show blocks, canvas, source and runtime",
  "layout.debug": "Emphasize source, path and runtime",
  "layout.analyze": "Emphasize metrics, evidence and analysis",
  "layout.focus": "Keep only the canvas and source",
  "layout.reset": "Restore the default panel sizes",
});

export function createWorkbenchCommandSurface(
  options: WorkbenchCommandSurfaceOptions,
): WorkbenchCommandSurface {
  const { elements, registrySnapshot } = options;
  const commands = new WorkbenchCommandRegistry({
    contributions: registrySnapshot.commands,
    handlers: builtinCommandHandlers(elements),
  });
  let destroyed = false;

  const getItems = (query: string): readonly QuickOpenItem[] => {
    if (destroyed) return Object.freeze([]);
    const english = elements.shell.dataset.locale === "en";
    const items: QuickOpenItem[] = commands.listAvailable().map((command) =>
      Object.freeze({
        id: quickOpenItemId("command", command.id),
        kind: "command" as const,
        targetId: command.id,
        label: english ? (command.labelEn ?? command.label) : command.label,
        detail: english ? (COMMAND_DETAIL_EN[command.id] ?? command.detail) : command.detail,
        keywords: Object.freeze([command.id, command.group, command.moduleId, ...command.keywords]),
        order: command.order,
        shortcut: command.shortcut,
      }),
    );
    const EventConstructor = elements.shell.ownerDocument.defaultView?.CustomEvent;
    if (EventConstructor === undefined) return Object.freeze(items);
    const parsed = parseQuickOpenQuery(query);
    const externalCount = new Map<string, number>();
    const detail: WorkbenchQuickOpenCollectDetail = Object.freeze({
      query: parsed.query,
      scope: parsed.scope,
      add(external: readonly QuickOpenItem[]): void {
        if (destroyed || !Array.isArray(external)) return;
        for (const item of external) {
          if (!validExternalItem(item)) continue;
          const count = externalCount.get(item.kind) ?? 0;
          if (count >= MAX_EXTERNAL_ITEMS_PER_KIND) continue;
          items.push(item);
          externalCount.set(item.kind, count + 1);
        }
      },
    });
    elements.shell.dispatchEvent(
      new EventConstructor(WORKBENCH_QUICK_OPEN_COLLECT_EVENT, { detail }),
    );
    return Object.freeze(items);
  };

  const activate = (item: QuickOpenItem): void => {
    if (destroyed) return;
    if (item.kind === "command") {
      void commands.execute(item.targetId).catch((error: unknown) => {
        elements.importStatus.textContent =
          error instanceof Error ? error.message : `命令执行失败：${String(error)}`;
        elements.importStatus.dataset.state = "error";
      });
      return;
    }
    const EventConstructor = elements.shell.ownerDocument.defaultView?.CustomEvent;
    if (EventConstructor === undefined) return;
    const detail: WorkbenchQuickOpenActivateDetail = Object.freeze({ item });
    elements.shell.dispatchEvent(
      new EventConstructor(WORKBENCH_QUICK_OPEN_ACTIVATE_EVENT, { detail }),
    );
  };

  const quickOpen = createQuickOpen(elements.shell, { getItems, onActivate: activate });
  return Object.freeze({
    quickOpen,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      quickOpen.destroy();
      commands.destroy();
    },
  });
}

function builtinCommandHandlers(elements: WorkbenchElements): readonly WorkbenchCommandHandler[] {
  const showPage = (
    id: string,
    labelEn: string,
    detail: string,
    keywords: readonly string[],
    pageId: string,
  ): WorkbenchCommandHandler =>
    handler(id, "导航", labelEn, detail, keywords, () => {
      elements.showPage(pageId);
      const host = elements.getPageHost(pageId);
      if (!host.hasAttribute("tabindex")) host.tabIndex = -1;
      host.focus({ preventScroll: true });
    });
  const settings = (
    id: string,
    labelEn: string,
    detail: string,
    keywords: readonly string[],
    branchId: string,
  ): WorkbenchCommandHandler =>
    handler(id, "设置", labelEn, detail, keywords, () =>
      elements.executeMenuAction("settings", branchId),
    );
  const focusPanel = (
    id: string,
    labelEn: string,
    detail: string,
    keywords: readonly string[],
    panelId: string,
  ): WorkbenchCommandHandler =>
    handler(id, "面板", labelEn, detail, keywords, () => elements.focusPanel(panelId));
  const layout = (
    id: string,
    labelEn: string,
    detail: string,
    keywords: readonly string[],
    branchId: string,
  ): WorkbenchCommandHandler =>
    handler(id, "布局", labelEn, detail, keywords, () => {
      elements.executeMenuAction("panels", branchId);
      elements.focusPanel("canvas");
    });

  return Object.freeze([
    showPage(
      "navigation.projects",
      "Projects",
      "打开本地项目与沙箱列表",
      ["dashboard", "文件"],
      "dashboard",
    ),
    showPage(
      "navigation.workspace",
      "Workspace",
      "回到自由画布与 C 代码工作区",
      ["build", "搭建"],
      "build",
    ),
    showPage(
      "navigation.analysis",
      "Analysis",
      "打开完整运行与复杂度分析",
      ["analytics", "性能"],
      "analysis",
    ),
    showPage(
      "navigation.library",
      "Library",
      "打开 C 与算法关键词词典",
      ["词典", "教程", "help"],
      "software-library",
    ),
    handler(
      "source.open",
      "源码",
      "Open C File",
      "从本机选择并打开 .c 文件",
      ["import", "文件"],
      () => elements.openButton.click(),
      () => !elements.openButton.disabled,
    ),
    handler(
      "source.paste",
      "源码",
      "Paste Source",
      "粘贴一段 C 源码到工作台",
      ["clipboard", "导入"],
      () => elements.pasteButton.click(),
      () => !elements.pasteButton.disabled,
    ),
    settings(
      "settings.general",
      "Settings: General",
      "语言、背景与主题",
      ["language", "background", "通用"],
      "general",
    ),
    settings(
      "settings.ai",
      "Settings: AI Assistant",
      "API 密钥、厂商与模型",
      ["provider", "model", "密钥"],
      "ai-privacy",
    ),
    settings(
      "settings.shortcuts",
      "Settings: Shortcuts",
      "查看键盘操作",
      ["keyboard", "hotkey"],
      "keyboard",
    ),
    settings(
      "settings.about",
      "Settings: About",
      "版本与本机日志说明",
      ["version", "logs"],
      "about-logs",
    ),
    focusPanel(
      "panel.presets",
      "Focus Preset Blocks",
      "定位可拖拽积木库",
      ["blocks", "palette"],
      "presets",
    ),
    focusPanel(
      "panel.canvas",
      "Focus Flow Canvas",
      "定位自由节点画布",
      ["graph", "nodes"],
      "canvas",
    ),
    focusPanel(
      "panel.code",
      "Focus C Source",
      "定位精确 C 源码编辑器",
      ["editor", "source"],
      "code",
    ),
    focusPanel(
      "panel.runtime",
      "Focus Run Panel",
      "定位案例、Trace 与运行控制",
      ["run", "trace"],
      "runtime",
    ),
    focusPanel(
      "panel.metrics",
      "Focus Metrics",
      "定位运行指标",
      ["performance", "效率"],
      "metrics",
    ),
    focusPanel(
      "panel.mentor",
      "Focus AI Assistant",
      "定位本地检查与 AI 对话",
      ["mentor", "assistant"],
      "mentor",
    ),
    layout(
      "layout.build",
      "Layout: Build",
      "显示积木、画布、代码与运行区",
      ["搭建", "assembly"],
      "build",
    ),
    layout("layout.debug", "Layout: Debug", "突出代码、路径与运行区", ["调试", "trace"], "debug"),
    layout(
      "layout.analyze",
      "Layout: Analyze",
      "突出指标、证据与分析面板",
      ["分析", "metrics"],
      "analyze",
    ),
    layout(
      "layout.focus",
      "Layout: Canvas Focus",
      "只保留画布与代码",
      ["minimal", "专注"],
      "minimal",
    ),
    layout(
      "layout.reset",
      "Layout: Reset Sizes",
      "恢复默认面板尺寸",
      ["restore", "恢复尺寸"],
      "reset-layout",
    ),
  ]);
}

function handler(
  id: string,
  group: string,
  labelEn: string,
  detail: string,
  keywords: readonly string[],
  execute: () => void,
  isAvailable?: () => boolean,
): WorkbenchCommandHandler {
  return Object.freeze({
    id,
    group,
    labelEn,
    detail,
    keywords: Object.freeze([...keywords]),
    shortcut: null,
    ...(isAvailable === undefined ? {} : { isAvailable }),
    execute,
  });
}

function validExternalItem(item: QuickOpenItem): boolean {
  return (
    typeof item === "object" &&
    item !== null &&
    item.kind !== "command" &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.targetId === "string" &&
    typeof item.label === "string" &&
    typeof item.detail === "string" &&
    Array.isArray(item.keywords) &&
    Number.isFinite(item.order)
  );
}
