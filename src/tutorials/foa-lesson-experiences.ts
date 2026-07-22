import type { FoaLessonExperience } from "./foa-contracts.js";
import { FOA_LESSON_EXPERIENCES_001_040 } from "./foa-lesson-experiences-001-040.js";
import { FOA_LESSON_EXPERIENCES_041_080 } from "./foa-lesson-experiences-041-080.js";
import { FOA_LESSON_EXPERIENCES_081_120 } from "./foa-lesson-experiences-081-120.js";

const EXPERIENCES = Object.freeze({
  ...FOA_LESSON_EXPERIENCES_001_040,
  ...FOA_LESSON_EXPERIENCES_041_080,
  ...FOA_LESSON_EXPERIENCES_081_120,
}) satisfies Readonly<Record<number, FoaLessonExperience>>;

export function getFoaLessonExperience(order: number): FoaLessonExperience {
  const experience = EXPERIENCES[order];
  if (experience === undefined) {
    throw new RangeError(`FOA lesson ${String(order)} does not define an independent experience`);
  }
  return experience;
}
