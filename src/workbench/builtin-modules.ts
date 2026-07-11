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
        ["settings.appearance", "外观", "appearance"],
        ["settings.workspace", "文件与自动保存", "workspace-files"],
        ["settings.canvas", "画布与连线", "canvas-connections"],
        ["settings.runner", "编译与运行", "execution"],
        ["settings.ai-privacy", "AI 与隐私", "ai-privacy"],
        ["settings.shortcuts", "快捷键", "keyboard"],
        ["settings.accessibility", "无障碍", "accessibility"],
        ["settings.about", "版本与日志", "about-logs"],
      ]),
      menu("presets", "预设块", 10, [
        ["presets.recent", "最近与收藏", "recent-favorites"],
        ["presets.flow", "流程控制", "flow-control"],
        ["presets.c-basics", "C 基础", "c-basics"],
        ["presets.functions-io", "函数与 I/O", "functions-io"],
        ["presets.arrays-strings", "数组与字符串", "arrays-strings"],
        ["presets.pointers-memory", "指针与内存", "pointers-memory"],
        ["presets.data-structures", "数据结构", "data-structures"],
        ["presets.algorithms", "算法模式", "algorithm-patterns"],
        ["presets.testing", "测试与分析", "testing-analysis"],
        ["presets.custom", "自定义块生命周期", "custom-lifecycle"],
      ]),
      menu("library", "Library", 20, [
        ["library.manual", "完整软件手册", "manual"],
        ["library.canvas", "画布与连线规则", "canvas-wires"],
        ["library.execution", "运行与诊断", "execution-diagnostics"],
        ["library.c-syntax", "C 语法词典", "c-syntax"],
        ["library.standard", "标准库词典", "standard-library"],
        ["library.data-structures", "数据结构词典", "data-structure-dictionary"],
        ["library.algorithms", "算法与复杂度", "algorithms-complexity"],
        ["library.scenarios", "案例模拟", "examples"],
        ["library.recovery", "故障与恢复", "recovery"],
        ["library.extensions", "扩展开发文档", "extension-api"],
        ["library.onboarding", "新手引导", "onboarding"],
      ]),
      menu("panels", "面板预览", 30, [
        ["panels.project", "项目", "project"],
        ["panels.presets", "预设", "presets"],
        ["panels.canvas", "画布", "canvas"],
        ["panels.code", "代码", "code"],
        ["panels.properties", "属性", "inspector"],
        ["panels.flow", "运行流程", "runtime"],
        ["panels.metrics", "指标", "metrics"],
        ["panels.diagnostics", "诊断", "diagnostics"],
        ["panels.ai-hints", "AI 提示", "mentor"],
        ["panels.library", "Library", "software-library"],
        ["layouts.learn", "学习布局", "learn"],
        ["layouts.build", "搭建布局", "build"],
        ["layouts.debug", "调试布局", "debug"],
        ["layouts.analyze", "分析布局", "analyze"],
        ["layouts.minimal", "极简布局", "minimal"],
        ["layouts.save", "保存当前布局", "save-layout"],
        ["layouts.reset", "恢复默认布局", "reset-layout"],
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
      panel("diagnostics", "诊断", "bottom", 20, false),
      panel("ai-hints", "AI 提示", "bottom", 30, true),
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
      layout("build", "搭建", 10, ["presets", "canvas", "code", "properties", "flow"]),
      layout("debug", "调试", 20, ["project", "canvas", "code", "flow", "diagnostics"]),
      layout("analyze", "分析", 30, ["canvas", "code", "flow", "metrics", "ai-hints"]),
      layout("minimal", "极简", 40, ["canvas", "code"]),
    ]),
    pages: Object.freeze([
      Object.freeze({ id: "dashboard", label: "Dashboard", groupId: "home", order: 0 }),
      Object.freeze({ id: "build", label: "搭建", groupId: "core", order: 10 }),
      Object.freeze({ id: "block-library", label: "积木管理", groupId: "core", order: 20 }),
      Object.freeze({ id: "explanation", label: "解释", groupId: "inspect", order: 10 }),
      Object.freeze({ id: "edit", label: "编辑", groupId: "inspect", order: 20 }),
      Object.freeze({ id: "run", label: "运行", groupId: "execute", order: 10 }),
      Object.freeze({ id: "software-library", label: "Library", groupId: "learn", order: 10 }),
    ]),
    commands: Object.freeze([]),
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
