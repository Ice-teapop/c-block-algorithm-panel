import { describe, expect, it } from "vitest";
import { defineFoaLessonExperience } from "../../src/tutorials/foa-lesson-experience.js";
import { defineFoaCourseRuntimeEvidence } from "../../src/tutorials/foa-runtime-evidence-contracts.js";
import type { FoaSceneProfile } from "../../src/tutorials/foa-scene-profile.js";

describe("FOA variable-length semantic frame contracts", () => {
  it("accepts a course-authored sequence longer than four without padding or truncation", () => {
    const sequence = Array.from(
      { length: 7 },
      (_, index) => [`步骤 ${String(index + 1)}`, `Step ${String(index + 1)}`] as const,
    );
    const experience = defineFoaLessonExperience({
      visualFamily: "loop",
      visualModelZh: "逐轮状态",
      visualModelEn: "Per-iteration state",
      primaryActionZh: "推进一轮",
      primaryActionEn: "Advance one iteration",
      sequence,
      playbackMs: 1_500,
      persistentEvidenceZh: "每轮状态",
      persistentEvidenceEn: "Each iteration state",
      hiddenByDefaultZh: "无关细节",
      hiddenByDefaultEn: "Unrelated details",
      researchUrls: ["https://example.com/runtime"],
    });
    expect(experience.semanticSequence).toHaveLength(7);
    expect(Object.isFrozen(experience.semanticSequence)).toBe(true);
  });

  it("requires runtime snapshots to match authored slot count rather than the number four", () => {
    const profile = {
      order: 31,
      slots: ["input", "operation", "operation", "operation", "output"],
      stateShape: [{ id: "value" }],
    } as unknown as FoaSceneProfile;
    const five = Array.from({ length: 5 }, (_, index) => ({ stateValues: { value: index } }));
    const evidence = defineFoaCourseRuntimeEvidence(profile, five);
    expect(evidence.frames).toHaveLength(5);
    expect(() => defineFoaCourseRuntimeEvidence(profile, five.slice(0, 4))).toThrow(
      /semantic slot/u,
    );
  });
});
