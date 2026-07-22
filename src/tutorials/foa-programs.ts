import type { FoaLessonCode, FoaLessonMode } from "./foa-contracts.js";

const HEADERS = `#include <assert.h>
#include <ctype.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

`;

/**
 * Wraps an original teaching body in a small, single-file C program.  The body is authored for
 * AlgoLatch; it is not copied from the source textbook.  Later fading modes expose the same source
 * as an editable template so the renderer can progressively transfer responsibility to the learner.
 */
export function buildFoaLessonCode(body: string, mode: FoaLessonMode): FoaLessonCode {
  const [support, mainBody] = splitProgramParts(body);
  const complete = `${HEADERS}${support.length === 0 ? "" : `${support}\n\n`}int main(void) {
  /* FOA_STEP: the semantic stage anchors here. */
${indent(mainBody.trim(), 2)}
  return 0;
}
`;
  if (mode === "semantic" || mode === "block-observe") {
    return Object.freeze({
      kind: "complete" as const,
      text: complete,
      placeholders: Object.freeze([]) as readonly [],
    });
  }
  const placeholder = mode === "block-complete" ? "core_step" : "algorithm_body";
  const prompt =
    mode === "block-complete"
      ? "complete the missing core algorithm step"
      : "arrange and connect the algorithm body, then validate the result";
  const template = complete.replace(
    "/* FOA_STEP: the semantic stage anchors here. */",
    `/* TODO: ${prompt}. */`,
  );
  return Object.freeze({
    kind: "template",
    text: template,
    placeholders: Object.freeze([placeholder]),
  });
}

function splitProgramParts(body: string): readonly [string, string] {
  const marker = "\n@@main@@\n";
  const markerIndex = body.indexOf(marker);
  if (markerIndex < 0) return ["", body];
  return [body.slice(0, markerIndex).trim(), body.slice(markerIndex + marker.length).trim()];
}

function indent(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
