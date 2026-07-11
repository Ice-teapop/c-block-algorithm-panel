import { runMilestone } from "./milestone-runner.mjs";

await runMilestone(
  "M6–M8",
  Object.freeze([
    ["工具链", ["run", "verify:toolchain"]],
    ["格式", ["run", "format:check"]],
    ["全量单元、集成与架构回归", ["test"]],
    ["5000 轮任意 C 无损 mutation fuzz", ["run", "fuzz"]],
    ["生产构建", ["run", "build"]],
    [
      "自由工作台、真实 Trace 与学习面 Electron 回归",
      ["exec", "playwright", "test", "tests/e2e/m6-m8-workbench.spec.ts"],
    ],
  ]),
);
