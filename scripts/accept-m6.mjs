import { runMilestone } from "./milestone-runner.mjs";

await runMilestone(
  "M6",
  Object.freeze([
    ["TypeScript", ["run", "typecheck"]],
    ["架构边界", ["run", "deps:check"]],
    [
      "源码投影、自由画布、面板布局与 sidecar",
      [
        "exec",
        "vitest",
        "run",
        "tests/flow/projection.test.ts",
        "tests/flow/view-state.test.ts",
        "tests/ui/flow-canvas-m6.test.ts",
        "tests/ui/resizable-layout-m6.test.ts",
        "tests/ui/workbench-menu-m6.test.ts",
        "tests/ui/workbench-shell.test.ts",
        "tests/ui/workspace-dashboard.test.ts",
        "tests/app/workspace-sidecar-persistence.test.ts",
      ],
    ],
  ]),
);
