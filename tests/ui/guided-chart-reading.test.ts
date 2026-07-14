import { describe, expect, it } from "vitest";
import { guidedChartReadingSnapshot } from "../../src/ui/guided-chart-reading.js";

const STAGES = Object.freeze([
  "mission.read-trace-chart.axes",
  "mission.read-trace-chart.reference",
  "mission.read-analysis-chart.benchmark",
  "mission.read-analysis-chart.variation",
  "mission.read-analysis-chart.growth",
]);

describe("guided chart reading copy", () => {
  it("covers model, guided practice, and independent interpretation in both locales", () => {
    const chinese = STAGES.map((stage) => guidedChartReadingSnapshot(stage, "zh-CN", null, "idle"));
    const english = STAGES.map((stage) => guidedChartReadingSnapshot(stage, "en", null, "idle"));

    expect(chinese.every((guide) => guide !== undefined)).toBe(true);
    expect(chinese.map((guide) => guide?.phase)).toEqual([
      "示范与跟练",
      "独立判断",
      "示范",
      "跟练",
      "独立判断",
    ]);
    expect(english.map((guide) => guide?.phase)).toEqual([
      "Model and guided practice",
      "Independent check",
      "Model",
      "Guided practice",
      "Independent check",
    ]);
    expect(JSON.stringify(english)).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("keeps the benchmark stage instructional and the interpretation stages answerable", () => {
    expect(
      guidedChartReadingSnapshot("mission.read-analysis-chart.benchmark", "zh-CN", null, "idle")
        ?.question,
    ).toBeNull();
    const trace = guidedChartReadingSnapshot(
      "mission.read-trace-chart.reference",
      "zh-CN",
      "speed-slower",
      "incorrect",
    );
    expect(trace?.options.map(({ id }) => id)).toContain("work-above-reference");
    expect(trace?.feedbackState).toBe("incorrect");
    expect(trace?.feedback).toContain("不是墙钟速度");
  });
});
