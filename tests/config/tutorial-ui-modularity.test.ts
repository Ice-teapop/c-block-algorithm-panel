import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const modules = Object.freeze([
  ["foa-data-flow-demo.ts", 900],
  ["foa-data-flow-demo-presentation.ts", 500],
  ["foa-data-flow-demo-geometry.ts", 500],
  ["foa-task-lesson-contracts.ts", 120],
  ["foa-source-block-descriptors.ts", 160],
] as const);

function uiSource(file: string): string {
  return readFileSync(new URL(`../../src/ui/${file}`, import.meta.url), "utf8");
}

describe("tutorial UI module boundaries", () => {
  it("keeps the newly separated responsibilities within their line budgets", () => {
    for (const [file, limit] of modules) {
      const physicalLines = uiSource(file).trimEnd().split(/\r?\n/u).length;
      expect(physicalLines, file).toBeLessThanOrEqual(limit);
    }
  });

  it("keeps presentation and geometry independent from the stateful controller", () => {
    const controller = uiSource("foa-data-flow-demo.ts");
    const presentation = uiSource("foa-data-flow-demo-presentation.ts");
    const geometry = uiSource("foa-data-flow-demo-geometry.ts");

    expect(controller).toContain('from "./foa-data-flow-demo-presentation.js"');
    expect(controller).toContain('from "./foa-data-flow-demo-geometry.js"');
    expect(presentation).toContain('from "./foa-data-flow-demo-geometry.js"');
    expect(presentation).not.toContain('from "./foa-data-flow-demo.js"');
    expect(geometry).not.toContain("foa-data-flow-demo-presentation");
    expect(geometry).not.toContain('from "./foa-data-flow-demo.js"');
  });

  it("keeps contracts and source anchors free of task-stage implementations", () => {
    const contracts = uiSource("foa-task-lesson-contracts.ts");
    const descriptors = uiSource("foa-source-block-descriptors.ts");

    expect(contracts).not.toContain("foa-task-lesson.js");
    expect(contracts).not.toContain("foa-block-task-stage.js");
    expect(descriptors).not.toMatch(/from\s+["'][^"']*foa-(?:task|block|semantic)-/u);
  });
});
