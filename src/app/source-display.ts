/** Returns the visible newline label for an exact source string. */
export function newlineLabel(source: string): string {
  const withoutCrlf = source.replaceAll("\r\n", "");
  const hasCrlf = source.includes("\r\n");
  const hasLf = withoutCrlf.includes("\n");
  const hasCr = withoutCrlf.includes("\r");
  if (Number(hasCrlf) + Number(hasLf) + Number(hasCr) > 1) return "混合换行";
  if (hasCrlf) return "CRLF";
  if (hasCr) return "CR";
  if (hasLf) return "LF";
  return "单行";
}

/** Formats transport metadata without normalizing or mutating the source. */
export function sourceMetadata(source: string): string {
  const bytes = new TextEncoder().encode(source).byteLength;
  return `${newlineLabel(source)} · ${bytes.toLocaleString("zh-CN")} B · UTF-8`;
}
