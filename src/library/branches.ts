import type { LibraryBranchDefinition, LibraryBranchId } from "./contracts.js";

export const LIBRARY_BRANCHES: readonly LibraryBranchDefinition[] = Object.freeze([
  branch("manual", "完整软件手册", "项目、源码、积木、面板和本地文件的完整操作边界。", 0),
  branch("canvas-wires", "画布与连线", "自由节点、控制端口、草稿和源码权威连线规则。", 10),
  branch("execution-diagnostics", "运行与诊断", "编译、真实执行、轨迹、资源指标与诊断解释。", 20),
  branch("c-syntax", "C 语法词典", "本科阶段常用 C 语法、类型、作用域与内存语义。", 30),
  branch("standard-library", "标准库词典", "常用标准头文件、函数族、前置条件与失败处理。", 40),
  branch(
    "data-structure-dictionary",
    "数据结构词典",
    "线性结构、树、图、哈希和集合结构的实现与取舍。",
    50,
  ),
  branch("algorithms-complexity", "算法与复杂度", "搜索、排序、图算法、设计范式和渐近复杂度。", 60),
  branch("examples", "案例与情景", "从输入、实现、运行到复杂度检查的完整小型案例。", 70),
  branch("recovery", "故障与恢复", "解析失败、过期快照、运行限制和磁盘冲突的恢复路径。", 80),
  branch("extension-api", "扩展开发文档", "工作台注册表的静态贡献接口、冲突规则和安全边界。", 90),
  branch("onboarding", "新手引导", "按真实界面顺序完成第一次项目、搭建、运行和复盘。", 100),
]);

export const LIBRARY_BRANCH_IDS: ReadonlySet<LibraryBranchId> = new Set(
  LIBRARY_BRANCHES.map((branchDefinition) => branchDefinition.id),
);

const BRANCH_ALIASES: Readonly<Record<string, LibraryBranchId>> = Object.freeze({
  "library.manual": "manual",
  "library.canvas": "canvas-wires",
  canvas: "canvas-wires",
  "library.execution": "execution-diagnostics",
  execution: "execution-diagnostics",
  "library.c-syntax": "c-syntax",
  "library.standard": "standard-library",
  standard: "standard-library",
  "library.data-structures": "data-structure-dictionary",
  "data-structures": "data-structure-dictionary",
  "library.algorithms": "algorithms-complexity",
  algorithms: "algorithms-complexity",
  "library.scenarios": "examples",
  scenarios: "examples",
  "library.recovery": "recovery",
  "library.extensions": "extension-api",
  extensions: "extension-api",
  "library.onboarding": "onboarding",
});

export function resolveLibraryBranchId(value: string): LibraryBranchId | null {
  if (LIBRARY_BRANCH_IDS.has(value as LibraryBranchId)) return value as LibraryBranchId;
  return BRANCH_ALIASES[value] ?? null;
}

function branch(
  id: LibraryBranchId,
  label: string,
  description: string,
  order: number,
): LibraryBranchDefinition {
  return Object.freeze({ id, label, description, order });
}
