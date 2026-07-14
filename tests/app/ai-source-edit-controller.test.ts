import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAiSourceEditController,
  type AiSourceEditBinding,
} from "../../src/app/ai-source-edit-controller.js";
import {
  analyzeProgramSnapshot,
  type ReadySession,
} from "../../src/app/program-analysis-session.js";
import {
  applyTextPatches,
  createBlockIndex,
  type CAnalysisSnapshot,
  type CParser,
  type TextPatch,
} from "../../src/core/index.js";
import { createFlowProjection, type FlowProjection } from "../../src/flow/index.js";
import type { AiEditPermission, AiSourceEditProposal } from "../../src/shared/ai-edit.js";
import type { ImportedSource } from "../../src/shared/api.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import { createTestParser } from "../core/parser-fixture.js";

const SOURCE = ["int main(void) {", "  int value = 0;", "  value++;", "  return 0;", "}", ""].join(
  "\n",
);

describe("AI source edit controller", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => parser.dispose());

  it("requires review confirmation, then commits one exact validated transaction", async () => {
    const harness = createHarness(parser, SOURCE, "review");
    const planned = harness.controller.plan(returnProposal(), harness.binding());
    expect(planned.status).toBe("planned");
    if (planned.status !== "planned") throw new Error(planned.message);
    expect(planned.plan.diffSummary).toMatch(/1 处替换/u);

    const result = await harness.controller.apply(planned.plan);
    expect(result).toMatchObject({ status: "applied", workspaceId: "workspace-1" });
    expect(harness.confirm).toHaveBeenCalledOnce();
    expect(harness.applyPatches).toHaveBeenCalledOnce();
    expect(harness.source()).toContain("return 1;");
    expect(harness.session().analysis.document.parse.hasError).toBe(false);
    expect(harness.projection().functions.every((fn) => !fn.partial)).toBe(true);
  });

  it("keeps read-only mode inert and lets agent mode apply without a confirmation", async () => {
    const readOnly = createHarness(parser, SOURCE, "read-only");
    const reviewPlan = readOnly.controller.plan(returnProposal(), readOnly.binding());
    if (reviewPlan.status !== "planned") throw new Error(reviewPlan.message);
    await expect(readOnly.controller.apply(reviewPlan.plan)).resolves.toMatchObject({
      status: "rejected",
      code: "read-only",
    });
    expect(readOnly.source()).toBe(SOURCE);
    expect(readOnly.confirm).not.toHaveBeenCalled();

    const agent = createHarness(parser, SOURCE, "agent");
    const agentPlan = agent.controller.plan(returnProposal(), agent.binding());
    if (agentPlan.status !== "planned") throw new Error(agentPlan.message);
    await expect(agent.controller.apply(agentPlan.plan)).resolves.toMatchObject({
      status: "applied",
    });
    expect(agent.confirm).not.toHaveBeenCalled();
    expect(agent.source()).toContain("return 1;");
  });

  it("rejects stale snapshots and non-unique expectedText anchors", () => {
    const harness = createHarness(parser, SOURCE, "review");
    expect(
      harness.controller.plan(returnProposal(), {
        ...harness.binding(),
        sourceFingerprint: fingerprintSource(`${SOURCE}\n`),
      }),
    ).toMatchObject({ status: "rejected", code: "stale-source" });
    expect(
      harness.controller.plan(proposal("ambiguous", "value", "item"), harness.binding()),
    ).toMatchObject({ status: "rejected", code: "ambiguous-anchor" });
    expect(harness.source()).toBe(SOURCE);
  });

  it("rejects raw and partial CFG regions before applying any patch", () => {
    const rawSource = "#define APPLY(x) ((x) + 1)\nint main(void) { return APPLY(0); }\n";
    const raw = createHarness(parser, rawSource, "agent");
    expect(
      raw.controller.plan(
        proposal("macro", "#define APPLY(x) ((x) + 1)", "#define APPLY(x) ((x) + 2)"),
        raw.binding(),
      ),
    ).toMatchObject({ status: "rejected", code: "locked-region" });

    const partialSource = "int main(void) {\n  goto missing;\n  return 0;\n}\n";
    const partial = createHarness(parser, partialSource, "agent");
    expect(partial.projection().functions.some((fn) => fn.partial)).toBe(true);
    expect(partial.controller.plan(returnProposal(), partial.binding())).toMatchObject({
      status: "rejected",
      code: "locked-region",
    });
  });

  it("rejects candidates that degrade a complete CFG", () => {
    const harness = createHarness(parser, SOURCE, "agent");
    expect(
      harness.controller.plan(
        proposal("break CFG", "return 0;", "goto missing;"),
        harness.binding(),
      ),
    ).toMatchObject({ status: "rejected", code: "cfg-regression" });
    expect(harness.applyPatches).not.toHaveBeenCalled();
  });
});

function returnProposal(): AiSourceEditProposal {
  return proposal("修正返回值", "return 0;", "return 1;");
}

function proposal(summary: string, expectedText: string, newText: string): AiSourceEditProposal {
  return Object.freeze({
    schemaVersion: 1,
    summary,
    replacements: Object.freeze([Object.freeze({ expectedText, newText })]),
  });
}

function createHarness(
  parser: CParser,
  initialSource: string,
  initialPermission: AiEditPermission,
) {
  let source = initialSource;
  let revision = 1;
  let session = analyzeSession(parser, source, revision);
  let projection = createFlowProjection(session.programAnalysis, session.analysis.document);
  let permission = initialPermission;
  const confirm = vi.fn(() => true);
  const applyPatches = vi.fn((patches: readonly TextPatch[]) => {
    source = applyTextPatches(source, patches).source;
    return true;
  });
  const controller = createAiSourceEditController({
    getPermission: () => permission,
    getWorkspaceId: () => "workspace-1",
    getSession: () => session,
    getProjection: () => projection,
    getParser: () => parser,
    getProjectionMode: () => "synced",
    getEditorSource: () => source,
    applyPatches,
    resetProjection: vi.fn(),
    nextRevision: () => ++revision,
    adopt(imported, analysis) {
      session = analyzeSession(parser, imported.source, analysis.editTargets.revision, analysis);
      projection = createFlowProjection(session.programAnalysis, session.analysis.document);
    },
    confirm,
  });
  return {
    controller,
    confirm,
    applyPatches,
    source: () => source,
    session: () => session,
    projection: () => projection,
    setPermission: (next: AiEditPermission) => {
      permission = next;
    },
    binding: (): AiSourceEditBinding => ({
      workspaceId: "workspace-1",
      sourceRevision: session.analysis.editTargets.revision,
      sourceFingerprint: fingerprintSource(source),
    }),
  };
}

function analyzeSession(
  parser: CParser,
  source: string,
  revision: number,
  providedAnalysis?: CAnalysisSnapshot,
): ReadySession {
  const analysis = providedAnalysis ?? parser.analyze(source, revision);
  const blockIndex = createBlockIndex(analysis.document);
  const programAnalysis = analyzeProgramSnapshot(
    parser,
    source,
    analysis.editTargets.revision,
    blockIndex.entries.length,
  );
  const imported: ImportedSource = Object.freeze({
    source,
    displayName: "main.c",
    origin: "paste",
  });
  return Object.freeze({ imported, analysis, blockIndex, programAnalysis });
}
