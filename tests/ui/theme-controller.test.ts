import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createThemeController,
  nextTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeStorage,
} from "../../src/ui/theme-controller.js";

describe("theme controller pure contract", () => {
  it.each([
    ["dark", "dark"],
    ["light", "light"],
    [null, "light"],
    [undefined, "light"],
    ["LIGHT", "light"],
    ["system", "light"],
    [{ theme: "light" }, "light"],
  ] as const)("resolves %j to %s", (value, expected) => {
    expect(resolveTheme(value)).toBe(expected);
  });

  it("alternates the two supported themes", () => {
    expect(nextTheme("dark")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
  });
});

describe("theme controller", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes the root and compact Chinese button metadata from storage", () => {
    const root = fakeRoot();
    const button = new FakeButton();
    const storage = memoryStorage("light");

    createThemeController({ root, button: asButton(button), storage });

    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(root.dataset.theme).toBe("light");
    expect(button.dataset.theme).toBe("light");
    expect(button.attribute("aria-label")).toBe("切换为深色主题");
    expect(button.attribute("title")).toBe("切换为深色主题");
  });

  it("toggles, synchronizes metadata and persists with the fixed key", () => {
    const root = fakeRoot();
    const button = new FakeButton();
    const storage = memoryStorage("dark");
    createThemeController({ root, button: asButton(button), storage });

    button.click();
    expect(root.dataset.theme).toBe("light");
    expect(button.dataset.theme).toBe("light");
    expect(button.attribute("aria-label")).toBe("切换为深色主题");
    expect(button.attribute("title")).toBe("切换为深色主题");
    expect(storage.setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, "light");

    button.click();
    expect(root.dataset.theme).toBe("dark");
    expect(button.dataset.theme).toBe("dark");
    expect(button.attribute("aria-label")).toBe("切换为浅色主题");
    expect(storage.setItem).toHaveBeenLastCalledWith(THEME_STORAGE_KEY, "dark");
  });

  it("refreshes English accessibility text when the locale changes at runtime", () => {
    const root = fakeRoot();
    const button = new FakeButton();
    createThemeController({
      root,
      button: asButton(button),
      localeHost: button as unknown as HTMLElement,
      storage: memoryStorage("light"),
    });

    root.dataset.locale = "en";
    button.dispatch("workbench-locale-change");
    expect(button.attribute("aria-label")).toBe("Switch to dark theme");
    expect(button.attribute("title")).not.toMatch(/[\p{Script=Han}]/u);
    button.click();
    expect(button.attribute("aria-label")).toBe("Switch to light theme");
  });

  it.each([null, "system", " light "])("falls back to light for stored value %j", (value) => {
    const root = fakeRoot();
    const button = new FakeButton();

    createThemeController({ root, button: asButton(button), storage: memoryStorage(value) });

    expect(root.dataset.theme).toBe("light");
    expect(button.dataset.theme).toBe("light");
    expect(button.attribute("aria-label")).toBe("切换为深色主题");
  });

  it("falls back to light when storage cannot be read", () => {
    const root = fakeRoot();
    const button = new FakeButton();
    const storage: ThemeStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem: vi.fn(),
    };

    expect(() => createThemeController({ root, button: asButton(button), storage })).not.toThrow();
    expect(root.dataset.theme).toBe("light");
  });

  it("keeps the in-session toggle usable when storage cannot be written", () => {
    const root = fakeRoot();
    const button = new FakeButton();
    const storage: ThemeStorage = {
      getItem: () => "dark",
      setItem() {
        throw new Error("quota exceeded");
      },
    };
    createThemeController({ root, button: asButton(button), storage });

    expect(() => button.click()).not.toThrow();
    expect(root.dataset.theme).toBe("light");
    expect(button.dataset.theme).toBe("light");
  });

  it("uses global localStorage when no storage is injected", () => {
    const root = fakeRoot();
    const button = new FakeButton();
    const storage = memoryStorage("light");
    vi.stubGlobal("localStorage", storage);

    createThemeController({ root, button: asButton(button) });
    button.click();

    expect(root.dataset.theme).toBe("dark");
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "dark");
  });

  it("removes its click listener exactly once when destroyed", () => {
    const root = fakeRoot();
    const button = new FakeButton();
    const storage = memoryStorage("dark");
    const controller = createThemeController({ root, button: asButton(button), storage });

    controller.destroy();
    controller.destroy();
    button.click();

    expect(button.removeCount).toBe(1);
    expect(root.dataset.theme).toBe("dark");
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

function fakeRoot(): HTMLElement {
  return { dataset: {} } as unknown as HTMLElement;
}

function asButton(button: FakeButton): HTMLButtonElement {
  return button as unknown as HTMLButtonElement;
}

function memoryStorage(initial: string | null): ThemeStorage & {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
} {
  let value = initial;
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

class FakeButton {
  readonly dataset: Record<string, string | undefined> = {};
  readonly removeCountByType = new Map<string, number>();
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<() => void>>();

  get removeCount(): number {
    return this.removeCountByType.get("click") ?? 0;
  }

  attribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.removeCountByType.set(type, (this.removeCountByType.get(type) ?? 0) + 1);
    this.listeners.get(type)?.delete(listener);
  }

  click(): void {
    this.dispatch("click");
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}
