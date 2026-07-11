import { runMilestone } from "./milestone-runner.mjs";

await runMilestone(
  "M7",
  Object.freeze([
    ["TypeScript", ["run", "typecheck"]],
    ["架构边界", ["run", "deps:check"]],
    [
      "合法连线、真实 Trace、案例与运行证据",
      [
        "exec",
        "vitest",
        "run",
        "tests/flow/connections.test.ts",
        "tests/app/flow-source-editor.test.ts",
        "tests/app/flow-draft-connection.test.ts",
        "tests/app/trace-controller.test.ts",
        "tests/app/trace-flow-projection.test.ts",
        "tests/app/virtual-flow-overlay.test.ts",
        "tests/app/runtime-workspace-controller.test.ts",
        "tests/app/scenario-workbench-controller.test.ts",
        "tests/runner",
        "tests/runtime",
        "tests/scenarios",
      ],
    ],
  ]),
);
