export type InterfaceLocale = "zh-CN" | "en";

export function isInterfaceLocale(value: unknown): value is InterfaceLocale {
  return value === "zh-CN" || value === "en";
}

export function resolveSystemInterfaceLocale(
  preferredLanguage: unknown,
  fallbackLocale: unknown,
): InterfaceLocale {
  const preferred = normalizedLanguageTag(preferredLanguage);
  if (preferred !== null) return preferred.startsWith("zh") ? "zh-CN" : "en";

  const fallback = normalizedLanguageTag(fallbackLocale);
  return fallback?.startsWith("zh") === true ? "zh-CN" : "en";
}

function normalizedLanguageTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 ? null : normalized;
}
