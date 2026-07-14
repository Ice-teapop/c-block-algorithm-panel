import { createStartupLoader, type StartupLoader } from "../ui/startup-loader.js";
import { createInterfacePreferencesController } from "../ui/interface-preferences.js";
import { createAiProviderSettings } from "../ui/ai-provider-settings.js";
import { createThemeController } from "../ui/theme-controller.js";
import { mountWorkbench, type WorkbenchElements } from "../ui/workbench-shell.js";
import { createBuiltinWorkbenchRegistry } from "../workbench/builtin-modules.js";
import type { PanelApi } from "../shared/api.js";
import { resolveSystemInterfaceLocale, type InterfaceLocale } from "../shared/interface-locale.js";
import type { WorkbenchRegistrySnapshot } from "../workbench/contracts.js";
import { createWorkbenchCommandSurface } from "./workbench-command-surface.js";

export interface WorkbenchRuntime {
  readonly elements: WorkbenchElements;
  readonly startupLoader: StartupLoader;
  readonly registrySnapshot: WorkbenchRegistrySnapshot;
  destroy(): void;
}

export async function resolveInitialRendererLocale(
  panelApi: Pick<PanelApi, "getSystemLocale">,
): Promise<InterfaceLocale> {
  let locale = resolveSystemInterfaceLocale(
    globalThis.navigator.languages[0],
    globalThis.navigator.language,
  );
  try {
    locale = await panelApi.getSystemLocale();
  } catch {
    // A hot reload can briefly outlive an older preload; browser locale remains safe.
  }
  return locale;
}

export async function initializeRendererLocale(
  panelApi: Pick<PanelApi, "getSystemLocale">,
): Promise<InterfaceLocale> {
  const locale = await resolveInitialRendererLocale(panelApi);
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
  document.title = locale === "en" ? "C Block Algorithm Panel" : "C 积木算法面板";
  return locale;
}

export function createWorkbenchRuntime(
  app: HTMLElement,
  panelApi: PanelApi,
  systemLocale: InterfaceLocale,
): WorkbenchRuntime {
  const registry = createBuiltinWorkbenchRegistry();
  const registrySnapshot = registry.snapshot();
  const elements = mountWorkbench(app, registrySnapshot);
  const preferenceController = createInterfacePreferencesController({
    root: document.documentElement,
    languageSelect: elements.languageSelect,
    backgroundSelect: elements.backgroundSelect,
    systemLocale,
    onLocaleChange(locale): void {
      elements.setLocale(locale);
      const setNativeLocale = (
        panelApi as PanelApi & {
          readonly setInterfaceLocale?: PanelApi["setInterfaceLocale"] | undefined;
        }
      ).setInterfaceLocale;
      if (typeof setNativeLocale === "function") {
        void setNativeLocale(locale).catch(() => {
          // A renderer hot reload can briefly retain an older preload; UI localization remains local.
        });
      }
    },
  });
  const startupLoader = createStartupLoader({
    root: elements.startupRoot,
    progress: elements.startupProgress,
    status: elements.startupStatus,
    locale: () => preferenceController.locale,
  });
  const themeController = createThemeController({
    root: document.documentElement,
    button: elements.themeButton,
    localeHost: elements.shell,
  });
  const aiProviderSettings = createAiProviderSettings(elements.aiProviderSettingsHost, panelApi);
  const commandSurface = createWorkbenchCommandSurface({ elements, registrySnapshot });
  let destroyed = false;

  return Object.freeze({
    elements,
    startupLoader,
    registrySnapshot,
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      startupLoader.destroy();
      aiProviderSettings.destroy();
      preferenceController.destroy();
      themeController.destroy();
      commandSurface.destroy();
      elements.destroy();
    },
  });
}
