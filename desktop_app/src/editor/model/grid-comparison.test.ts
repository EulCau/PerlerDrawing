import { describe, expect, it } from "vitest";
import { createGrid, setCell } from "./grid";
import { comparePatternGrids } from "./grid-comparison";

describe("grid version comparison", () => {
  it("classifies added, removed, and recolored cells", () => {
    const current = createGrid({ columns: 3, rows: 2 });
    const reference = createGrid({ columns: 3, rows: 2 });
    setCell(current, 0, 0, 1);
    setCell(reference, 0, 1, 2);
    setCell(current, 1, 2, 3);
    setCell(reference, 1, 2, 4);
    const result = comparePatternGrids(current, reference);
    expect({ added: result.added, removed: result.removed, changed: result.changed }).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
    });
  });
});
