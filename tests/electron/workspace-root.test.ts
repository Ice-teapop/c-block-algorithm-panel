import { describe, expect, it } from "vitest";
import { resolveWorkspaceRoot } from "../../electron/main/workspace-root.js";

const temporaryDirectory = "/private/tmp";
const defaultRoot = "/Users/example/Documents/C Algorithm Workbench";

describe("workspace root selection", () => {
  it("keeps normal packaged builds on the Documents workspace", () => {
    expect(
      resolveWorkspaceRoot({
        isPackaged: true,
        defaultRoot,
        requestedRoot: "/private/tmp/ignored",
        installedGate: undefined,
        temporaryDirectory,
      }),
    ).toBe(defaultRoot);
  });

  it("allows only the installed gate's exact temporary workspace shape", () => {
    expect(
      resolveWorkspaceRoot({
        isPackaged: true,
        defaultRoot,
        requestedRoot: "/private/tmp/c-block-installed-dmg-abc123/workspace",
        installedGate: "1",
        temporaryDirectory,
      }),
    ).toBe("/private/tmp/c-block-installed-dmg-abc123/workspace");
  });

  it.each([
    "/Users/example/Documents/C Algorithm Workbench",
    "/private/tmp/workspace",
    "/private/tmp/c-block-installed-dmg-abc123/other",
    "/private/tmp/c-block-installed-dmg-abc123/workspace/nested",
    "c-block-installed-dmg-abc123/workspace",
  ])("rejects an unsafe packaged gate root: %s", (requestedRoot) => {
    expect(() =>
      resolveWorkspaceRoot({
        isPackaged: true,
        defaultRoot,
        requestedRoot,
        installedGate: "1",
        temporaryDirectory,
      }),
    ).toThrow(/系统临时目录/u);
  });

  it("preserves the existing development-only override", () => {
    expect(
      resolveWorkspaceRoot({
        isPackaged: false,
        defaultRoot,
        requestedRoot: "/tmp/dev-workspace",
        installedGate: undefined,
        temporaryDirectory,
      }),
    ).toBe("/tmp/dev-workspace");
  });
});
