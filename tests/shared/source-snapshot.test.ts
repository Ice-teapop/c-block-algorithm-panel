import { describe, expect, it } from "vitest";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";

describe("source snapshot fingerprint", () => {
  it("is deterministic and includes every UTF-16 code unit", () => {
    const samples = ["", "abc", "a😀b", "first\r\nsecond", "\uFEFFint x;"];

    for (const sample of samples) {
      expect(fingerprintSource(sample)).toBe(fingerprintSource(sample));
      expect(fingerprintSource(sample)).toMatch(new RegExp(`^${String(sample.length)}:`));
    }

    expect(fingerprintSource("abc")).not.toBe(fingerprintSource("xbc"));
    expect(fingerprintSource("abc")).not.toBe(fingerprintSource("axc"));
    expect(fingerprintSource("abc")).not.toBe(fingerprintSource("abx"));
    expect(fingerprintSource("a😀b")).not.toBe(fingerprintSource("a😁b"));
    expect(fingerprintSource("a\r\nb")).not.toBe(fingerprintSource("a\n\rb"));
  });
});
