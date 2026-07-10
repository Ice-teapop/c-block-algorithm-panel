import { describe, expect, it } from "vitest";
import { assessParseStability } from "../../src/app/parse-stability.js";
import { textRange, utf16Offset, type ParseSummary } from "../../src/core/model.js";

describe("parse stability assessment", () => {
  it("does not hold a recovery-free tree", () => {
    expect(assessParseStability(parse(false, [], []), 100)).toEqual({
      affectedCodeUnits: 0,
      sourceLength: 100,
      affectedRatio: 0,
      holdPreviousTree: false,
    });
  });

  it("merges overlapping ERROR ranges before applying the thirty-percent threshold", () => {
    const assessment = assessParseStability(
      parse(true, [textRange(10, 30), textRange(20, 50)], []),
      100,
    );

    expect(assessment.affectedCodeUnits).toBe(40);
    expect(assessment.affectedRatio).toBe(0.4);
    expect(assessment.holdPreviousTree).toBe(true);
  });

  it("keeps a small recovery visible and treats an uncovered missing token as one unit", () => {
    const assessment = assessParseStability(
      parse(true, [textRange(10, 20)], [utf16Offset(40)]),
      100,
    );

    expect(assessment.affectedCodeUnits).toBe(11);
    expect(assessment.holdPreviousTree).toBe(false);
  });

  it("fails closed when a parser reports an error without any recovery coordinates", () => {
    expect(assessParseStability(parse(true, [], []), 20).holdPreviousTree).toBe(true);
    expect(assessParseStability(parse(true, [], []), 0).affectedRatio).toBe(1);
  });

  it("validates host-provided limits", () => {
    expect(() => assessParseStability(parse(false, [], []), -1)).toThrow(/sourceLength/u);
    expect(() => assessParseStability(parse(false, [], []), 1, 1.1)).toThrow(/holdThreshold/u);
  });
});

function parse(
  hasError: boolean,
  errorRanges: ParseSummary["errorRanges"],
  missingOffsets: ParseSummary["missingOffsets"],
): ParseSummary {
  return Object.freeze({ mode: "tree-sitter", hasError, errorRanges, missingOffsets });
}
