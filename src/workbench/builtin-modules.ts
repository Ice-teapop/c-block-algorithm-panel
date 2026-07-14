import type { WorkbenchModuleDefinition } from "./contracts.js";
import { WorkbenchModuleRegistry } from "./registry.js";

export const BUILTIN_WORKBENCH_MODULES: readonly WorkbenchModuleDefinition[] = Object.freeze([
  builtinNavigationModule(),
  builtinInspectorModule({
    moduleId: "builtin.inspector.explanation",
    moduleLabel: "代码解释",
    capability: "inspector.explanation",
    viewId: "explanation",
    viewLabel: "解释",
    order: 10,
  }),
  builtinInspectorModule({
    moduleId: "builtin.inspector.editing",
    moduleLabel: "结构化编辑",
    capability: "inspector.editing",
    viewId: "edit",
    viewLabel: "编辑",
    order: 20,
  }),
  builtinInspectorModule({
    moduleId: "builtin.inspector.execution",
    moduleLabel: "代码运行",
    capability: "inspector.execution",
    viewId: "run",
    viewLabel: "运行",
    order: 30,
  }),
]);

function builtinNavigationModule(): WorkbenchModuleDefinition {
  return Object.freeze({
    manifest: Object.freeze({
      id: "builtin.navigation",
      version: "1.0.0",
      label: "工作台导航",
      capabilities: Object.freeze(["navigation.dock", "navigation.pages"]),
    }),
    inspectorViews: Object.freeze([]),
    dockGroups: Object.freeze([
      Object.freeze({ id: "home", label: "文件", order: 0 }),
      Object.freeze({ id: "core", label: "构建", order: 10 }),
      Object.freeze({ id: "inspect", label: "检查", order: 20 }),
      Object.freeze({ id: "execute", label: "执行", order: 30 }),
      Object.freeze({ id: "learn", label: "学习", order: 40 }),
    ]),
    dockMenus: Object.freeze([
      menu("settings", "设置", 0, [
        ["settings.general", "通用", "general"],
        ["settings.ai-privacy", "AI 助手", "ai-privacy"],
        ["settings.shortcuts", "快捷键", "keyboard"],
        ["settings.about", "关于", "about-logs"],
      ]),
      menu("presets", "积木", 10, [
        ["presets.search", "搜索", "search"],
        ["presets.flow-c-basics", "流程与 C 基础", "flow-c-basics"],
        ["presets.data-memory", "数据与内存", "data-memory"],
        ["presets.algorithms", "算法模式", "algorithm-patterns"],
        ["presets.custom", "自定义", "custom-lifecycle"],
      ]),
      menu("library", "Library", 20, [
        ["library.c-syntax", "语法", "c-syntax"],
        ["library.standard", "标准库", "standard-library"],
        ["library.data-structures", "数据结构", "data-structure-dictionary"],
        ["library.algorithms", "算法", "algorithms-complexity"],
        ["library.scenarios", "案例", "examples"],
        ["library.manual", "帮助", "manual"],
      ]),
      menu("panels", "布局", 30, [
        ["layouts.build", "搭建", "build"],
        ["layouts.debug", "调试", "debug"],
        ["layouts.analyze", "分析", "analyze"],
        ["layouts.minimal", "专注画布", "minimal"],
        ["layouts.reset", "恢复尺寸", "reset-layout"],
      ]),
    ]),
    panels: Object.freeze([
      panel("project", "项目浏览器", "left", 0, true),
      panel("presets", "预设块", "left", 10, true),
      panel("canvas", "自由画布", "center", 0, true),
      panel("code", "C 代码", "right", 0, true),
      panel("properties", "属性与解释", "right", 10, true),
      panel("flow", "运行流程", "bottom", 0, true),
      panel("metrics", "运行指标", "bottom", 10, true),
      panel("ai-hints", "本地检查", "bottom", 20, true),
      panel("library", "Library", "floating", 0, false),
    ]),
    layoutPresets: Object.freeze([
      layout("learn", "学习", 0, [
        "project",
        "presets",
        "canvas",
        "code",
        "properties",
        "ai-hints",
      ]),
      layout("build", "搭建", 10, ["presets", "canvas", "code", "properties", "flow", "ai-hints"]),
      layout("debug", "调试", 20, ["project", "canvas", "code", "flow"]),
      layout("analyze", "分析", 30, ["canvas", "code", "flow", "metrics", "ai-hints"]),
      layout("minimal", "极简", 40, ["canvas", "code"]),
    ]),
    pages: Object.freeze([
      Object.freeze({ id: "dashboard", label: "Dashboard", groupId: "home", order: 0 }),
      Object.freeze({ id: "build", label: "搭建", groupId: "core", order: 10 }),
      Object.freeze({ id: "analysis", label: "分析", groupId: "core", order: 20 }),
      Object.freeze({ id: "block-library", label: "积木管理", groupId: "core", order: 30 }),
      Object.freeze({ id: "explanation", label: "解释", groupId: "inspect", order: 10 }),
      Object.freeze({ id: "edit", label: "编辑", groupId: "inspect", order: 20 }),
      Object.freeze({ id: "run", label: "运行", groupId: "execute", order: 10 }),
      Object.freeze({ id: "software-library", label: "Library", groupId: "learn", order: 10 }),
    ]),
    commands: Object.freeze([
      command("navigation.projects", "项目", 0),
      command("navigation.workspace", "工作区", 10),
      command("navigation.analysis", "分析界面", 20),
      command("navigation.library", "Library", 30),
      command("source.open", "打开 C 文件", 40),
      command("source.paste", "粘贴源码", 50),
      command("settings.general", "设置：通用", 100),
      command("settings.ai", "设置：AI 助手", 110),
      command("settings.shortcuts", "设置：快捷键", 120),
      command("settings.about", "设置：关于", 130),
      command("panel.presets", "定位预设块", 200),
      command("panel.canvas", "定位自由画布", 210),
      command("panel.code", "定位 C 代码", 220),
      command("panel.runtime", "定位运行面板", 230),
      command("panel.metrics", "定位运行指标", 240),
      command("panel.mentor", "定位本地检查", 250),
      command("layout.build", "布局：搭建", 300),
      command("layout.debug", "布局：调试", 310),
      command("layout.analyze", "布局：分析", 320),
      command("layout.focus", "布局：专注画布", 330),
      command("layout.reset", "布局：恢复尺寸", 340),
    ]),
    algorithmElements: Object.freeze([]),
  });
}

export function registerBuiltinWorkbenchModules(
  registry: WorkbenchModuleRegistry,
): WorkbenchModuleRegistry {
  registry.registerAll(BUILTIN_WORKBENCH_MODULES);
  return registry;
}

export function createBuiltinWorkbenchRegistry(): WorkbenchModuleRegistry {
  return registerBuiltinWorkbenchModules(new WorkbenchModuleRegistry());
}

interface BuiltinInspectorModuleInput {
  readonly moduleId: string;
  readonly moduleLabel: string;
  readonly capability: string;
  readonly viewId: string;
  readonly viewLabel: string;
  readonly order: number;
}

function builtinInspectorModule(input: BuiltinInspectorModuleInput): WorkbenchModuleDefinition {
  return Object.freeze({
    manifest: Object.freeze({
      id: input.moduleId,
      version: "1.0.0",
      label: input.moduleLabel,
      capabilities: Object.freeze([input.capability]),
    }),
    inspectorViews: Object.freeze([
      Object.freeze({ id: input.viewId, label: input.viewLabel, order: input.order }),
    ]),
    dockGroups: Object.freeze([]),
    dockMenus: Object.freeze([]),
    panels: Object.freeze([]),
    layoutPresets: Object.freeze([]),
    pages: Object.freeze([]),
    commands: Object.freeze([]),
    algorithmElements: Object.freeze([]),
  });
}

type MenuBranchTuple = readonly [id: string, label: string, actionId: string];

function menu(
  id: string,
  label: string,
  order: number,
  branches: readonly MenuBranchTuple[],
): NonNullable<WorkbenchModuleDefinition["dockMenus"]>[number] {
  return Object.freeze({
    id,
    label,
    order,
    branches: Object.freeze(
      branches.map(([branchId, branchLabel, actionId], index) =>
        Object.freeze({ id: branchId, label: branchLabel, actionId, order: index * 10 }),
      ),
    ),
  });
}

function panel(
  id: string,
  label: string,
  region: "left" | "center" | "right" | "bottom" | "floating",
  order: number,
  defaultVisible: boolean,
): NonNullable<WorkbenchModuleDefinition["panels"]>[number] {
  return Object.freeze({ id, label, region, order, defaultVisible });
}

function layout(
  id: string,
  label: string,
  order: number,
  panelIds: readonly string[],
): NonNullable<WorkbenchModuleDefinition["layoutPresets"]>[number] {
  return Object.freeze({ id, label, order, panelIds: Object.freeze([...panelIds]) });
}

function command(
  id: string,
  label: string,
  order: number,
): NonNullable<WorkbenchModuleDefinition["commands"]>[number] {
  return Object.freeze({ id, label, order });
}
