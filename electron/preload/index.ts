import { contextBridge, ipcRenderer } from "electron";
import type {
  Capabilities,
  CompileRequest,
  CompileResult,
  PanelApi,
  RunRequest,
  RunResult,
} from "../../src/shared/api.js";

const IPC_CHANNELS = Object.freeze({
  capabilities: "panel:capabilities",
  compile: "panel:compile",
  run: "panel:run",
});

function copyCapabilitiesSnapshot(value: Capabilities): Capabilities {
  return {
    mode: value.mode,
    runnerEnabled: value.runnerEnabled,
    seatbeltProbe: { ...value.seatbeltProbe },
    requiresNativeTrustConfirmation: value.requiresNativeTrustConfirmation,
  };
}

const panelApi: PanelApi = Object.freeze({
  capabilities: async (): Promise<Capabilities> =>
    copyCapabilitiesSnapshot((await ipcRenderer.invoke(IPC_CHANNELS.capabilities)) as Capabilities),
  compile: async (request: CompileRequest): Promise<CompileResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.compile, request)) as CompileResult,
  run: async (request: RunRequest): Promise<RunResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.run, request)) as RunResult,
});

contextBridge.exposeInMainWorld("panelApi", panelApi);
