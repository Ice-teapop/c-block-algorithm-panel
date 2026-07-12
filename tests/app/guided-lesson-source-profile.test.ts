import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSinglePassMinimumSource } from "../../src/app/guided-lesson-workspace-controller.js";
import type { CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";
import { analyzeFlowFixture } from "../flow/fixture.js";

describe("guided lesson minimum source profile", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => parser.dispose());

  it("accepts an equivalent one-pass minimum scan with learner-chosen names", () => {
    const source = `int main(void) {
  int n, best;
  scanf("%d%d", &n, &best);
  for (int i = 1; i < n; i++) {
    int candidate;
    scanf("%d", &candidate);
    if (candidate < best) { best = candidate; }
  }
  printf("%d\\n", best);
  return 0;
}
`;
    const projection = analyzeFlowFixture(parser, source).projection;
    expect(isSinglePassMinimumSource(source, projection)).toBe(true);
  });

  it("rejects the wrong comparison direction and an extra traversal", () => {
    const wrongDirection = `int f(int n) {
  int best = 0;
  for (int i = 0; i < n; i++) {
    int candidate = i;
    if (candidate > best) { best = candidate; }
  }
  return best;
}
`;
    const extraLoop = wrongDirection
      .replace("candidate > best", "candidate < best")
      .replace("  return best;", "  for (int j = 0; j < n; j++) { best += 0; }\n  return best;");
    expect(
      isSinglePassMinimumSource(
        wrongDirection,
        analyzeFlowFixture(parser, wrongDirection).projection,
      ),
    ).toBe(false);
    expect(
      isSinglePassMinimumSource(extraLoop, analyzeFlowFixture(parser, extraLoop).projection),
    ).toBe(false);
  });
});
