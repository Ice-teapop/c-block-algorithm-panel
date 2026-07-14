import { describe, expect, it } from "vitest";
import {
  localizeFirstLessonContent,
  localizeFirstLessonRequirement,
  localizeGuidedLessonStatusMessage,
} from "../../src/app/guided-lesson-workspace-controller.js";
import { FIRST_GUIDED_LESSON } from "../../src/tutorials/first-lesson.js";

const HAN = /[\u3400-\u9fff]/u;

describe("guided lesson locale", () => {
  it("provides complete English presentation copy for every first-lesson stage and criterion", () => {
    for (const mission of FIRST_GUIDED_LESSON.missions) {
      for (const stage of mission.stages) {
        const copy = localizeFirstLessonContent(mission, stage, "en");
        expect(copy.missionTitle, mission.id).not.toMatch(HAN);
        expect(copy.stageTitle, stage.id).not.toMatch(HAN);
        expect(copy.instruction, stage.id).not.toMatch(HAN);
        expect(copy.why, mission.id).not.toMatch(HAN);
        expect(copy.hints.join(" "), mission.id).not.toMatch(HAN);
        for (const requirement of stage.requirements) {
          expect(localizeFirstLessonRequirement(requirement, "en"), requirement.id).not.toMatch(
            HAN,
          );
        }
      }
    }
  });

  it("localizes stable and dynamic status messages without leaking Chinese in English mode", () => {
    expect(localizeGuidedLessonStatusMessage("等待完成当前操作。", "en")).toBe(
      "Complete the current action to continue.",
    );
    expect(
      localizeGuidedLessonStatusMessage("课程源码与预期不一致：fingerprint-mismatch", "en"),
    ).toBe("The lesson source does not match the expected state: fingerprint-mismatch");
    expect(localizeGuidedLessonStatusMessage("未知课程错误", "en")).not.toMatch(HAN);
    expect(localizeGuidedLessonStatusMessage("等待完成当前操作。", "zh-CN")).toBe(
      "等待完成当前操作。",
    );
  });
});
