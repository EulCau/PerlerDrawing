import { describe, expect, it } from "vitest";
import { EMPTY_CELL, createGrid, getCell, setCell } from "../model/grid";
import {
  copyGridSelection,
  moveGridSelection,
  pasteGridClipboard,
  transformGridSelection,
} from "./grid-selection";

function apply(
  grid: ReturnType<typeof createGrid>,
  changes: readonly { row: number; column: number; value: number }[],
) {
  for (const change of changes) setCell(grid, change.row, change.column, change.value);
}

describe("grid selection edits", () => {
  it("moves an overlapping rectangular selection without losing cells", () => {
    const grid = createGrid({ columns: 5, rows: 4 });
    setCell(grid, 1, 1, 1);
    setCell(grid, 1, 2, 2);
    const edit = moveGridSelection(grid, { left: 1, top: 1, right: 2, bottom: 1 }, 1, 0);
    apply(grid, edit.changes);
    expect(getCell(grid, 1, 1)).toBe(EMPTY_CELL);
    expect(getCell(grid, 1, 2)).toBe(1);
    expect(getCell(grid, 1, 3)).toBe(2);
  });

  it("rotates a non-square selection clockwise and updates its bounds", () => {
    const grid = createGrid({ columns: 5, rows: 5 });
    setCell(grid, 1, 1, 1);
    setCell(grid, 1, 2, 2);
    setCell(grid, 2, 1, 3);
    setCell(grid, 2, 2, 4);
    setCell(grid, 3, 1, 5);
    setCell(grid, 3, 2, 6);
    const edit = transformGridSelection(
      grid,
      { left: 1, top: 1, right: 2, bottom: 3 },
      "rotateClockwise",
    );
    expect(edit?.selection).toEqual({ left: 1, top: 1, right: 3, bottom: 2 });
    if (!edit) throw new Error("Expected a rotation edit.");
    apply(grid, edit.changes);
    expect([getCell(grid, 1, 1), getCell(grid, 1, 2), getCell(grid, 1, 3)]).toEqual([5, 3, 1]);
    expect([getCell(grid, 2, 1), getCell(grid, 2, 2), getCell(grid, 2, 3)]).toEqual([6, 4, 2]);
  });

  it("copies empty cells and rejects a paste that would clip the selection", () => {
    const grid = createGrid({ columns: 3, rows: 3 });
    setCell(grid, 0, 0, 7);
    const clipboard = copyGridSelection(grid, { left: 0, top: 0, right: 1, bottom: 1 });
    expect(Array.from(clipboard.cells)).toEqual([7, EMPTY_CELL, EMPTY_CELL, EMPTY_CELL]);
    expect(pasteGridClipboard(clipboard, { column: 2, row: 2 }, grid)).toBeNull();
  });
});
