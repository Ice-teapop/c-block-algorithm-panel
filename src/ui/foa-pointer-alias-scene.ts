import type { FoaLessonDefinition, FoaLocale } from "../tutorials/foa-contracts.js";
import type { FoaPointerAliasModel, FoaSceneProfile } from "../tutorials/foa-scene-profile.js";
import {
  createFoaSemanticScene,
  type FoaSemanticSceneController,
  type FoaSemanticSceneOptions,
  type FoaSemanticSceneState,
} from "./foa-semantic-scene.js";

interface PointerCopy {
  readonly title: string;
  readonly object: string;
  readonly pointer: string;
  readonly waiting: string;
  readonly established: string;
}

const COPY: Readonly<Record<FoaLocale, PointerCopy>> = Object.freeze({
  zh: {
    title: "对象与别名",
    object: "目标对象",
    pointer: "指针",
    waiting: "先执行取地址；别名尚未成立。",
    established: "别名已成立；解引用会访问同一个对象。",
  },
  en: {
    title: "Object and alias",
    object: "Target object",
    pointer: "Pointer",
    waiting: "Run the address step first; no alias exists yet.",
    established: "Alias established; dereferencing reaches the same object.",
  },
});

/**
 * Lesson 47's pointer memory view. The base scene owns the forward execution path; this component
 * renders one separate alias relation, so an address edge is never mistaken for control flow.
 */
export function createFoaPointerAliasScene(
  ownerDocument: Document,
  lesson: FoaLessonDefinition,
  profile: FoaSceneProfile,
  options: FoaSemanticSceneOptions,
): FoaSemanticSceneController | null {
  const model = profile.pointerAlias;
  if (model === undefined) return null;
  const pointerModel: FoaPointerAliasModel = model;

  let locale = options.locale;
  let state: FoaSemanticSceneState = Object.freeze({
    displayIndex: 0,
    confirmedCount: 0,
    previewing: false,
    completed: false,
  });
  const forwardProfile: FoaSceneProfile = Object.freeze({
    ...profile,
    connection: "forward",
    edges: Object.freeze(
      lesson.semanticEvents
        .slice(0, -1)
        .map((_, index) => Object.freeze([index, index + 1] as const)),
    ),
  });
  const base = createFoaSemanticScene(ownerDocument, lesson, forwardProfile, options);
  base.root.classList.add("foa-pointer-alias-scene");
  base.root.dataset.specializedScene = "pointer-alias";

  const memory = element(ownerDocument, "section", "foa-pointer-alias-scene__memory");
  memory.dataset.pointerMemory = "true";
  const title = element(ownerDocument, "h3", "foa-pointer-alias-scene__title");
  const diagram = element(ownerDocument, "div", "foa-pointer-alias-scene__diagram");
  const pointer = element(ownerDocument, "div", "foa-pointer-alias-scene__entity");
  pointer.dataset.pointerEntity = "pointer";
  const pointerRole = element(ownerDocument, "span");
  const pointerName = element(ownerDocument, "strong");
  pointerName.textContent = pointerModel.pointerName;
  pointer.append(pointerRole, pointerName);

  const aliasEdge = element(ownerDocument, "span", "foa-pointer-alias-scene__alias");
  aliasEdge.dataset.pointerAliasEdge = "true";
  aliasEdge.setAttribute("aria-hidden", "true");
  aliasEdge.textContent = "→";

  const object = element(ownerDocument, "div", "foa-pointer-alias-scene__entity");
  object.dataset.pointerEntity = "object";
  const objectRole = element(ownerDocument, "span");
  const objectIdentity = element(ownerDocument, "strong");
  objectIdentity.textContent = pointerModel.objectName;
  const objectValue = element(ownerDocument, "output", "foa-pointer-alias-scene__value");
  objectValue.dataset.pointerObjectValue = "true";
  object.append(objectRole, objectIdentity, objectValue);

  const status = element(ownerDocument, "p", "foa-pointer-alias-scene__status");
  status.dataset.pointerAliasStatus = "true";
  diagram.append(pointer, aliasEdge, object);
  memory.append(title, diagram, status);
  base.root.append(memory);

  applyLocale();
  render();

  return Object.freeze({
    root: base.root,
    setLocale(nextLocale: FoaLocale): void {
      locale = nextLocale;
      base.setLocale(nextLocale);
      applyLocale();
      render();
    },
    setReducedMotion(reducedMotion: boolean): void {
      base.setReducedMotion(reducedMotion);
    },
    setState(nextState: FoaSemanticSceneState): void {
      state = Object.freeze({ ...nextState });
      base.setState(nextState);
      render();
    },
    animateAdvance(fromIndex: number, toIndex: number | null): Promise<void> | null {
      return base.animateAdvance(fromIndex, toIndex);
    },
    cancelAnimation(): void {
      base.cancelAnimation();
    },
    focusActive(): void {
      base.focusActive();
    },
    destroy(): void {
      base.destroy();
    },
  });

  function applyLocale(): void {
    const copy = COPY[locale];
    title.textContent = copy.title;
    pointerRole.textContent = copy.pointer;
    objectRole.textContent = copy.object;
    memory.setAttribute(
      "aria-label",
      `${copy.title}: ${pointerModel.pointerName} → ${pointerModel.objectName}`,
    );
  }

  function render(): void {
    const aliasVisible = state.confirmedCount >= pointerModel.revealAfterConfirmedCount;
    const writeCommitted = state.confirmedCount >= pointerModel.writeAfterConfirmedCount;
    memory.dataset.aliasVisible = String(aliasVisible);
    aliasEdge.hidden = !aliasVisible;
    pointer.dataset.state = aliasVisible ? "bound" : "unbound";
    object.dataset.state = writeCommitted ? "written" : "initial";
    objectValue.textContent = writeCommitted
      ? pointerModel.writtenValue
      : pointerModel.initialValue;
    status.textContent = aliasVisible ? COPY[locale].established : COPY[locale].waiting;
  }
}

function element(ownerDocument: Document, tag: string, className = ""): HTMLElement {
  const value = ownerDocument.createElement(tag);
  if (className.length > 0) value.className = className;
  return value;
}
