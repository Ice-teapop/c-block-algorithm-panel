import { describe, expect, it } from "vitest";
import {
  safeWorkspaceErrorMessage,
  workspacePersistenceMessage,
} from "../../src/app/workspace-controller.js";

describe("workspace controller locale boundary", () => {
  it("never forwards a Chinese main-process error into English status UI", () => {
    expect(
      safeWorkspaceErrorMessage(
        "WORKSPACE_CONFLICT",
        "磁盘版本已更新；为避免覆盖，请重新打开该条目。",
      ),
    ).toBe("The disk version changed. Reload the entry before saving again.");
    expect(
      workspacePersistenceMessage(
        {
          state: "error",
          message: "WORKSPACE_WRITE_FAILED · 无法将修改同步到 Documents 工作区。",
        },
        "en",
      ),
    ).toBe("WORKSPACE_WRITE_FAILED · The workspace entry could not be saved.");
  });

  it("preserves user-safe English details and Chinese copy in their own locale", () => {
    expect(safeWorkspaceErrorMessage("WORKSPACE_READ_FAILED", "disk offline")).toBe("disk offline");
    expect(
      workspacePersistenceMessage({ state: "pending", message: "有修改待保存" }, "zh-CN"),
    ).toBe("有修改待保存");
  });
});
