/**
 * Deterministic, non-cryptographic identity for rejecting accidentally mixed
 * source snapshots. Callers must still bind a live CST to the exact source
 * text at their boundary.
 */
export function fingerprintSource(source: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = (Math.imul(second ^ (code + index), 0x85ebca6b) + 0xc2b2ae35) >>> 0;
  }
  return `${String(source.length)}:${first.toString(16)}:${second.toString(16)}`;
}
