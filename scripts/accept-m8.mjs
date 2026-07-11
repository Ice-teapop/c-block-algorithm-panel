import { runMilestone } from "./milestone-runner.mjs";

await runMilestone(
  "M8",
  Object.freeze([
    ["TypeScript", ["run", "typecheck"]],
    ["架构边界", ["run", "deps:check"]],
    [
      "预设、Library、本地导师、扩展注册表与引导",
      [
        "exec",
        "vitest",
        "run",
        "tests/learning",
        "tests/library",
        "tests/mentor",
        "tests/onboarding",
        "tests/ui/onboarding-tour.test.ts",
        "tests/ui/software-library.test.ts",
        "tests/workbench/registry.test.ts",
        "tests/electron/learning-catalog-store.test.ts",
        "tests/app/learning-catalog-disk-storage.test.ts",
      ],
    ],
  ]),
);
