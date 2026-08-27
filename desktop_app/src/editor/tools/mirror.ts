import type { CellChange } from "../commands/grid-patch-command";
import type { PatternGrid } from "../model/grid";

export function createVerticalMirrorChanges(grid: PatternGrid): CellChange[] {
  const changes: CellChange[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const sourceColumn = grid.columns - 1 - column;
      const value = grid.cells[row * grid.columns + sourceColumn];
      const current = grid.cells[row * grid.columns + column];
      if (value !== undefined && current !== value) changes.push({ row, column, value });
    }
  }

  return changes;
}
