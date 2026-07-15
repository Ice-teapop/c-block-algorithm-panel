import { describe, expect, it } from "vitest";
import { parseWindowsJobMetrics } from "../../electron/main/runner/process-host.js";

describe("Windows Job Object metrics", () => {
  it("accepts the exact bounded metrics contract", () => {
    expect(parseWindowsJobMetrics('{"rssBytes":4096,"processCount":2}')).toEqual({
      rssBytes: 4096,
      processCount: 2,
    });
  });

  it.each([
    "not-json",
    "[]",
    '{"rssBytes":1}',
    '{"rssBytes":1,"processCount":1,"extra":0}',
    '{"rssBytes":-1,"processCount":1}',
    '{"rssBytes":1,"processCount":1.5}',
  ])("rejects malformed or out-of-range metrics: %s", (contents) => {
    expect(() => parseWindowsJobMetrics(contents)).toThrow();
  });
});
