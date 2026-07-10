import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/ui/workbench-shell.ts", import.meta.url), "utf8");

describe("workbench shell extension contract", () => {
  it("mounts registered inspector views instead of embedding the three built-in tabs", () => {
    expect(source).not.toContain("createBuiltinWorkbenchRegistry");
    expect(source).toContain("inspectorViews: readonly InspectorViewContribution[]");
    expect(source).toContain("views.map((view, index)");
    expect(source).not.toMatch(/<button id="(?:explanation|edit|run)-tab"/u);
    expect(source).not.toMatch(/view\.id === ["'](?:explanation|edit|run)["']/u);
  });

  it("writes contribution labels as text and exposes stable view data attributes", () => {
    expect(source).toContain("tab.textContent = view.label");
    expect(source).not.toContain("${view.label}");
    expect(source).toContain("tab.dataset.inspectorViewId = view.id");
    expect(source).toContain("panel.dataset.inspectorViewId = view.id");
    expect(source).toContain("host.dataset.inspectorViewId = view.id");
  });

  it("publishes only the generic host API plus the inert theme button", () => {
    expect(source).toContain("getInspectorHost");
    expect(source).not.toMatch(/getInspectorHost\(["'](?:explanation|edit|run)["']\)/u);
    expect(source).toContain('id="theme-toggle"');
    expect(source).toContain('aria-label="切换界面主题"');
    expect(source).not.toMatch(/themeButton\.addEventListener/u);
  });

  it("publishes an idempotent teardown path for remountable workbench shells", () => {
    expect(source).toContain("readonly destroy: () => void");
    expect(source).toContain('removeEventListener("keydown", handleInspectorKeydown)');
    expect(source).toContain('tab.removeEventListener("click", listener)');
    expect(source).toContain("tabClickListeners.clear()");
  });
});
