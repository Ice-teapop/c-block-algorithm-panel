import type { PanelApi } from "./shared/api.js";

declare global {
  const __CODEMIRROR_STYLE_NONCE__: string;

  interface Window {
    readonly panelApi: PanelApi;
  }
}

export {};
