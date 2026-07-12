import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CParser } from "../../src/core/index.js";
import type { FlowNode, FlowProjection } from "../../src/flow/index.js";
import {
  flowLearningObservationsForDraftCommit,
  type FlowLearningDraftCommitCandidate,
} from "../../src/app/flow-workbench-controller.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import type { FlowCanvasDraftConnectionIntent } from "../../src/ui/flow-canvas.js";
import { createTestParser } from "../core/parser-fixture.js";
import { analyzeFlowFixture } from "../flow/fixture.js";

describe("flow guided-lesson observations", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("reports a preset insertion and its connection only after every source gate passes", () => {
    const source = "int f(void) {\n  int value = 1;\n  return value;\n}\n";
    const projection = analyzeFlowFixture(parser, source).projection;
    const intent = presetIntent(projection, nodeBySource(projection, "return value;"));
    const resultingSourceFingerprint = fingerprintSource(
      "int f(void) {\n  int value = 1;\n  value++;\n  return value;\n}\n",
    );

    const observations = flowLearningObservationsForDraftCommit({
      workspaceId: "workspace:tutorial",
      beforeProjection: projection,
      intent,
      resultingSourceFingerprint,
      committed: true,
      roundtripAccepted: true,
      cfgAccepted: true,
    });

    expect(observations).toEqual([
      {
        type: "preset-inserted",
        workspaceId: "workspace:tutorial",
        presetId: "builtin.search.update-maximum",
        sourceFingerprint: resultingSourceFingerprint,
        committed: true,
        roundtripAccepted: true,
        cfgAccepted: true,
      },
      {
        type: "connection-committed",
        workspaceId: "workspace:tutorial",
        presetId: "builtin.search.update-maximum",
        sourceFingerprint: resultingSourceFingerprint,
        roundtripAccepted: true,
        cfgAccepted: true,
      },
    ]);
    expect(Object.isFrozen(observations)).toBe(true);
    expect(observations.every(Object.isFrozen)).toBe(true);
  });

  it("emits nothing for drafts, cancelled or failed gates, stale source, or absent workspace", () => {
    const source = "int f(void) {\n  return 0;\n}\n";
    const projection = analyzeFlowFixture(parser, source).projection;
    const intent = presetIntent(projection, nodeBySource(projection, "return 0;"));
    const base = candidate(projection, intent);

    const rejected: readonly FlowLearningDraftCommitCandidate[] = [
      { ...base, committed: false },
      { ...base, roundtripAccepted: false },
      { ...base, cfgAccepted: false },
      { ...base, workspaceId: null },
      { ...base, resultingSourceFingerprint: projection.sourceFingerprint },
      { ...base, intent: { ...intent, sourceFingerprint: "stale" } },
      { ...base, intent: { ...intent, presetId: null } },
      { ...base, intent: { ...intent, sourceText: null } },
    ];

    for (const entry of rejected) {
      expect(flowLearningObservationsForDraftCommit(entry)).toEqual([]);
    }
  });

  it("fails closed when any source region is raw or any CFG is partial", () => {
    const partial = analyzeFlowFixture(
      parser,
      "int f(void) {\n  goto missing;\n  return 0;\n}\n",
    ).projection;
    expect(
      flowLearningObservationsForDraftCommit(
        candidate(partial, presetIntent(partial, nodeBySource(partial, "return 0;"))),
      ),
    ).toEqual([]);

    const raw = analyzeFlowFixture(
      parser,
      "__attribute__((unused)) int extended(void) { return 1; }\n" +
        "int main(void) { return 0; }\n",
    ).projection;
    expect(raw.nodes.some((node) => node.kind === "raw")).toBe(true);
    expect(
      flowLearningObservationsForDraftCommit(
        candidate(raw, presetIntent(raw, nodeBySource(raw, "return 0;"))),
      ),
    ).toEqual([]);
  });
});

function candidate(
  projection: FlowProjection,
  intent: FlowCanvasDraftConnectionIntent,
): FlowLearningDraftCommitCandidate {
  return {
    workspaceId: "workspace:tutorial",
    beforeProjection: projection,
    intent,
    resultingSourceFingerprint: fingerprintSource(`${String(projection.sourceLength)} changed`),
    committed: true,
    roundtripAccepted: true,
    cfgAccepted: true,
  };
}

function presetIntent(
  projection: FlowProjection,
  target: FlowNode,
): FlowCanvasDraftConnectionIntent {
  const port = target.ports.find(
    (candidate) => candidate.direction === "input" && candidate.channel === "control",
  );
  return Object.freeze({
    sourceFingerprint: projection.sourceFingerprint,
    draftNodeId: "draft:maximum-update",
    draftPortId: "draft:maximum-update:next",
    presetId: "builtin.search.update-maximum",
    sourceText: "if (value > maximum) { maximum = value; }",
    toNodeId: target.id,
    toPortId: port?.id ?? "missing-input",
    edgeKind: "next",
  });
}

function nodeBySource(projection: FlowProjection, sourceText: string): FlowNode {
  const node = projection.nodes.find((candidate) => candidate.sourceText.trim() === sourceText);
  if (node === undefined) throw new Error(`fixture 缺少节点：${sourceText}`);
  return node;
}
