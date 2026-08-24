import type { CellChange } from "../commands/grid-patch-command";
import { EMPTY_CELL, getCell, type PatternGrid } from "../model/grid";
import type { GridSelection } from "../selection/grid-selection";

function correctionBounds(grid: PatternGrid, selection: GridSelection | null): GridSelection {
  return selection ?? { left: 0, top: 0, right: grid.columns - 1, bottom: grid.rows - 1 };
}

function occupied(grid: PatternGrid, row: number, column: number): boolean {
  return (
    row >= 0 &&
    column >= 0 &&
    row < grid.rows &&
    column < grid.columns &&
    getCell(grid, row, column) !== EMPTY_CELL
  );
}

export function removeIsolatedMaskCells(
  grid: PatternGrid,
  selection: GridSelection | null,
): CellChange[] {
  const bounds = correctionBounds(grid, selection);
  const changes: CellChange[] = [];
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    for (let column = bounds.left; column <= bounds.right; column += 1) {
      if (!occupied(grid, row, column)) continue;
      let neighborCount = 0;
      for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
        for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
          if (
            (rowOffset !== 0 || columnOffset !== 0) &&
            occupied(grid, row + rowOffset, column + columnOffset)
          ) {
            neighborCount += 1;
          }
        }
      }
      if (neighborCount === 0) changes.push({ row, column, value: EMPTY_CELL });
    }
  }
  return changes;
}

export function fillSingleCellMaskHoles(
  grid: PatternGrid,
  selection: GridSelection | null,
): CellChange[] {
  const bounds = correctionBounds(grid, selection);
  const changes: CellChange[] = [];
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    for (let column = bounds.left; column <= bounds.right; column += 1) {
      if (getCell(grid, row, column) !== EMPTY_CELL) continue;
      const neighbors = [
        row > 0 ? getCell(grid, row - 1, column) : EMPTY_CELL,
        column + 1 < grid.columns ? getCell(grid, row, column + 1) : EMPTY_CELL,
        row + 1 < grid.rows ? getCell(grid, row + 1, column) : EMPTY_CELL,
        column > 0 ? getCell(grid, row, column - 1) : EMPTY_CELL,
      ];
      if (neighbors.some((value) => value === EMPTY_CELL)) continue;
      const counts = new Map<number, number>();
      for (const value of neighbors) counts.set(value, (counts.get(value) ?? 0) + 1);
      const replacement = [...counts].sort(
        ([leftValue, leftCount], [rightValue, rightCount]) =>
          rightCount - leftCount || leftValue - rightValue,
      )[0]?.[0];
      if (replacement !== undefined) changes.push({ row, column, value: replacement });
    }
  }
  return changes;
}
