import type { PanelApi } from "./shared/api.js";

declare global {
  interface Window {
    readonly panelApi: PanelApi;
  }
}

export {};
