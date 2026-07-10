import type { TextRange } from "../model.js";

/** A replacement expressed entirely in the old source's UTF-16 coordinate space. */
export interface TextPatch {
  readonly range: TextRange;
  readonly newText: string;
}

/** The exact before/after slices and coordinate spaces for one applied patch. */
export interface EditDiff {
  readonly beforeRange: TextRange;
  readonly afterRange: TextRange;
  readonly beforeText: string;
  readonly afterText: string;
}

/** A normalized group of replacements that must be applied as one logical edit. */
export interface EditPlan {
  readonly sourceLength: number;
  readonly candidateLength: number;
  readonly patches: readonly TextPatch[];
}

/** Result of applying an edit plan to its source snapshot. */
export interface EditApplication {
  readonly source: string;
  readonly plan: EditPlan;
  readonly diffs: readonly EditDiff[];
  /** Patches in candidate-source coordinates that restore the exact old source. */
  readonly inversePatches: readonly TextPatch[];
}
