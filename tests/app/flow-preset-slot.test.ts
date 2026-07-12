import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planFlowPresetSlotReplacement } from "../../src/app/flow-preset-slot.js";
import type { CParser } from "../../src/core/index.js";
import {
  FIRST_ALGORITHM_SKELETON_SOURCE,
  MAXIMUM_UPDATE_PRESET_ID,
} from "../../src/tutorials/first-lesson.js";
import { FIRST_ALGORITHM_SOURCE } from "../../src/tutorials/first-algorithm.js";
import type { FlowCanvasDraftConnectionIntent } from "../../src/ui/flow-canvas.js";
import { createTestParser } from "../core/parser-fixture.js";
import { analyzeFlowFixture } from "../flow/fixture.js";

describe("explicit preset completion slot", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => parser.dispose());

  it("replaces only the named compiling slot and reconstructs the canonical lesson source", () => {
    const projection = analyzeFlowFixture(parser, FIRST_ALGORITHM_SKELETON_SOURCE).projection;
    const target = projection.nodes.find((node) => node.sourceText.trim() === ";");
    const port = target?.ports.find(
      (candidate) =>
        candidate.direction === "input" && candidate.channel === "control" && candidate.editable,
    );
    if (target === undefined || port === undefined) throw new Error("课程骨架缺少补全插槽节点");
    const intent: FlowCanvasDraftConnectionIntent = Object.freeze({
      sourceFingerprint: projection.sourceFingerprint,
      draftNodeId: "draft:update-maximum",
      draftPortId: "draft:update-maximum:next",
      presetId: MAXIMUM_UPDATE_PRESET_ID,
      sourceText: "if (value > maximum) {\n  maximum = value;\n}",
      toNodeId: target.id,
      toPortId: port.id,
      edgeKind: "next",
    });

    const plan = planFlowPresetSlotReplacement(FIRST_ALGORITHM_SKELETON_SOURCE, projection, intent);

    expect(plan?.candidateSource).toBe(FIRST_ALGORITHM_SOURCE);
  });

  it("ignores ordinary comments and rejects a gesture aimed at another node", () => {
    const projection = analyzeFlowFixture(parser, FIRST_ALGORITHM_SKELETON_SOURCE).projection;
    const target = projection.nodes.find((node) => node.sourceText.includes("printf"));
    const port = target?.ports.find((candidate) => candidate.direction === "input");
    if (target === undefined || port === undefined) throw new Error("fixture 缺少错误目标");
    expect(() =>
      planFlowPresetSlotReplacement(FIRST_ALGORITHM_SKELETON_SOURCE, projection, {
        sourceFingerprint: projection.sourceFingerprint,
        draftNodeId: "draft:update-maximum",
        draftPortId: "draft:update-maximum:next",
        presetId: MAXIMUM_UPDATE_PRESET_ID,
        sourceText: "if (value > maximum) { maximum = value; }",
        toNodeId: target.id,
        toPortId: port.id,
        edgeKind: "next",
      }),
    ).toThrow(/对应补全插槽/u);
  });
});
