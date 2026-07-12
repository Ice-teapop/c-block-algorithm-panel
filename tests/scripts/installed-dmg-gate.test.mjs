import { describe, expect, it } from "vitest";
import {
  assertReleaseGateOrder,
  mountDmgArguments,
  requireMacPlatform,
  selectSingleArtifact,
  validateAsarEntries,
  validateBundleExecutableName,
  validateInstalledWorkbenchSnapshot,
  validateUniversalArchitectures,
} from "../../scripts/lib/installed-dmg-gate.mjs";

describe("installed DMG release gate", () => {
  it("fails closed outside macOS and for ambiguous artifacts", () => {
    expect(() => requireMacPlatform("linux")).toThrow(/只允许在 macOS/u);
    expect(() =>
      selectSingleArtifact(
        [
          { name: "one.dmg", kind: "file" },
          { name: "two.dmg", kind: "file" },
        ],
        ".dmg",
        "file",
        "DMG",
      ),
    ).toThrow(/恰好存在一个/u);
    expect(() =>
      selectSingleArtifact([{ name: "one.dmg", kind: "other" }], ".dmg", "file", "DMG"),
    ).toThrow(/普通文件/u);
  });

  it("constructs an explicitly read-only, non-browsing mount", () => {
    expect(mountDmgArguments("/release/app.dmg", "/tmp/mount")).toEqual([
      "attach",
      "-readonly",
      "-nobrowse",
      "-noautoopen",
      "-mountpoint",
      "/tmp/mount",
      "/release/app.dmg",
    ]);
  });

  it("rejects unsafe bundle executable names", () => {
    expect(validateBundleExecutableName("C 积木算法面板")).toBe("C 积木算法面板");
    expect(() => validateBundleExecutableName("../escape")).toThrow(/安全/u);
    expect(() => validateBundleExecutableName("part/name")).toThrow(/安全/u);
  });

  it("accepts only the installed workbench contract", () => {
    expect(() =>
      validateInstalledWorkbenchSnapshot({
        appIsPackaged: true,
        protocol: "file:",
        startupHidden: true,
        dashboardVisible: true,
        dockLabels: ["设置", "预设块", "Library", "面板预览"],
        parserState: "ready",
        analysisState: "complete",
        flowNodeCount: 5,
      }),
    ).not.toThrow();
    expect(() =>
      validateInstalledWorkbenchSnapshot({
        appIsPackaged: false,
        protocol: "http:",
        startupHidden: false,
        dashboardVisible: false,
        dockLabels: ["设置", "Library"],
        parserState: "error",
        analysisState: "worker-error",
        flowNodeCount: 0,
      }),
    ).toThrow(/file:.*进度层.*Dashboard.*parser.*Dock/u);
  });

  it("requires a Universal binary and every packaged runtime asset", () => {
    expect(() => validateUniversalArchitectures("x86_64 arm64\n")).not.toThrow();
    expect(() => validateUniversalArchitectures("arm64\n")).toThrow(/不是 Universal/u);
    expect(() =>
      validateAsarEntries(
        [
          "/dist/index.html",
          "/dist/assets/tree-sitter-c-a.wasm",
          "/dist/assets/web-tree-sitter-b.wasm",
          "/dist/assets/program-analysis-worker-c.js",
          "/dist-electron/preload/index.cjs",
          "/dist-electron/electron/main/index.js",
        ].join("\n"),
      ),
    ).not.toThrow();
    expect(() => validateAsarEntries("/dist/index.html\n")).toThrow(/缺少发布资源/u);
  });

  it("requires build, installed check, checksum and publication in that order", () => {
    expect(() =>
      assertReleaseGateOrder(`
run: npm run dist:mac:beta
run: npm run verify:installed-dmg
shasum -a 256
- name: Upload verified build artifact
uses: actions/upload-artifact@v4
gh release create
`),
    ).not.toThrow();
    expect(() =>
      assertReleaseGateOrder(`
run: npm run verify:installed-dmg
run: npm run dist:mac:beta
shasum -a 256
- name: Upload verified build artifact
uses: actions/upload-artifact@v4
gh release create
`),
    ).toThrow(/顺序不安全/u);
  });
});
