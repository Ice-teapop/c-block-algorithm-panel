import { contextBridge, ipcRenderer } from "electron";
import {
  AI_WINDOW_IPC_CHANNELS,
  validateAiWindowIntent,
  validateAiWindowStateEnvelope,
  type AiWindowClientApi,
  type AiWindowCommandResult,
  type AiWindowIntent,
  type AiWindowStateEnvelope,
} from "../../src/shared/ai-window.js";

const api: AiWindowClientApi = Object.freeze({
  ready: async (): Promise<AiWindowCommandResult> =>
    (await ipcRenderer.invoke(AI_WINDOW_IPC_CHANNELS.ready)) as AiWindowCommandResult,
  sendIntent: async (value: AiWindowIntent): Promise<AiWindowCommandResult> => {
    const intent = validateAiWindowIntent(value);
    if (intent === null) return Object.freeze({ status: "failed", code: "INVALID_PAYLOAD" });
    return (await ipcRenderer.invoke(
      AI_WINDOW_IPC_CHANNELS.intent,
      intent,
    )) as AiWindowCommandResult;
  },
  onState: (handler: (state: AiWindowStateEnvelope) => void): (() => void) => {
    if (typeof handler !== "function") throw new TypeError("AI window state handler is invalid");
    const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => {
      const state = validateAiWindowStateEnvelope(value);
      if (state !== null) handler(state);
    };
    ipcRenderer.on(AI_WINDOW_IPC_CHANNELS.state, listener);
    return () => ipcRenderer.removeListener(AI_WINDOW_IPC_CHANNELS.state, listener);
  },
});

contextBridge.exposeInMainWorld("aiWindowApi", api);
