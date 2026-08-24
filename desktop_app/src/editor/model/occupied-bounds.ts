import { EMPTY_CELL, type PatternGrid } from "./grid";

export interface OccupiedBounds {
  readonly minColumn: number;
  readonly minRow: number;
  readonly maxColumn: number;
  readonly maxRow: number;
  readonly width: number;
  readonly height: number;
  readonly beadCount: number;
}

export function computeOccupiedBounds(grid: PatternGrid): OccupiedBounds | null {
  let minColumn = grid.columns;
  let minRow = grid.rows;
  let maxColumn = -1;
  let maxRow = -1;
  let beadCount = 0;

  for (let index = 0; index < grid.cells.length; index += 1) {
    if (grid.cells[index] === EMPTY_CELL) continue;

    const row = Math.floor(index / grid.columns);
    const column = index - row * grid.columns;
    minColumn = Math.min(minColumn, column);
    minRow = Math.min(minRow, row);
    maxColumn = Math.max(maxColumn, column);
    maxRow = Math.max(maxRow, row);
    beadCount += 1;
  }

  if (beadCount === 0) return null;

  return {
    minColumn,
    minRow,
    maxColumn,
    maxRow,
    width: maxColumn - minColumn + 1,
    height: maxRow - minRow + 1,
    beadCount,
  };
}
