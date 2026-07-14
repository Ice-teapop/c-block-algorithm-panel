import { describe, expect, it } from "vitest";
import {
  createMainStatusPresenter,
  localizedMainStatus,
  parserReadyStatus,
} from "../../src/app/main-status-copy.js";

describe("main status localization", () => {
  it("uses safe English copy for Chinese internal errors", () => {
    const host = localeHost("en");
    expect(localizedMainStatus(host, "内部错误", "The operation failed.")).toBe(
      "The operation failed.",
    );
    expect(localizedMainStatus(host, "Compiler unavailable", "The operation failed.")).toBe(
      "Compiler unavailable",
    );
    expect(parserReadyStatus(host, true, 2)).toBe("C parser ready · 2 recovery notices");
  });

  it("reprojects the active banner and parser status when the locale changes", () => {
    const host = localeHost("zh-CN");
    const importStatus = output();
    const parserStatus = output();
    const presenter = createMainStatusPresenter({
      host,
      importStatus,
      parserStatus,
      setEditStatus: () => undefined,
    });

    presenter.setLocalizedBanner("正在分析", "Analyzing", "loading");
    presenter.setParserReady(false, 0);
    expect(importStatus.textContent).toBe("正在分析");
    expect(parserStatus.textContent).toContain("C 解析器");

    host.dataset.locale = "en";
    host.dispatchEvent(new Event("workbench-locale-change"));
    expect(importStatus.textContent).toBe("Analyzing");
    expect(parserStatus.textContent).toBe(
      "C parser loaded · lossless statement projection available",
    );

    presenter.destroy();
  });
});

function localeHost(locale: "zh-CN" | "en"): HTMLElement {
  const host = new EventTarget() as HTMLElement;
  Object.defineProperty(host, "dataset", { value: { locale } });
  return host;
}

function output(): HTMLOutputElement {
  return { dataset: {}, textContent: "" } as unknown as HTMLOutputElement;
}
