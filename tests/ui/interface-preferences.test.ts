import { describe, expect, it, vi } from "vitest";
import {
  createInterfacePreferencesController,
  INTERFACE_LOCALE_STORAGE_KEY,
  type InterfacePreferenceStorage,
} from "../../src/ui/interface-preferences.js";

describe("interface preferences locale precedence", () => {
  it("uses the system locale on first launch without persisting an implicit choice", () => {
    const harness = createHarness(null, "en");

    expect(harness.controller.locale).toBe("en");
    expect(harness.root.dataset.locale).toBe("en");
    expect(harness.document.documentElement.lang).toBe("en");
    expect(harness.document.title).toBe("C Block Algorithm Panel");
    expect(harness.language.value).toBe("en");
    expect(harness.onLocaleChange).toHaveBeenCalledWith("en");
    expect(harness.storage.setItem).not.toHaveBeenCalled();
  });

  it.each([
    ["zh-CN", "en", "C 积木算法面板"],
    ["en", "zh-CN", "C Block Algorithm Panel"],
  ] as const)(
    "keeps saved user choice %s above system locale %s",
    (stored, systemLocale, title) => {
      const harness = createHarness(stored, systemLocale);

      expect(harness.controller.locale).toBe(stored);
      expect(harness.document.title).toBe(title);
    },
  );

  it.each(["", "zh-TW", "system", "EN"])(
    "falls back to the system locale for invalid stored value %j",
    (stored) => {
      expect(createHarness(stored, "en").controller.locale).toBe("en");
    },
  );

  it("persists only an explicit language change", () => {
    const harness = createHarness(null, "en");
    harness.language.value = "zh-CN";
    harness.language.dispatchEvent(new Event("change"));

    expect(harness.controller.locale).toBe("zh-CN");
    expect(harness.storage.setItem).toHaveBeenCalledWith(INTERFACE_LOCALE_STORAGE_KEY, "zh-CN");
    expect(harness.document.documentElement.lang).toBe("zh-CN");
    expect(harness.document.title).toBe("C 积木算法面板");
  });
});

function createHarness(storedLocale: string | null, systemLocale: "zh-CN" | "en") {
  const values = new Map<string, string>();
  if (storedLocale !== null) values.set(INTERFACE_LOCALE_STORAGE_KEY, storedLocale);
  const storage: InterfacePreferenceStorage & {
    setItem: ReturnType<typeof vi.fn>;
  } = {
    getItem: (key) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
  };
  const document = {
    documentElement: { lang: "" },
    title: "",
  };
  const root = {
    dataset: {},
    ownerDocument: document,
  } as unknown as HTMLElement;
  const language = new FakeSelect();
  const background = new FakeSelect();
  const onLocaleChange = vi.fn();
  const controller = createInterfacePreferencesController({
    root,
    languageSelect: language as unknown as HTMLSelectElement,
    backgroundSelect: background as unknown as HTMLSelectElement,
    storage,
    systemLocale,
    onLocaleChange,
  });
  return { controller, root, document, language, storage, onLocaleChange };
}

class FakeSelect extends EventTarget {
  value = "";
}
