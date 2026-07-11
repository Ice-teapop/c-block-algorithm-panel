import type { SymbolRecord } from "../core/model.js";

export function symbolTooltip(symbol: SymbolRecord, role: "declaration" | "use"): string {
  const roleText = role === "declaration" ? "声明" : "使用";
  return symbol.valueText === undefined
    ? `${symbol.name} · ${roleText}`
    : `${symbol.name} = ${symbol.valueText} · ${roleText}`;
}
