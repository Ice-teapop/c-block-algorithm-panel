import { describe, expect, it, vi } from "vitest";
import { createStableToolchainDetector } from "../../electron/main/runner/verification.js";
import type { ToolchainDetector } from "../../electron/main/runner/capability.js";

describe("verification toolchain snapshot", () => {
  it("reuses one verified toolchain result across isolated sample runners", () => {
    const snapshot = Object.freeze({
      available: true,
      detail: "Apple clang version 17.0.0",
      executablePath: "/trusted/clang",
      sdkPath: "/trusted/sdk",
      developerRootPath: "/trusted/developer",
      sanitizerRuntimePath: "/trusted/sanitizer",
    });
    const detect = vi.fn<ToolchainDetector>(() => snapshot);
    const stable = createStableToolchainDetector(detect);

    expect(stable()).toBe(snapshot);
    expect(stable()).toBe(snapshot);
    expect(detect).toHaveBeenCalledOnce();
  });

  it("also snapshots an unavailable result so verification remains fail-closed", () => {
    const unavailable = Object.freeze({ available: false, detail: "probe failed" });
    const detect = vi
      .fn<ToolchainDetector>()
      .mockReturnValueOnce(unavailable)
      .mockReturnValue({ available: true, detail: "unexpected later success" });
    const stable = createStableToolchainDetector(detect);

    expect(stable()).toBe(unavailable);
    expect(stable()).toBe(unavailable);
    expect(detect).toHaveBeenCalledOnce();
  });
});
