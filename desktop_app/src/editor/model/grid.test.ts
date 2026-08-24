import { describe, expect, it } from "vitest";
import { EMPTY_CELL, cellIndex, createGrid, getCell, setCell } from "./grid";

describe("compact pattern grid", () => {
  it("creates an empty row-major Uint16 grid", () => {
    const grid = createGrid({ columns: 3, rows: 2 });

    expect(grid.cells).toBeInstanceOf(Uint16Array);
    expect([...grid.cells]).toEqual(Array.from({ length: 6 }, () => EMPTY_CELL));
    expect(cellIndex(grid, 1, 2)).toBe(5);
  });

  it("reads and writes a cell without implicit broadcasting", () => {
    const grid = createGrid({ columns: 4, rows: 3 });

    expect(setCell(grid, 2, 1, 7)).toBe(EMPTY_CELL);
    expect(getCell(grid, 2, 1)).toBe(7);
    expect(() => setCell(grid, 3, 1, 0)).toThrow(RangeError);
  });
});
