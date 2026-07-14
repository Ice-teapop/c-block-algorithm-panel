import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { textRange } from "../../src/core/index.js";
import {
  localizeAnalysisDashboardState,
  localizedSafeErrorMessage,
  parseAiAssessment,
  resolveAnalysisLocale,
  type AnalysisDashboardState,
} from "../../src/ui/analysis-dashboard.js";

const source = readFileSync(new URL("../../src/ui/analysis-dashboard.ts", import.meta.url), "utf8");

const VALID_ASSESSMENT = Object.freeze({
  status: "partial",
  confidence: "medium",
  observation: "主要路径可运行，但边界输入仍缺少证据。",
  evidence: Object.freeze(["样例输出一致", "真实 Trace 覆盖主分支"]),
  gaps: Object.freeze(["空输入尚未验证"]),
  nextExperiment: "增加空输入与单元素输入案例。",
});

describe("parseAiAssessment", () => {
  it("states the optional AI role and routes missing setup to the AI settings", () => {
    expect(source).toContain("AI 复核（可选）");
    expect(source).toContain("查找可能的语义缺口、边界遗漏与下一步实验");
    expect(source).toContain("不判定数学正确性");
    expect(source).toContain("main / 首个可分析函数");
    expect(source).toContain("aiAction.textContent = copy.aiActions.review");
    expect(source).toContain("options.onOpenAiSettings?.()");
    expect(source).toContain("aiAction.textContent = copy.aiActions.connect");
    expect(source).toContain("void refreshAiAvailability()");
    expect(source).not.toContain("检查算法完成度");
  });

  it("switches the complete dashboard copy while preserving externally supplied evidence text", () => {
    expect(resolveAnalysisLocale("en")).toBe("en");
    expect(resolveAnalysisLocale("en-US")).toBe("en");
    expect(resolveAnalysisLocale("zh-CN")).toBe("zh-CN");
    expect(resolveAnalysisLocale(undefined)).toBe("zh-CN");
    expect(source).toContain(
      'localeHost.addEventListener("workbench-locale-change", onLocaleChange)',
    );
    expect(source).toContain('attributeFilter: ["data-locale"]');
    expect(source).toContain(
      'localeHost.removeEventListener("workbench-locale-change", onLocaleChange)',
    );
    expect(source).toContain("localeObserver?.disconnect()");
    expect(source).not.toContain("analysis-dashboard__header");
    expect(source).toContain('chartAria: "Trend of input size and runtime metrics"');
    expect(source).toContain('chartGuide.dataset.chartGuide = "analysis"');
    expect(source).toContain('summary: "How to read"');
    expect(source).toContain("Finite measurements support a growth model");
    expect(source).toContain('review: "Review current evidence"');
    expect(source).not.toContain("status.textContent = state.statusMessage");
    expect(source).toContain("title.textContent = criterion.label");
    expect(source).toContain("detail.textContent = criterion.detail");
  });

  it("keeps a completed AI result and relabels it after a locale change", () => {
    expect(source).toContain("let lastAssessment: AiAssessment | null = null");
    expect(source).toContain("renderAiAssessment(document, aiResult, lastAssessment, copy)");
    expect(source).toContain("copy.assessmentStatus[lastAssessment.status]");
    expect(source).toContain("copy.confidence[lastAssessment.confidence]");
  });

  it("localizes deterministic analysis evidence while preserving source hotspot labels", () => {
    const state: AnalysisDashboardState = {
      sourceFingerprint: "a".repeat(64),
      statusMessage: "已载入 4 条真实运行记录；sidecar 含旧源码记录，比较时仍按源码指纹隔离。",
      scenarioLabel: "整数排序",
      referenceLabel: "n log n 参考工作量 · 已有 3+ 规模证据",
      trendEvidence: "4 条同源码、同情景、同工具链且成功完成的真实运行。",
      trendPoints: [trendPoint(8), trendPoint(32), trendPoint(128)],
      criteria: [
        { id: "analysis", label: "结构分析", state: "passed", detail: "1 个函数 CFG 完整" },
        {
          id: "branches",
          label: "可达分支",
          state: "pending",
          detail: "真实覆盖 1 / 2 条分支出口",
        },
      ],
      branchCovered: 1,
      branchTotal: 2,
      hotspots: [
        {
          nodeId: "node-1",
          label: "value > maximum",
          count: 4,
          share: 0.5,
          target: { nodeId: "node-1", range: textRange(0, 15) },
        },
      ],
    };

    const localized = localizeAnalysisDashboardState(state, "en");
    const presentationText = [
      localized.statusMessage,
      localized.scenarioLabel,
      localized.referenceLabel ?? "",
      localized.trendEvidence,
      ...localized.criteria.flatMap((criterion) => [criterion.label, criterion.detail]),
    ].join(" ");
    expect(presentationText).not.toMatch(/[\u3400-\u9fff]/u);
    expect(localized.statusMessage).toContain("Loaded 4 real run records");
    expect(localized.criteria.find(({ id }) => id === "branches")?.detail).toContain("1 / 2");
    expect(localized.hotspots[0]?.label).toBe("value > maximum");
  });

  it("does not expose a Chinese backend error in English mode", () => {
    expect(localizedSafeErrorMessage("主进程连接失败", "en", "Could not connect.")).toBe(
      "Could not connect.",
    );
    expect(localizedSafeErrorMessage("Network timed out", "en", "Could not connect.")).toBe(
      "Network timed out",
    );
  });

  it("accepts the exact JSON contract and freezes the accepted evidence", () => {
    const assessment = parseAiAssessment(JSON.stringify(VALID_ASSESSMENT));

    expect(assessment).toEqual(VALID_ASSESSMENT);
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment?.evidence)).toBe(true);
    expect(Object.isFrozen(assessment?.gaps)).toBe(true);
  });

  it("accepts a single JSON Markdown fence without accepting surrounding prose", () => {
    const json = JSON.stringify(VALID_ASSESSMENT, null, 2);

    expect(parseAiAssessment(`\n\`\`\`json\n${json}\n\`\`\`\n`)).toEqual(VALID_ASSESSMENT);
    expect(parseAiAssessment(`\`\`\`\n${json}\n\`\`\``)).toEqual(VALID_ASSESSMENT);
    expect(parseAiAssessment(`结论如下：\n\`\`\`json\n${json}\n\`\`\``)).toBeNull();
  });

  it("rejects extra or missing fields instead of partially trusting the response", () => {
    expect(parseAiAssessment(JSON.stringify({ ...VALID_ASSESSMENT, score: 92 }))).toBeNull();
    const { nextExperiment: _omitted, ...missingField } = VALID_ASSESSMENT;
    expect(parseAiAssessment(JSON.stringify(missingField))).toBeNull();
  });

  it.each([
    ["invalid status", { ...VALID_ASSESSMENT, status: "done" }],
    ["invalid confidence", { ...VALID_ASSESSMENT, confidence: "certain" }],
    ["empty observation", { ...VALID_ASSESSMENT, observation: "" }],
    ["oversized observation", { ...VALID_ASSESSMENT, observation: "x".repeat(1_201) }],
    ["oversized next experiment", { ...VALID_ASSESSMENT, nextExperiment: "x".repeat(1_201) }],
    ["too many evidence items", { ...VALID_ASSESSMENT, evidence: Array(13).fill("evidence") }],
    ["oversized evidence item", { ...VALID_ASSESSMENT, evidence: ["x".repeat(601)] }],
    ["non-list gaps", { ...VALID_ASSESSMENT, gaps: "none" }],
    ["NUL text", { ...VALID_ASSESSMENT, observation: "unsafe\0text" }],
  ])("rejects out-of-contract bounds: %s", (_label, candidate) => {
    expect(parseAiAssessment(JSON.stringify(candidate))).toBeNull();
  });

  it.each(["", "not JSON", "[]", "null", '{"status":"partial"', "x".repeat(24_001)])(
    "fails closed for non-JSON or oversized input",
    (candidate) => {
      expect(parseAiAssessment(candidate)).toBeNull();
    },
  );
});

function trendPoint(inputSize: number) {
  return {
    inputSize,
    sampleCount: 3,
    medianDurationMs: inputSize / 10,
    minDurationMs: inputSize / 20,
    maxDurationMs: inputSize / 5,
    medianOperationCount: inputSize,
    minOperationCount: inputSize - 1,
    maxOperationCount: inputSize + 1,
    medianPeakRssBytes: 1024,
    referenceOperationCount: inputSize,
  };
}
