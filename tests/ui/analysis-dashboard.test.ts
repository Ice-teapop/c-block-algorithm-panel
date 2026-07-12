import { describe, expect, it } from "vitest";
import { parseAiAssessment } from "../../src/ui/analysis-dashboard.js";

const VALID_ASSESSMENT = Object.freeze({
  status: "partial",
  confidence: "medium",
  observation: "主要路径可运行，但边界输入仍缺少证据。",
  evidence: Object.freeze(["样例输出一致", "真实 Trace 覆盖主分支"]),
  gaps: Object.freeze(["空输入尚未验证"]),
  nextExperiment: "增加空输入与单元素输入案例。",
});

describe("parseAiAssessment", () => {
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
