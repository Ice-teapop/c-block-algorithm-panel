import { describe, expect, it } from "vitest";
import {
  isInterfaceLocale,
  resolveSystemInterfaceLocale,
} from "../../src/shared/interface-locale.js";

describe("system interface locale", () => {
  it.each(["zh", "zh-CN", "zh-Hans", "zh-Hant-TW", " ZH-tw "])(
    "maps %s to the supported Chinese locale",
    (language) => {
      expect(resolveSystemInterfaceLocale(language, "en-US")).toBe("zh-CN");
    },
  );

  it.each(["en", "en-AU", "de-DE", "ja-JP"])(
    "maps non-Chinese language %s to English",
    (language) => {
      expect(resolveSystemInterfaceLocale(language, "zh-CN")).toBe("en");
    },
  );

  it("uses app.getLocale only when the preferred system language is unavailable", () => {
    expect(resolveSystemInterfaceLocale(undefined, "zh-Hans-CN")).toBe("zh-CN");
    expect(resolveSystemInterfaceLocale("", "en-AU")).toBe("en");
  });

  it("accepts only the two public renderer locale values", () => {
    expect(isInterfaceLocale("zh-CN")).toBe(true);
    expect(isInterfaceLocale("en")).toBe(true);
    expect(isInterfaceLocale("zh-TW")).toBe(false);
    expect(isInterfaceLocale(1)).toBe(false);
  });
});
