import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CParser } from "../../src/core/index.js";
import {
  MAX_LEARNING_TEMPLATE_SOURCE_LENGTH,
  validateLearningTemplateSource,
} from "../../src/app/learning-template-validator.js";
import { createTestParser } from "../core/parser-fixture.js";

let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("custom learning block validation", () => {
  it("accepts one statement or one nested control fragment", () => {
    expect(validateLearningTemplateSource(parser, "value += 1;")).toEqual({
      nodeType: "expression_statement",
      fragmentKind: "statement",
    });
    expect(
      validateLearningTemplateSource(
        parser,
        "for (int i = 0; i < limit; i++) {\n  total += values[i];\n}",
      ),
    ).toEqual({ nodeType: "for_statement", fragmentKind: "control" });
  });

  it.each([
    "first();\nsecond();",
    "#define HIDDEN 1",
    "void nested(void) {}",
    "if (ready) {",
    "// only a comment",
    "\nreturn 0;",
  ])("rejects non-single or unsafe fragments: %s", (source) => {
    expect(() => validateLearningTemplateSource(parser, source)).toThrow();
  });

  it("rejects NUL and oversized catalog payloads before parsing", () => {
    expect(() => validateLearningTemplateSource(parser, "value();\0")).toThrow(/NUL/u);
    expect(() =>
      validateLearningTemplateSource(parser, "x".repeat(MAX_LEARNING_TEMPLATE_SOURCE_LENGTH + 1)),
    ).toThrow(/不得超过/u);
  });
});
