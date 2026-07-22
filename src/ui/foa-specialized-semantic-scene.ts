import type { FoaLessonDefinition } from "../tutorials/foa-contracts.js";
import type { FoaSceneProfile } from "../tutorials/foa-scene-profile.js";
import { createFoaMatrixScene } from "./foa-matrix-scene.js";
import { createFoaPointerAliasScene } from "./foa-pointer-alias-scene.js";
import type { FoaSemanticSceneController, FoaSemanticSceneOptions } from "./foa-semantic-scene.js";

/** Returns null when the lesson intentionally uses the shared fixed-case semantic scene. */
export function createFoaSpecializedSemanticScene(
  ownerDocument: Document,
  lesson: FoaLessonDefinition,
  profile: FoaSceneProfile,
  options: FoaSemanticSceneOptions,
): FoaSemanticSceneController | null {
  if (profile.pointerAlias !== undefined) {
    return createFoaPointerAliasScene(ownerDocument, lesson, profile, options);
  }
  if (profile.matrixCase !== undefined) {
    return createFoaMatrixScene(ownerDocument, lesson, profile, options);
  }
  return null;
}
