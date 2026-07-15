import { describe, expect, it, vi } from "vitest";
import type { ProgramAnalysisSnapshot } from "../../src/analysis/index.js";
import {
  createEvidenceWorkspaceController,
  parseRunToolchainIdentity,
} from "../../src/app/evidence-workspace-controller.js";
import { textRange } from "../../src/core/index.js";
import type { RunHistoryDocument } from "../../src/runtime/index.js";
import type { Capabilities, CompileResult, RunResult } from "../../src/shared/api.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import type {
  SaveWorkspaceSidecarRequest,
  WorkspaceSidecarSaveResult,
} from "../../src/shared/workspace-sidecar.js";
import type { ManualRunScenario, RunPanelCompletion } from "../../src/ui/run-panel.js";

const SOURCE = '#include <stdio.h>\nint main(void) { puts("ok"); return 0; }\n';
const SOURCE_FINGERPRINT = fingerprintSource(SOURCE);

describe("evidence workspace controller", () => {
  it("persists only the newest 100 real runs and renders independent comparable evidence", async () => {
    const harness = createHarness();
    let id = 0;
    const controller = createEvidenceWorkspaceController({
      ...harness.options,
      delayMs: 60_000,
      idFactory: () => `run-${String(id++).padStart(3, "0")}`,
      now: () => new Date("2026-07-12T00:00:00.000Z"),
    });
    await controller.setWorkspaceEntry("project-a", SOURCE_FINGERPRINT);

    for (let index = 0; index < 101; index += 1) {
      controller.recordRun(completion({ durationMs: index + 1, operationCount: index + 2 }));
    }
    await controller.flush();

    expect(harness.save).toHaveBeenCalledOnce();
    const request = harness.save.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      entryId: "project-a",
      kind: "run-history",
      sourceFingerprint: SOURCE_FINGERPRINT,
    });
    const history = JSON.parse(request?.serialized ?? "null") as RunHistoryDocument;
    expect(history.entries).toHaveLength(100);
    expect(history.entries[0]?.id).toBe("run-001");
    expect(history.entries.at(-1)?.id).toBe("run-100");
    expect(history.entries[0]?.toolchain).toEqual({
      compiler: "Apple clang",
      compilerVersion: "21.0.0",
      target: "unknown",
      runnerVersion: "unknown",
    });
    expect(flatText(harness.metricsHost)).toContain("成功样本 100");
    expect(flatText(harness.metricsHost)).toContain("实测不等于 Big-O");
    expect(flatText(harness.metricsHost)).not.toContain("效率分数");
    await controller.destroy();
  });

  it("shows compile failure and simulation but never persists either as performance", async () => {
    const harness = createHarness();
    const controller = createEvidenceWorkspaceController({
      ...harness.options,
      delayMs: 60_000,
      idFactory: () => "run-never-persisted",
      now: () => new Date("2026-07-12T00:00:00.000Z"),
    });
    await controller.setWorkspaceEntry("project-a", SOURCE_FINGERPRINT);

    controller.recordRun(
      completion({
        compileResult: {
          ok: false,
          diagnostics: "error",
          compileDurationMs: 4,
          error: { code: "COMPILE_FAILED", message: "syntax" },
        },
        runResult: null,
      }),
    );
    expect(flatText(harness.metricsHost)).toContain("编译未通过");
    expect(flatText(harness.metricsHost)).toContain("4 ms");

    controller.recordRun(
      completion({
        scenario: scenario("simulation"),
      }),
    );
    await controller.flush();
    expect(harness.save).not.toHaveBeenCalled();
    expect(flatText(harness.metricsHost)).toContain("教学模拟结果仅用于回放");
    expect(flatText(harness.metricsHost)).toContain("无可比证据");
    await controller.destroy();
  });

  it("renders source-aligned local hints and delegates node location", async () => {
    const harness = createHarness();
    const onLocate = vi.fn();
    const controller = createEvidenceWorkspaceController({
      ...harness.options,
      onLocate,
    });
    await controller.setWorkspaceEntry("project-a", SOURCE_FINGERPRINT);
    controller.setAnalysis(analysisFixture());

    const hint = find(
      harness.mentorHost,
      (element) => element.dataset.hintId === "mentor.finding.finding-uninitialized",
    );
    const button = find(hint, (element) => element.tagName === "button");
    button.click();
    expect(onLocate).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: "node.read", range: { from: 10, to: 15 } }),
      expect.objectContaining({ id: "mentor.finding.finding-uninitialized" }),
    );
    await controller.destroy();
    expect(harness.metricsHost.children).toHaveLength(0);
    expect(harness.mentorHost.children).toHaveLength(0);
  });

  it("keeps machine-generated remote evidence language-neutral", async () => {
    const harness = createHarness();
    const controller = createEvidenceWorkspaceController({
      ...harness.options,
      getSource: () => SOURCE,
    });
    await controller.setWorkspaceEntry("project-a", SOURCE_FINGERPRINT);
    controller.setAnalysis(analysisFixture());

    const context = controller.getRemoteMentorContext();
    expect(context).not.toBeNull();
    expect(
      JSON.stringify({
        diagnostics: context?.diagnosticSummary,
        controlFlow: context?.controlFlowSummary,
        runs: context?.runEvidence,
      }),
    ).not.toMatch(/[\p{Script=Han}]/u);
    expect(context?.controlFlowSummary).toBe("functions=0; cfg=unavailable");
    await controller.destroy();
  });

  it("rebinds branch coverage to the newly analyzed source after an edit", async () => {
    const harness = createHarness();
    const controller = createEvidenceWorkspaceController(harness.options);
    await controller.setWorkspaceEntry("project-a", SOURCE_FINGERPRINT);
    const editedFingerprint = fingerprintSource(`${SOURCE}\n`);

    controller.setAnalysis(
      Object.freeze({
        ...analysisFixture(),
        sourceLength: SOURCE.length + 1,
        sourceFingerprint: editedFingerprint,
      }),
    );

    expect(() =>
      controller.setBranchCoverage(
        Object.freeze({
          sourceFingerprint: editedFingerprint,
          coveredBranchIds: Object.freeze([]),
          totalBranchIds: Object.freeze([]),
        }),
      ),
    ).not.toThrow();
    await controller.destroy();
  });

  it("resets only invalid history data and keeps accepting later real evidence", async () => {
    const harness = createHarness({ serialized: "{not-json" });
    const controller = createEvidenceWorkspaceController({
      ...harness.options,
      delayMs: 60_000,
      idFactory: () => "run-after-recovery",
      now: () => new Date("2026-07-12T00:00:00.000Z"),
    });

    await controller.setWorkspaceEntry("project-a", SOURCE_FINGERPRINT);
    expect(flatText(harness.metricsHost)).toContain("仅重置历史视图；main.c 未改动");
    controller.recordRun(completion());
    await controller.flush();
    const saved = JSON.parse(
      harness.save.mock.calls[0]?.[0].serialized ?? "null",
    ) as RunHistoryDocument;
    expect(saved.entries.map((entry) => entry.id)).toEqual(["run-after-recovery"]);
    await controller.destroy();
  });
});

describe("toolchain evidence parsing", () => {
  it("extracts only explicit fields and labels every absent field unknown", () => {
    expect(
      parseRunToolchainIdentity({
        toolchainId:
          "verified:Apple clang version 21.0.0 Target: arm64-apple-macos runner version:1.2.3",
      }),
    ).toEqual({
      compiler: "Apple clang",
      compilerVersion: "21.0.0",
      target: "arm64-apple-macos",
      runnerVersion: "1.2.3",
    });
    expect(parseRunToolchainIdentity({ toolchainId: "disabled:工具链不可用/未验证" })).toEqual({
      compiler: "unknown",
      compilerVersion: "unknown",
      target: "unknown",
      runnerVersion: "unknown",
    });
    expect(
      parseRunToolchainIdentity({
        toolchainId:
          "verified:llvm-mingw 20260616；clang version 22.1.8；Target: x86_64-w64-windows-gnu",
      }),
    ).toEqual({
      compiler: "llvm-mingw clang",
      compilerVersion: "22.1.8",
      target: "x86_64-w64-windows-gnu",
      runnerVersion: "unknown",
    });
  });
});

function createHarness(existing?: { readonly serialized: string }) {
  const ownerDocument = new FakeDocument();
  const metricsHost = ownerDocument.createElement("div");
  const mentorHost = ownerDocument.createElement("div");
  let revision = 0;
  const save = vi.fn(
    async (request: SaveWorkspaceSidecarRequest): Promise<WorkspaceSidecarSaveResult> => ({
      status: "saved",
      document: {
        kind: request.kind,
        revision: revision++,
        sourceFingerprint: request.sourceFingerprint,
        serialized: request.serialized,
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    }),
  );
  return {
    ownerDocument,
    metricsHost,
    mentorHost,
    save,
    options: {
      metricsHost: metricsHost as unknown as HTMLElement,
      mentorHost: mentorHost as unknown as HTMLElement,
      readSidecar: async () =>
        existing === undefined
          ? ({ status: "missing", kind: "run-history" } as const)
          : ({
              status: "ready",
              document: {
                kind: "run-history",
                revision: 0,
                sourceFingerprint: SOURCE_FINGERPRINT,
                serialized: existing.serialized,
                updatedAt: "2026-07-12T00:00:00.000Z",
              },
            } as const),
      saveSidecar: save,
    },
  };
}

function completion(
  overrides: {
    readonly compileResult?: CompileResult;
    readonly runResult?: RunResult | null;
    readonly scenario?: ManualRunScenario | null;
    readonly durationMs?: number;
    readonly operationCount?: number;
  } = {},
): RunPanelCompletion {
  const compileResult: CompileResult = overrides.compileResult ?? {
    ok: true,
    artifactId: "artifact-a",
    expiresAtMs: 1,
    diagnostics: "",
    compileDurationMs: 5,
  };
  const runResult: RunResult | null =
    overrides.runResult === undefined
      ? {
          ok: true,
          stdout: new TextEncoder().encode("ok\n"),
          stderr: new Uint8Array(),
          exitCode: 0,
          signal: null,
          termination: "process-exit",
          durationMs: overrides.durationMs ?? 10,
          peakRssBytes: 1_024,
          peakProcessCount: 1,
          outputBytes: 3,
          executedNodeCount: 8,
          operationCount: overrides.operationCount ?? 12,
        }
      : overrides.runResult;
  return Object.freeze({
    source: SOURCE,
    sourceFingerprint: SOURCE_FINGERPRINT,
    compileResult,
    runResult,
    capabilities: capabilities(),
    scenario: overrides.scenario === undefined ? scenario("real") : overrides.scenario,
  });
}

function scenario(mode: ManualRunScenario["mode"]): ManualRunScenario {
  return Object.freeze({
    id: "scenario.sorting",
    version: "1.0.0",
    mode,
    stdin: "8\n",
    arguments: Object.freeze(["--ascending"]),
    inputSize: 8,
  });
}

function capabilities(): Capabilities {
  return Object.freeze({
    mode: "trusted-only",
    runnerEnabled: true,
    toolchainId: "verified:Apple clang version 21.0.0；工具链 [verified-path]",
    isolationProbe: Object.freeze({
      kind: "macos-seatbelt",
      status: "unavailable",
      detail: "trusted",
    }),
    memoryDiagnostics: Object.freeze({ available: true, detail: "test" }),
    requiresNativeTrustConfirmation: false,
  });
}

function analysisFixture(): ProgramAnalysisSnapshot {
  return Object.freeze({
    revision: 1,
    sourceLength: SOURCE.length,
    sourceFingerprint: SOURCE_FINGERPRINT,
    functions: Object.freeze([]),
    defUse: Object.freeze([]),
    memoryEvents: Object.freeze([]),
    memoryTypestate: Object.freeze([]),
    findings: Object.freeze([
      Object.freeze({
        id: "finding-uninitialized",
        functionId: "function.main",
        ruleId: "uninitialized-read",
        reason: "no-reaching-definition",
        confidence: "certain",
        primaryRange: textRange(10, 15),
        ownerNodeId: "node.read",
        subject: "value",
        subjectVariableId: "variable.value",
        evidence: Object.freeze([
          Object.freeze({ role: "use" as const, range: textRange(11, 14) }),
        ]),
      }),
    ]),
  });
}

class FakeDocument {
  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }
}

class FakeElement {
  readonly ownerDocument: FakeDocument;
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (() => void)[]>();
  className = "";
  textContent = "";
  type = "";
  disabled = false;

  constructor(ownerDocument: FakeDocument, tagName: string) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName;
  }

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(name: string, listener: () => void): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }
}

function find(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement {
  if (predicate(root)) return root;
  for (const child of root.children) {
    try {
      return find(child, predicate);
    } catch {
      // Continue through siblings.
    }
  }
  throw new Error("element not found");
}

function flatText(root: FakeElement): string {
  return [root.textContent, ...root.children.map(flatText)].join(" ");
}
