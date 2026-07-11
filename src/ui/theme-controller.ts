export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "c-block-algorithm-panel.theme";

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ThemeControllerOptions {
  readonly root: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly storage?: ThemeStorage | undefined;
}

export interface ThemeController {
  destroy(): void;
}

export function resolveTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : "light";
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function createThemeController(options: ThemeControllerOptions): ThemeController {
  const storage = options.storage ?? defaultStorage();
  let theme = readStoredTheme(storage);
  let destroyed = false;

  function render(): void {
    const actionLabel = theme === "dark" ? "切换为浅色主题" : "切换为深色主题";
    options.root.dataset.theme = theme;
    options.button.dataset.theme = theme;
    options.button.setAttribute("aria-label", actionLabel);
    options.button.setAttribute("title", actionLabel);
  }

  function handleClick(): void {
    if (destroyed) {
      return;
    }
    theme = nextTheme(theme);
    render();
    writeStoredTheme(storage, theme);
  }

  render();
  options.button.addEventListener("click", handleClick);

  return Object.freeze({
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      options.button.removeEventListener("click", handleClick);
    },
  });
}

function defaultStorage(): ThemeStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readStoredTheme(storage: ThemeStorage | undefined): Theme {
  if (storage === undefined) {
    return "light";
  }
  try {
    return resolveTheme(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

function writeStoredTheme(storage: ThemeStorage | undefined, theme: Theme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // A blocked storage backend must not prevent an in-session theme change.
  }
}
