import type { FoaLessonDefinition, FoaLocale } from "../tutorials/foa-contracts.js";
import type { FoaMatrixCaseModel, FoaSceneProfile } from "../tutorials/foa-scene-profile.js";
import {
  createFoaSemanticScene,
  type FoaSemanticSceneController,
  type FoaSemanticSceneOptions,
  type FoaSemanticSceneState,
} from "./foa-semantic-scene.js";

interface MatrixCopy {
  readonly title: string;
  readonly row: string;
  readonly column: string;
  readonly sum: string;
  readonly rowOutputs: string;
  readonly notSelected: string;
  readonly pending: string;
}

const COPY: Readonly<Record<FoaLocale, MatrixCopy>> = Object.freeze({
  zh: {
    title: "2 × 3 行扫描",
    row: "行",
    column: "列",
    sum: "当前行累计",
    rowOutputs: "行和",
    notSelected: "尚未选行",
    pending: "待输出",
  },
  en: {
    title: "2 × 3 row scan",
    row: "Row",
    column: "Column",
    sum: "Current row sum",
    rowOutputs: "Row sums",
    notSelected: "No row selected",
    pending: "Pending",
  },
});

/** Literal 2-D case view for lesson 54: a real grid plus row, column, and sum evidence. */
export function createFoaMatrixScene(
  ownerDocument: Document,
  lesson: FoaLessonDefinition,
  profile: FoaSceneProfile,
  options: FoaSemanticSceneOptions,
): FoaSemanticSceneController | null {
  const model = profile.matrixCase;
  if (model === undefined) return null;
  const matrixModel: FoaMatrixCaseModel = model;

  let locale = options.locale;
  let reducedMotion = options.reducedMotion;
  let state: FoaSemanticSceneState = Object.freeze({
    displayIndex: 0,
    confirmedCount: 0,
    previewing: false,
    completed: false,
  });
  let matrixAnimations: Animation[] = [];
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
  base.root.classList.add("foa-matrix-scene");
  base.root.dataset.specializedScene = "matrix-grid";

  const panel = element(ownerDocument, "section", "foa-matrix-scene__panel");
  panel.dataset.matrixPanel = "true";
  const header = element(ownerDocument, "header", "foa-matrix-scene__header");
  const title = element(ownerDocument, "h3");
  const cursor = element(ownerDocument, "p", "foa-matrix-scene__cursor");
  cursor.dataset.matrixCursor = "true";
  const accumulator = element(ownerDocument, "output", "foa-matrix-scene__sum");
  accumulator.dataset.matrixSum = "true";
  header.append(title, cursor, accumulator);

  const grid = element(ownerDocument, "div", "foa-matrix-scene__grid");
  grid.dataset.matrixRows = String(matrixModel.values.length);
  grid.dataset.matrixColumns = String(matrixModel.values[0]!.length);
  grid.setAttribute("role", "grid");
  const rows = matrixModel.values.map((values, rowIndex) => {
    const row = element(ownerDocument, "div", "foa-matrix-scene__row");
    row.dataset.matrixRow = String(rowIndex);
    row.setAttribute("role", "row");
    const rowLabel = element(ownerDocument, "span", "foa-matrix-scene__row-label");
    const cells = values.map((value, columnIndex) => {
      const cell = element(ownerDocument, "span", "foa-matrix-scene__cell");
      cell.dataset.matrixCell = `${String(rowIndex)}:${String(columnIndex)}`;
      cell.dataset.matrixRow = String(rowIndex);
      cell.dataset.matrixColumn = String(columnIndex);
      cell.setAttribute("role", "gridcell");
      cell.textContent = String(value);
      row.append(cell);
      return cell;
    });
    row.prepend(rowLabel);
    grid.append(row);
    return { row, rowLabel, cells };
  });

  const outputs = element(ownerDocument, "div", "foa-matrix-scene__outputs");
  const outputTitle = element(ownerDocument, "strong");
  const outputValues = matrixModel.rowSums.map((_, rowIndex) => {
    const output = element(ownerDocument, "span");
    output.dataset.matrixRowOutput = String(rowIndex);
    outputs.append(output);
    return output;
  });
  outputs.prepend(outputTitle);
  panel.append(header, grid, outputs);
  base.root.append(panel);

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
    setReducedMotion(nextReducedMotion: boolean): void {
      reducedMotion = nextReducedMotion;
      if (reducedMotion) cancelMatrixAnimations();
      base.setReducedMotion(nextReducedMotion);
    },
    setState(nextState: FoaSemanticSceneState): void {
      state = Object.freeze({ ...nextState });
      base.setState(nextState);
      render();
    },
    animateAdvance(fromIndex: number, toIndex: number | null): Promise<void> | null {
      cancelMatrixAnimations();
      const baseTransition = base.animateAdvance(fromIndex, toIndex);
      const rowIndex = fromIndex === 1 ? 0 : fromIndex === 3 ? 1 : null;
      const matrixTransition =
        rowIndex === null || reducedMotion ? null : animateRowSweep(rows[rowIndex]!.cells);
      if (baseTransition === null) return matrixTransition;
      if (matrixTransition === null) return baseTransition;
      return Promise.all([baseTransition, matrixTransition]).then(() => undefined);
    },
    cancelAnimation(): void {
      cancelMatrixAnimations();
      base.cancelAnimation();
    },
    focusActive(): void {
      base.focusActive();
    },
    destroy(): void {
      cancelMatrixAnimations();
      base.destroy();
    },
  });

  function applyLocale(): void {
    const copy = COPY[locale];
    title.textContent = copy.title;
    outputTitle.textContent = copy.rowOutputs;
    rows.forEach(({ rowLabel }, rowIndex) => {
      rowLabel.textContent = `${copy.row} ${String(rowIndex)}`;
    });
    panel.setAttribute("aria-label", `${copy.title}: ${lesson.experience.visualModel[locale]}`);
  }

  function render(): void {
    const copy = COPY[locale];
    const selectedRow = selectedRowIndex(state.confirmedCount, matrixModel.values.length);
    const selectedColumn = selectedColumnIndex(state.confirmedCount, matrixModel.values[0]!.length);
    panel.dataset.activeRow = selectedRow === null ? "none" : String(selectedRow);
    panel.dataset.activeColumn = selectedColumn === null ? "none" : String(selectedColumn);
    rows.forEach(({ row, cells }, rowIndex) => {
      const active = rowIndex === selectedRow;
      const completed =
        rowIndex < completedRowCount(state.confirmedCount, matrixModel.values.length);
      row.dataset.state = active ? "active" : completed ? "done" : "pending";
      cells.forEach((cell, columnIndex) => {
        cell.dataset.cursor = String(active && columnIndex === selectedColumn);
        cell.dataset.visited = String(
          completed || (active && columnIndex <= (selectedColumn ?? -1)),
        );
      });
    });
    const sum = selectedRow === null ? 0 : visibleAccumulator(state.confirmedCount, selectedRow);
    cursor.textContent =
      selectedRow === null || selectedColumn === null
        ? copy.notSelected
        : `${copy.row} ${String(selectedRow)} · ${copy.column} ${String(selectedColumn)}`;
    accumulator.textContent = `${copy.sum}: ${String(sum)}`;
    outputValues.forEach((output, rowIndex) => {
      output.textContent =
        state.confirmedCount >= (rowIndex === 0 ? 3 : 4)
          ? `${copy.row} ${String(rowIndex)} = ${String(matrixModel.rowSums[rowIndex])}`
          : `${copy.row} ${String(rowIndex)} = ${copy.pending}`;
    });
  }

  function visibleAccumulator(confirmedCount: number, rowIndex: number): number {
    if (confirmedCount < 2) return 0;
    return matrixModel.rowSums[rowIndex]!;
  }

  function animateRowSweep(cells: readonly HTMLElement[]): Promise<void> | null {
    if (cells.some((cell) => typeof cell.animate !== "function")) return null;
    matrixAnimations = cells.map((cell, index) =>
      cell.animate(
        [
          { backgroundColor: "transparent", transform: "translateY(0)" },
          { backgroundColor: "var(--accent-soft)", transform: "translateY(-2px)" },
          { backgroundColor: "transparent", transform: "translateY(0)" },
        ],
        { duration: 260, delay: index * 150, easing: "ease-out" },
      ),
    );
    const current = [...matrixAnimations];
    return Promise.all(current.map((animation) => animation.finished.catch(() => undefined)))
      .then(() => undefined)
      .finally(() => {
        if (matrixAnimations.every((animation, index) => animation === current[index])) {
          matrixAnimations = [];
        }
      });
  }

  function cancelMatrixAnimations(): void {
    for (const animation of matrixAnimations) animation.cancel();
    matrixAnimations = [];
  }
}

function selectedRowIndex(confirmedCount: number, rowCount: number): number | null {
  if (confirmedCount < 1) return null;
  return confirmedCount >= 4 ? Math.min(1, rowCount - 1) : 0;
}

function selectedColumnIndex(confirmedCount: number, columnCount: number): number | null {
  if (confirmedCount < 1) return null;
  if (confirmedCount === 1) return 0;
  return columnCount - 1;
}

function completedRowCount(confirmedCount: number, rowCount: number): number {
  if (confirmedCount < 3) return 0;
  return Math.min(confirmedCount >= 4 ? 2 : 1, rowCount);
}

function element(ownerDocument: Document, tag: string, className = ""): HTMLElement {
  const value = ownerDocument.createElement(tag);
  if (className.length > 0) value.className = className;
  return value;
}
