import { runMilestone } from "./milestone-runner.mjs";

await runMilestone(
  "M0–M5 regression",
  Object.freeze([
    ["Node 24 与 clang 工具链", ["run", "verify:toolchain"]],
    ["生产构建（供真实 runner 金样本使用）", ["run", "build"]],
    ["M0 runner 金样本与资源压力", ["run", "verify:samples"]],
    ["M1 任意 C 金样本逐字符往返", ["run", "verify:roundtrip"]],
    ["M3 精确编辑等价矩阵", ["run", "verify:edit-equiv"]],
    ["M4 固定语料、回归与生成性质", ["run", "verify:m4"]],
    ["M4 课程 C 深度生成 fuzz 5000 轮", ["run", "fuzz:m4"]],
    ["M1 mutation fuzz 5000 轮", ["run", "fuzz"]],
  ]),
);
