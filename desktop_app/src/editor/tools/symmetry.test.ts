import { describe, expect, it } from "vitest";
import { applySymmetryToChanges } from "./symmetry";

describe("symmetric drawing", () => {
  it("reflects vertical changes around an explicit single-cell axis", () => {
    const result = applySymmetryToChanges(
      [{ row: 2, column: 1, value: 4 }],
      { columns: 7, rows: 5 },
      { type: "vertical", axisOrCenter: [3] },
    );
    expect(result).toEqual([
      { row: 2, column: 1, value: 4 },
      { row: 2, column: 5, value: 4 },
    ]);
  });

  it("uses a 180 degree counterpart for central symmetry", () => {
    const result = applySymmetryToChanges(
      [{ row: 1, column: 2, value: 3 }],
      { columns: 8, rows: 6 },
      { type: "central" },
    );
    expect(result).toContainEqual({ row: 4, column: 5, value: 3 });
  });
});
