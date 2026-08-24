import { describe, expect, it } from "vitest";
import { EMPTY_CELL, createGrid, setCell } from "../model/grid";
import { fillSingleCellMaskHoles, removeIsolatedMaskCells } from "./mask-correction";

describe("mask correction", () => {
  it("removes only occupied cells without any eight-neighbor connection", () => {
    const grid = createGrid({ columns: 5, rows: 5 });
    setCell(grid, 0, 0, 2);
    setCell(grid, 2, 2, 3);
    setCell(grid, 2, 3, 3);
    expect(removeIsolatedMaskCells(grid, null)).toEqual([{ row: 0, column: 0, value: EMPTY_CELL }]);
  });

  it("fills a four-sided one-cell hole using the deterministic majority color", () => {
    const grid = createGrid({ columns: 3, rows: 3 });
    setCell(grid, 0, 1, 5);
    setCell(grid, 1, 2, 5);
    setCell(grid, 2, 1, 6);
    setCell(grid, 1, 0, 5);
    expect(fillSingleCellMaskHoles(grid, null)).toContainEqual({ row: 1, column: 1, value: 5 });
  });
});
