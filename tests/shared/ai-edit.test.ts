import { describe, expect, it } from "vitest";
import {
  parseAiMentorEditEnvelopeJson,
  validateAiMentorEditEnvelope,
  validateAiSourceEditProposal,
} from "../../src/shared/ai-edit.js";

describe("AI source edit boundary", () => {
  const proposal = {
    schemaVersion: 1,
    summary: "修正比较方向",
    replacements: [{ expectedText: "if (a < b)", newText: "if (a > b)" }],
  };

  it("accepts only source replacements and copies the validated envelope", () => {
    const validated = validateAiMentorEditEnvelope({
      schemaVersion: 1,
      answer: "我准备了一处可审查的修改。",
      proposal,
    });
    expect(validated).toEqual({
      schemaVersion: 1,
      answer: "我准备了一处可审查的修改。",
      proposal,
    });
    expect(Object.isFrozen(validated?.proposal?.replacements)).toBe(true);
  });

  it("rejects paths, commands, file operations and ineffective replacements", () => {
    expect(validateAiSourceEditProposal({ ...proposal, path: "main.c" })).toBeNull();
    expect(
      validateAiSourceEditProposal({
        ...proposal,
        replacements: [{ expectedText: "return 0;", newText: "return 1;", command: "make" }],
      }),
    ).toBeNull();
    expect(
      validateAiSourceEditProposal({
        ...proposal,
        replacements: [{ expectedText: "return 0;", newText: "return 0;" }],
      }),
    ).toBeNull();
  });

  it("parses one bare JSON object and fails closed for model prose or fences", () => {
    const text = JSON.stringify({
      schemaVersion: 1,
      answer: "可审查。",
      proposal,
    });
    expect(parseAiMentorEditEnvelopeJson(text)?.proposal?.summary).toBe("修正比较方向");
    expect(parseAiMentorEditEnvelopeJson(`\`\`\`json\n${text}\n\`\`\``)).toBeNull();
    expect(parseAiMentorEditEnvelopeJson(`${text}\nextra`)).toBeNull();
  });
});
