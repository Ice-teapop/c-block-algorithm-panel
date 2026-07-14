import type {
  LibraryCodeExample,
  LibraryCodeExampleLocalization,
  LibraryEntry,
  LibraryFeatureLink,
  LibraryTutorial,
  LibraryTutorialLocalization,
} from "./contracts.js";

export type LibraryPresentationLocale = "zh-CN" | "en";

/**
 * Produces display-only content. English never falls through to Chinese prose: reviewed English
 * copy wins, then a clearly labeled English fallback preserves access to examples and links.
 */
export function localizeLibraryEntry(
  entry: LibraryEntry,
  locale: LibraryPresentationLocale,
): LibraryEntry {
  if (locale !== "en") return entry;
  const localized = entry.localizations?.en;
  const title = localized?.title ?? englishTitle(entry);
  const summary =
    localized?.summary ??
    `${title} is a ${englishBranchNoun(entry.branchId)} entry. Use its example, constraints, and related concepts to evaluate where it applies.`;
  const details =
    localized?.details ??
    Object.freeze([
      "Reviewed English detail is not available for this entry yet. This view intentionally avoids an automatic translation of the source-language prose.",
      "Check preconditions and boundary cases, then verify the concrete behavior with the smallest runnable example before reusing the concept.",
    ]);
  const tutorial = localizeTutorial(entry.tutorial, localized?.tutorial, title);
  return Object.freeze({
    ...entry,
    title,
    summary,
    details: Object.freeze([...details]),
    aliases: localized?.aliases ?? englishOnly(entry.aliases),
    keywords: localized?.keywords ?? englishOnly(entry.keywords),
    example: localizeExample(entry.example, localized?.example, `${title} example`),
    syntax: localizeExample(entry.syntax, localized?.syntax, `${title} syntax`),
    complexity: englishComplexity(localized?.complexity, entry.complexity),
    pitfalls:
      localized?.pitfalls ??
      Object.freeze([
        "Do not apply this entry without checking its preconditions, boundary inputs, and failure behavior.",
      ]),
    featureLink: localizeFeatureLink(entry.featureLink, localized?.featureLinkLabel),
    tutorial,
  });
}

function localizeTutorial(
  tutorial: LibraryTutorial | null | undefined,
  localized: LibraryTutorialLocalization | null | undefined,
  entryTitle: string,
): LibraryTutorial | null {
  if (tutorial === null || tutorial === undefined) return null;
  const tutorialLocalization = localized ?? undefined;
  const steps = tutorial.steps.map((step, index) => {
    const stepLocalization = tutorialLocalization?.steps?.[step.id];
    return Object.freeze({
      ...step,
      title: stepLocalization?.title ?? `Task ${String(index + 1)}`,
      instruction:
        stepLocalization?.instruction ??
        `Complete this ${entryTitle} task on the linked workbench surface and inspect the observable result.`,
      artifacts: Object.freeze(
        step.artifacts.map((artifact, artifactIndex) =>
          Object.freeze({
            ...artifact,
            example: localizeExample(
              artifact.example,
              stepLocalization?.artifactExamples?.[artifactIndex],
              `Task ${String(index + 1)} artifact`,
            )!,
          }),
        ),
      ),
      featureLink: localizeFeatureLink(step.featureLink, stepLocalization?.featureLinkLabel),
      check:
        stepLocalization?.check ??
        "Verify the observable result on the linked surface before continuing.",
    });
  });
  return Object.freeze({
    ...tutorial,
    learningGoals:
      tutorialLocalization?.learningGoals ??
      Object.freeze([`Complete the ${entryTitle} workflow and explain the evidence it produces.`]),
    steps: Object.freeze(steps),
    completionChecks:
      tutorialLocalization?.completionChecks ??
      Object.freeze(["The linked workbench evidence matches the expected result."]),
  });
}

function localizeFeatureLink(
  link: LibraryFeatureLink | null | undefined,
  label: string | undefined,
): LibraryFeatureLink | null {
  if (link === null || link === undefined) return null;
  return Object.freeze({
    ...link,
    label: label ?? (containsHan(link.label) ? "Open related workbench surface" : link.label),
  });
}

function localizeExample(
  example: LibraryCodeExample | null | undefined,
  localized: LibraryCodeExampleLocalization | null | undefined,
  fallbackCaption: string,
): LibraryCodeExample | null {
  if (localized === null || example === null || example === undefined) return null;
  return Object.freeze({
    ...example,
    caption:
      localized?.caption ?? (containsHan(example.caption) ? fallbackCaption : example.caption),
    code: localized?.code ?? englishSafeCode(example),
  });
}

function englishSafeCode(example: LibraryCodeExample): string {
  if (!containsHan(example.code)) return example.code;
  if (example.language === "text") {
    return "This text artifact is available in the Chinese interface.";
  }
  const withoutBlockComments = example.code.replace(
    /\/\*[\s\S]*?[\u3400-\u9fff][\s\S]*?\*\//gu,
    "/* locale-specific comment omitted */",
  );
  const withoutLineComments = withoutBlockComments.replace(
    /\/\/[^\n]*[\u3400-\u9fff][^\n]*/gu,
    "// locale-specific comment omitted",
  );
  return containsHan(withoutLineComments)
    ? "/* This example is available in the Chinese interface. */"
    : withoutLineComments;
}

function englishComplexity(
  localized: string | null | undefined,
  source: string | null | undefined,
): string | null {
  if (localized !== undefined) return localized;
  if (source === null || source === undefined) return null;
  if (!containsHan(source)) return source;
  const bounds = [...new Set(source.match(/O\([^)]{1,24}\)/gu) ?? [])];
  return bounds.length === 0
    ? null
    : `The source entry states these asymptotic bounds: ${bounds.join(" / ")}. Confirm the stated input model before comparing implementations.`;
}

function englishTitle(entry: LibraryEntry): string {
  if (!containsHan(entry.title)) return entry.title;
  const alias = entry.aliases.find(
    (candidate) => !containsHan(candidate) && /[A-Za-z]/u.test(candidate),
  );
  return titleCase(alias ?? entry.id.split(".").at(-1) ?? entry.id);
}

function titleCase(value: string): string {
  return value.replace(/[._-]+/gu, " ").replace(/\b[a-z]/gu, (letter) => letter.toUpperCase());
}

function englishOnly(values: readonly string[]): readonly string[] {
  return Object.freeze(values.filter((value) => !containsHan(value)));
}

function englishBranchNoun(branchId: LibraryEntry["branchId"]): string {
  if (branchId === "c-syntax") return "C syntax";
  if (branchId === "standard-library") return "C standard library";
  if (branchId === "data-structure-dictionary") return "data structure";
  if (branchId === "algorithms-complexity") return "algorithm and complexity";
  if (branchId === "examples") return "worked example";
  if (branchId === "extension-api") return "developer reference";
  if (branchId === "recovery") return "failure recovery";
  return "workbench help";
}

export function containsHan(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}
