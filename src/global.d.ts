import type { PanelApi } from "./shared/api.js";
import type { AiWindowClientApi } from "./shared/ai-window.js";

declare global {
  const __CODEMIRROR_STYLE_NONCE__: string;

  interface Window {
    readonly panelApi: PanelApi;
    readonly aiWindowApi: AiWindowClientApi;
  }
}

export {};
