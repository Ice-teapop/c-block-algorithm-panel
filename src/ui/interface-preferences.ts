import { isInterfaceLocale, type InterfaceLocale } from "../shared/interface-locale.js";

export type { InterfaceLocale } from "../shared/interface-locale.js";
export type InterfaceBackground = "white" | "paper" | "cool";

export const INTERFACE_LOCALE_STORAGE_KEY = "c-block-algorithm-panel.locale";
export const INTERFACE_BACKGROUND_STORAGE_KEY = "c-block-algorithm-panel.background";

export interface InterfacePreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface InterfacePreferencesControllerOptions {
  readonly root: HTMLElement;
  readonly languageSelect: HTMLSelectElement;
  readonly backgroundSelect: HTMLSelectElement;
  readonly storage?: InterfacePreferenceStorage | undefined;
  readonly systemLocale?: InterfaceLocale | undefined;
  readonly onLocaleChange: (locale: InterfaceLocale) => void;
}

export interface InterfacePreferencesController {
  readonly locale: InterfaceLocale;
  readonly background: InterfaceBackground;
  destroy(): void;
}

export function resolveInterfaceLocale(
  value: unknown,
  fallback: InterfaceLocale = "zh-CN",
): InterfaceLocale {
  return isInterfaceLocale(value) ? value : fallback;
}

export function resolveInterfaceBackground(value: unknown): InterfaceBackground {
  return value === "paper" || value === "cool" ? value : "white";
}

export function createInterfacePreferencesController(
  options: InterfacePreferencesControllerOptions,
): InterfacePreferencesController {
  const storage = options.storage ?? defaultStorage();
  const systemLocale = resolveInterfaceLocale(options.systemLocale, "en");
  let locale = resolveInterfaceLocale(read(storage, INTERFACE_LOCALE_STORAGE_KEY), systemLocale);
  let background = resolveInterfaceBackground(read(storage, INTERFACE_BACKGROUND_STORAGE_KEY));
  let destroyed = false;

  const render = (): void => {
    options.root.dataset.locale = locale;
    options.root.dataset.background = background;
    options.root.ownerDocument.documentElement.lang = locale;
    options.root.ownerDocument.title =
      locale === "en" ? "C Block Algorithm Panel" : "C 积木算法面板";
    options.languageSelect.value = locale;
    options.backgroundSelect.value = background;
    options.onLocaleChange(locale);
  };

  const onLanguageChange = (): void => {
    if (destroyed) return;
    locale = resolveInterfaceLocale(options.languageSelect.value, systemLocale);
    write(storage, INTERFACE_LOCALE_STORAGE_KEY, locale);
    render();
  };

  const onBackgroundChange = (): void => {
    if (destroyed) return;
    background = resolveInterfaceBackground(options.backgroundSelect.value);
    write(storage, INTERFACE_BACKGROUND_STORAGE_KEY, background);
    render();
  };

  options.languageSelect.addEventListener("change", onLanguageChange);
  options.backgroundSelect.addEventListener("change", onBackgroundChange);
  render();

  return Object.freeze({
    get locale(): InterfaceLocale {
      return locale;
    },
    get background(): InterfaceBackground {
      return background;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      options.languageSelect.removeEventListener("change", onLanguageChange);
      options.backgroundSelect.removeEventListener("change", onBackgroundChange);
    },
  });
}

function defaultStorage(): InterfacePreferenceStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function read(storage: InterfacePreferenceStorage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: InterfacePreferenceStorage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // UI preferences remain usable for the current session when storage is unavailable.
  }
}
