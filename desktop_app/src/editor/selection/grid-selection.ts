import { EMPTY_CELL, getCell, type GridDimensions, type PatternGrid } from "../model/grid";
import type { CellChange } from "../commands/grid-patch-command";

export interface GridSelection {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface GridClipboard {
  readonly columns: number;
  readonly rows: number;
  readonly cells: Uint16Array;
}

export type SelectionTransform = "rotateClockwise" | "flipHorizontal" | "flipVertical";

export interface SelectionEdit {
  readonly selection: GridSelection;
  readonly changes: readonly CellChange[];
}

export function normalizeSelection(
  first: { readonly column: number; readonly row: number },
  second: { readonly column: number; readonly row: number },
): GridSelection {
  return {
    left: Math.min(first.column, second.column),
    top: Math.min(first.row, second.row),
    right: Math.max(first.column, second.column),
    bottom: Math.max(first.row, second.row),
  };
}

export function selectionWidth(selection: GridSelection): number {
  return selection.right - selection.left + 1;
}

export function selectionHeight(selection: GridSelection): number {
  return selection.bottom - selection.top + 1;
}

export function selectionContains(
  selection: GridSelection,
  point: { readonly column: number; readonly row: number },
): boolean {
  return (
    point.column >= selection.left &&
    point.column <= selection.right &&
    point.row >= selection.top &&
    point.row <= selection.bottom
  );
}

function assertSelection(selection: GridSelection, grid: GridDimensions): void {
  if (
    ![selection.left, selection.top, selection.right, selection.bottom].every(Number.isInteger) ||
    selection.left < 0 ||
    selection.top < 0 ||
    selection.right < selection.left ||
    selection.bottom < selection.top ||
    selection.right >= grid.columns ||
    selection.bottom >= grid.rows
  ) {
    throw new RangeError("Selection is outside the grid.");
  }
}

export function translateSelection(
  selection: GridSelection,
  columnDelta: number,
  rowDelta: number,
  grid: GridDimensions,
): GridSelection {
  assertSelection(selection, grid);
  const clampedColumnDelta = Math.max(
    -selection.left,
    Math.min(grid.columns - 1 - selection.right, columnDelta),
  );
  const clampedRowDelta = Math.max(
    -selection.top,
    Math.min(grid.rows - 1 - selection.bottom, rowDelta),
  );
  return {
    left: selection.left + clampedColumnDelta,
    top: selection.top + clampedRowDelta,
    right: selection.right + clampedColumnDelta,
    bottom: selection.bottom + clampedRowDelta,
  };
}

export function copyGridSelection(grid: PatternGrid, selection: GridSelection): GridClipboard {
  assertSelection(selection, grid);
  const columns = selectionWidth(selection);
  const rows = selectionHeight(selection);
  const cells = new Uint16Array(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells[row * columns + column] = getCell(grid, selection.top + row, selection.left + column);
    }
  }
  return { columns, rows, cells };
}

function clearSelectionChanges(selection: GridSelection): CellChange[] {
  const changes: CellChange[] = [];
  for (let row = selection.top; row <= selection.bottom; row += 1) {
    for (let column = selection.left; column <= selection.right; column += 1) {
      changes.push({ row, column, value: EMPTY_CELL });
    }
  }
  return changes;
}

export function clearGridSelection(selection: GridSelection, grid: GridDimensions): CellChange[] {
  assertSelection(selection, grid);
  return clearSelectionChanges(selection);
}

export function pasteGridClipboard(
  clipboard: GridClipboard,
  target: { readonly column: number; readonly row: number },
  grid: GridDimensions,
): SelectionEdit | null {
  if (
    target.column < 0 ||
    target.row < 0 ||
    target.column + clipboard.columns > grid.columns ||
    target.row + clipboard.rows > grid.rows
  ) {
    return null;
  }
  const changes: CellChange[] = [];
  for (let row = 0; row < clipboard.rows; row += 1) {
    for (let column = 0; column < clipboard.columns; column += 1) {
      changes.push({
        row: target.row + row,
        column: target.column + column,
        value: clipboard.cells[row * clipboard.columns + column] ?? EMPTY_CELL,
      });
    }
  }
  return {
    selection: {
      left: target.column,
      top: target.row,
      right: target.column + clipboard.columns - 1,
      bottom: target.row + clipboard.rows - 1,
    },
    changes,
  };
}

export function moveGridSelection(
  grid: PatternGrid,
  selection: GridSelection,
  columnDelta: number,
  rowDelta: number,
): SelectionEdit {
  const targetSelection = translateSelection(selection, columnDelta, rowDelta, grid);
  const actualColumnDelta = targetSelection.left - selection.left;
  const actualRowDelta = targetSelection.top - selection.top;
  if (actualColumnDelta === 0 && actualRowDelta === 0) {
    return { selection, changes: [] };
  }
  const clipboard = copyGridSelection(grid, selection);
  const pasted = pasteGridClipboard(
    clipboard,
    { column: targetSelection.left, row: targetSelection.top },
    grid,
  );
  if (!pasted) throw new Error("Translated selection unexpectedly left the grid.");
  return {
    selection: targetSelection,
    changes: [...clearSelectionChanges(selection), ...pasted.changes],
  };
}

function transformedClipboard(
  clipboard: GridClipboard,
  transform: SelectionTransform,
): GridClipboard {
  const columns = transform === "rotateClockwise" ? clipboard.rows : clipboard.columns;
  const rows = transform === "rotateClockwise" ? clipboard.columns : clipboard.rows;
  const cells = new Uint16Array(columns * rows);
  cells.fill(EMPTY_CELL);

  for (let row = 0; row < clipboard.rows; row += 1) {
    for (let column = 0; column < clipboard.columns; column += 1) {
      let targetColumn = column;
      let targetRow = row;
      if (transform === "rotateClockwise") {
        targetColumn = clipboard.rows - 1 - row;
        targetRow = column;
      } else if (transform === "flipHorizontal") {
        targetColumn = clipboard.columns - 1 - column;
      } else {
        targetRow = clipboard.rows - 1 - row;
      }
      cells[targetRow * columns + targetColumn] =
        clipboard.cells[row * clipboard.columns + column] ?? EMPTY_CELL;
    }
  }
  return { columns, rows, cells };
}

export function transformGridSelection(
  grid: PatternGrid,
  selection: GridSelection,
  transform: SelectionTransform,
): SelectionEdit | null {
  const clipboard = transformedClipboard(copyGridSelection(grid, selection), transform);
  const pasted = pasteGridClipboard(
    clipboard,
    { column: selection.left, row: selection.top },
    grid,
  );
  if (!pasted) return null;
  return {
    selection: pasted.selection,
    changes: [...clearSelectionChanges(selection), ...pasted.changes],
  };
}
