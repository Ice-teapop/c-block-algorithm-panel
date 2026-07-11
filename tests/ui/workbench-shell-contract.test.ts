import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/ui/workbench-shell.ts", import.meta.url), "utf8");
const runtimeSource = readFileSync(
  new URL("../../src/app/workbench-runtime.ts", import.meta.url),
  "utf8",
);
const flowCanvasSource = readFileSync(
  new URL("../../src/ui/flow-canvas.ts", import.meta.url),
  "utf8",
);
const flowWorkbenchSource = readFileSync(
  new URL("../../src/app/flow-workbench-controller.ts", import.meta.url),
  "utf8",
);

describe("M6 workbench shell contract", () => {
  it("mounts the registry snapshot through the extensible runtime", () => {
    expect(source).not.toContain("createBuiltinWorkbenchRegistry");
    expect(source).toContain("registrySnapshot: WorkbenchRegistrySnapshot");
    expect(source).toContain("snapshot.pages");
    expect(source).toContain("snapshot.inspectorViews");
    expect(runtimeSource).toContain("mountWorkbench(app, registrySnapshot)");
  });

  it("publishes exactly four root Dock menus with branch popups", () => {
    expect(source).toContain("createWorkbenchMenu(dockHost");
    expect(source).toContain("workbenchMenuDefinitionsFromRegistry(registrySnapshot)");
    expect(source).toContain('id="workbench-dock"');
    expect(source).not.toContain("dock-group__label");
    expect(source).not.toContain("dock-tab");
  });

  it("keeps a free canvas larger than code and embeds non-modal inspection", () => {
    for (const id of [
      "build-layout",
      "left-pane",
      "center-pane",
      "flow-canvas",
      "bottom-pane",
      "right-pane",
      "code-pane",
      "explanation-host",
      "edit-host",
      "run-host",
    ]) {
      expect(source).toContain(`id="${id}"`);
    }
    expect(source).toContain('showFullPage("build")');
    expect(source).toContain("currentPageId = pageId");
  });

  it("targets the real floating node detail instead of the legacy inspector during onboarding", () => {
    expect(source).not.toContain(
      'id="inspector-stack" class="panel panel--inspector" tabindex="-1" data-tour-target="node-detail"',
    );
    expect(flowCanvasSource).toContain('windowElement.dataset.tourTarget = "node-detail"');
    expect(flowWorkbenchSource).toContain("WORKBENCH_REVEAL_FLOW_DETAIL_EVENT");
    expect(flowWorkbenchSource).toContain("canvas.focusNode(node.id)");
  });

  it("publishes direct Dashboard/build navigation and inspector compatibility", () => {
    expect(source).toContain('id="dashboard-tab"');
    expect(source).toContain('id="build-tab"');
    expect(source).toContain("readonly showPage: (pageId: string) => void");
    expect(source).toContain("readonly getPageHost: (pageId: string) => HTMLElement");
    expect(source).toContain("readonly showInspector: (viewId: string) => void");
    expect(source).toContain("readonly focusPanel: (panelId: string) => void");
  });

  it("removes branding and keeps only functional source controls", () => {
    expect(source).not.toContain("brand__mark");
    expect(source).not.toMatch(/<img\b/gu);
    expect(source).not.toContain('id="app-title"');
    expect(source).not.toContain("C 积木算法面板");
    expect(source).toContain('id="open-source"');
    expect(source).toContain('id="open-paste"');
    expect(source).toContain('id="theme-toggle"');
  });

  it("tears down menu and view listeners idempotently", () => {
    expect(source).toContain("readonly destroy: () => void");
    expect(source).toContain("if (destroyed) return");
    expect(source).toContain('tab.removeEventListener("click", listener)');
    expect(source).toContain("menu.destroy()");
    expect(source).toContain("pagePanels.clear()");
  });
});
