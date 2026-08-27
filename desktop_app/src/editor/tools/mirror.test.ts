import { describe, expect, it } from "vitest";
import { EMPTY_CELL, createGrid, setCell } from "../model/grid";
import { createVerticalMirrorChanges } from "./mirror";

function applyChanges(
  cells: Uint16Array,
  columns: number,
  changes: ReturnType<typeof createVerticalMirrorChanges>,
): Uint16Array {
  const result = cells.slice();
  for (const change of changes) result[change.row * columns + change.column] = change.value;
  return result;
}

describe("vertical-axis mirror", () => {
  it("reverses every row for an even-width pattern", () => {
    const grid = createGrid({ columns: 4, rows: 2 });
    [0, 1, 2, 3, 4, 5, 6, 7].forEach((value, index) => {
      setCell(grid, Math.floor(index / 4), index % 4, value);
    });

    expect([...applyChanges(grid.cells, grid.columns, createVerticalMirrorChanges(grid))]).toEqual([
      3, 2, 1, 0, 7, 6, 5, 4,
    ]);
  });

  it("keeps the center column and mirrors empty cells for an odd-width pattern", () => {
    const grid = createGrid({ columns: 3, rows: 1 });
    setCell(grid, 0, 0, 8);
    setCell(grid, 0, 1, 9);

    expect([...applyChanges(grid.cells, grid.columns, createVerticalMirrorChanges(grid))]).toEqual([
      EMPTY_CELL,
      9,
      8,
    ]);
  });
});
