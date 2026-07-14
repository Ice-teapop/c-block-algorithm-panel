import { describe, expect, it } from "vitest";
import {
  aiDiffSummaryMessage,
  aiSourceEditFailureMessage,
  localizeAiSystemLabel,
} from "../../src/app/ai-workspace-integration.js";
import { formatAiAppliedStatus } from "../../src/app/main-ai-workspace.js";
import type { AiSourceEditRejectionCode } from "../../src/app/ai-source-edit-controller.js";

const rejectionCodes: readonly AiSourceEditRejectionCode[] = [
  "invalid-proposal",
  "not-ready",
  "read-only",
  "stale-workspace",
  "stale-source",
  "ambiguous-anchor",
  "locked-region",
  "invalid-source",
  "parse-error",
  "roundtrip-failed",
  "cfg-regression",
  "unsafe-projection",
  "foreign-plan",
  "confirmation-failed",
  "commit-failed",
];

describe("AI workspace English presentation boundary", () => {
  it("never forwards raw Chinese source-edit failures to the English child window", () => {
    for (const code of rejectionCodes) {
      const message = aiSourceEditFailureMessage(code, "内部中文错误不得透传", "en");
      expect(message).not.toMatch(/[\p{Script=Han}]/u);
      expect(message.length).toBeGreaterThan(0);
    }
    expect(aiSourceEditFailureMessage("stale-source", "源码已经变化", "zh-CN")).toBe(
      "源码已经变化",
    );
  });

  it("localizes generated diff and applied status summaries", () => {
    const raw = "2 处替换 · -3 行/+4 行 · -18/+26 字符";
    expect(aiDiffSummaryMessage(raw, "en")).toBe(
      "2 replacements · -3 lines/+4 lines · -18/+26 characters",
    );
    expect(formatAiAppliedStatus(raw, "en")).not.toMatch(/[\p{Script=Han}]/u);
    expect(formatAiAppliedStatus(raw, "zh-CN")).toContain(raw);
  });

  it("re-localizes only application-generated project and conversation labels", () => {
    expect(localizeAiSystemLabel("新对话", "en")).toBe("New conversation");
    expect(localizeAiSystemLabel("教程 · 扫描求最大值", "en")).toBe("Tutorial · Scan for Maximum");
    expect(localizeAiSystemLabel("New conversation", "zh-CN")).toBe("新对话");
    expect(localizeAiSystemLabel("用户自己的中文项目", "en")).toBe("用户自己的中文项目");
  });
});
