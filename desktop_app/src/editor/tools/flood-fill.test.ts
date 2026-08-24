import { describe, expect, it } from "vitest";
import { EMPTY_CELL, createGrid, setCell } from "../model/grid";
import { floodFillCells } from "./flood-fill";

describe("flood fill", () => {
  it("fills one four-connected region without crossing a barrier", () => {
    const grid = createGrid({ columns: 4, rows: 3 });
    setCell(grid, 0, 2, 1);
    setCell(grid, 1, 2, 1);
    setCell(grid, 2, 2, 1);

    expect(floodFillCells(grid, { column: 0, row: 0 }, 0)).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 0, row: 1 },
      { column: 1, row: 1 },
      { column: 0, row: 2 },
      { column: 1, row: 2 },
    ]);
  });

  it("returns no changes when the replacement already matches", () => {
    const grid = createGrid({ columns: 2, rows: 2 }, EMPTY_CELL);
    expect(floodFillCells(grid, { column: 0, row: 0 }, EMPTY_CELL)).toEqual([]);
  });
});
