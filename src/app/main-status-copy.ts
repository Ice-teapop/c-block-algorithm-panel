import type { WorkbenchElements } from "../ui/workbench-shell.js";

export function localizedMainText(host: HTMLElement, zh: string, en: string): string {
  return host.dataset.locale === "en" ? en : zh;
}

export function localizedMainStatus(
  host: HTMLElement,
  message: string,
  englishFallback: string,
): string {
  return host.dataset.locale === "en" && /[\u3400-\u9fff]/u.test(message)
    ? englishFallback
    : message;
}

export function parserReadyStatus(
  host: HTMLElement,
  hasError: boolean,
  issueCount: number,
): string {
  if (hasError) {
    return localizedMainText(
      host,
      `C 解析器就绪 · ${String(issueCount)} 个恢复提示`,
      `C parser ready · ${String(issueCount)} recovery notice${issueCount === 1 ? "" : "s"}`,
    );
  }
  return localizedMainText(
    host,
    "C 解析器已加载 · 语句级无损投影可用",
    "C parser loaded · lossless statement projection available",
  );
}

type MainBannerState = "loading" | "ready" | "error" | "warning";
type MainEditStatus =
  string | Error | { readonly kind: "success" | "parse-error"; readonly message: string };

export interface MainStatusPresenter {
  setBanner(message: string, state: MainBannerState, englishFallback: string): void;
  setError(message: string, englishFallback: string): void;
  setLocalizedBanner(zh: string, en: string, state: MainBannerState): void;
  setCommitted(kind: "edit" | "structure"): void;
  setEditError(error: Error, englishFallback: string): void;
  setParseError(message: string): void;
  setParserReady(hasError: boolean, issueCount: number): void;
  destroy(): void;
}

export function createMainStatusPresenter(options: {
  readonly host: HTMLElement;
  readonly importStatus: HTMLOutputElement;
  readonly parserStatus: HTMLOutputElement;
  readonly setEditStatus: (status: MainEditStatus) => void;
}): MainStatusPresenter {
  let banner: { readonly zh: string; readonly en: string; readonly state: MainBannerState } | null =
    null;
  let parser: { readonly hasError: boolean; readonly issueCount: number } | null = null;
  let destroyed = false;
  const renderBanner = (): void => {
    if (banner === null) return;
    options.importStatus.textContent = localizedMainText(options.host, banner.zh, banner.en);
    options.importStatus.dataset.state = banner.state;
  };
  const renderParser = (): void => {
    if (parser === null) return;
    options.parserStatus.textContent = parserReadyStatus(
      options.host,
      parser.hasError,
      parser.issueCount,
    );
  };
  const setLocalizedBanner = (zh: string, en: string, state: MainBannerState): void => {
    banner = Object.freeze({ zh, en, state });
    renderBanner();
  };
  const setBanner = (message: string, state: MainBannerState, englishFallback: string): void => {
    setLocalizedBanner(message, localizedMainStatus(options.host, message, englishFallback), state);
  };
  const onLocaleChange = (): void => {
    renderBanner();
    renderParser();
  };
  options.host.addEventListener("workbench-locale-change", onLocaleChange);
  return Object.freeze({
    setBanner,
    setError(message: string, englishFallback: string) {
      setBanner(message, "error", englishFallback);
    },
    setLocalizedBanner,
    setCommitted(kind: "edit" | "structure") {
      const structural = kind === "structure";
      const editZh = structural ? "结构修改已提交；可随时撤销。" : "修改已提交；可随时撤销。";
      const editEn = structural
        ? "Structural edit committed; you can undo it at any time."
        : "Edit committed; you can undo it at any time.";
      options.setEditStatus({
        kind: "success",
        message: localizedMainText(options.host, editZh, editEn),
      });
      setLocalizedBanner(
        structural
          ? "结构修改已提交；可使用撤销恢复上一版本。"
          : "修改已提交；可使用撤销恢复上一版本。",
        structural
          ? "Structural edit committed; use Undo to restore the previous version."
          : "Edit committed; use Undo to restore the previous version.",
        "ready",
      );
    },
    setEditError(error: Error, englishFallback: string) {
      const message = localizedMainStatus(options.host, error.message, englishFallback);
      options.setEditStatus(new Error(message));
      setBanner(error.message, "error", englishFallback);
    },
    setParseError(message: string) {
      options.setEditStatus({
        kind: "parse-error",
        message: localizedMainStatus(
          options.host,
          message,
          "The current source cannot be parsed reliably.",
        ),
      });
    },
    setParserReady(hasError: boolean, issueCount: number) {
      parser = Object.freeze({ hasError, issueCount });
      renderParser();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      options.host.removeEventListener("workbench-locale-change", onLocaleChange);
    },
  });
}

export function createMainStatus(
  elements: Pick<WorkbenchElements, "shell" | "importStatus" | "parserStatus">,
  setEditStatus: (status: MainEditStatus) => void,
): MainStatusPresenter {
  return createMainStatusPresenter({
    host: elements.shell,
    importStatus: elements.importStatus,
    parserStatus: elements.parserStatus,
    setEditStatus,
  });
}
