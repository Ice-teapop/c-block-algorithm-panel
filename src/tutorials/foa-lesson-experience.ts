import type { FoaLessonExperience, FoaLocalizedText, FoaVisualFamily } from "./foa-contracts.js";
import { foaText } from "./foa-contracts.js";

export interface FoaLessonExperienceInput {
  readonly visualFamily: FoaVisualFamily;
  readonly visualModelZh: string;
  readonly visualModelEn: string;
  readonly primaryActionZh: string;
  readonly primaryActionEn: string;
  readonly sequence: readonly (readonly [zh: string, en: string])[];
  readonly playbackMs: number;
  readonly playbackPolicy?: "guided" | "manual";
  readonly persistentEvidenceZh: string;
  readonly persistentEvidenceEn: string;
  readonly hiddenByDefaultZh: string;
  readonly hiddenByDefaultEn: string;
  readonly researchUrls: readonly string[];
}

export function defineFoaLessonExperience(input: FoaLessonExperienceInput): FoaLessonExperience {
  if (input.sequence.length < 2 || input.sequence.length > 32) {
    throw new RangeError("FOA lesson semantic sequence must contain two to 32 steps");
  }
  if (!Number.isInteger(input.playbackMs) || input.playbackMs < 1_000 || input.playbackMs > 3_000) {
    throw new RangeError("FOA lesson playback interval must be an integer from 1000 to 3000 ms");
  }
  if (input.researchUrls.length === 0) {
    throw new RangeError("FOA lesson experience requires at least one research URL");
  }
  return Object.freeze({
    visualFamily: input.visualFamily,
    visualModel: foaText(input.visualModelZh, input.visualModelEn),
    primaryAction: foaText(input.primaryActionZh, input.primaryActionEn),
    semanticSequence: Object.freeze(
      input.sequence.map(([zh, en]): FoaLocalizedText => foaText(zh, en)),
    ),
    playbackMs: input.playbackMs,
    playbackPolicy: input.playbackPolicy ?? "guided",
    persistentEvidence: foaText(input.persistentEvidenceZh, input.persistentEvidenceEn),
    hiddenByDefault: foaText(input.hiddenByDefaultZh, input.hiddenByDefaultEn),
    researchUrls: Object.freeze([...input.researchUrls]),
  });
}
