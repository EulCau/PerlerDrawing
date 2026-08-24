import { describe, expect, it } from "vitest";
import { createGrid, setCell } from "./grid";
import { computeOccupiedBounds } from "./occupied-bounds";

describe("occupied bounds", () => {
  it("returns null for an empty pattern", () => {
    expect(computeOccupiedBounds(createGrid({ columns: 5, rows: 4 }))).toBeNull();
  });

  it("computes the minimal occupied rectangle and bead count", () => {
    const grid = createGrid({ columns: 8, rows: 6 });
    setCell(grid, 1, 6, 0);
    setCell(grid, 4, 2, 1);
    setCell(grid, 3, 4, 2);

    expect(computeOccupiedBounds(grid)).toEqual({
      minColumn: 2,
      minRow: 1,
      maxColumn: 6,
      maxRow: 4,
      width: 5,
      height: 4,
      beadCount: 3,
    });
  });
});
