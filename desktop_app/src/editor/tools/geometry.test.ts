import { describe, expect, it } from "vitest";
import { rasterizeEllipse, rasterizeLine, rasterizeRectangle } from "./geometry";

describe("grid geometry", () => {
  it("rasterizes a deterministic Bresenham line", () => {
    const forward = rasterizeLine({ column: 0, row: 0 }, { column: 4, row: 2 });
    const reverse = rasterizeLine({ column: 4, row: 2 }, { column: 0, row: 0 });

    expect(forward).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 2, row: 1 },
      { column: 3, row: 1 },
      { column: 4, row: 2 },
    ]);
    expect(reverse).toEqual(forward);
  });

  it("uses exact integer widths for line brush stamps", () => {
    expect(rasterizeLine({ column: 1, row: 1 }, { column: 1, row: 1 }, 2)).toEqual([
      { column: 1, row: 1 },
      { column: 2, row: 1 },
      { column: 1, row: 2 },
      { column: 2, row: 2 },
    ]);
  });

  it("rasterizes filled and outlined rectangles", () => {
    const outline = rasterizeRectangle(
      { column: 1, row: 1 },
      { column: 3, row: 3 },
      { filled: false },
    );
    const fill = rasterizeRectangle({ column: 1, row: 1 }, { column: 3, row: 3 }, { filled: true });

    expect(outline).toHaveLength(8);
    expect(outline).not.toContainEqual({ column: 2, row: 2 });
    expect(fill).toHaveLength(9);
  });

  it("keeps ellipse output symmetric across both axes", () => {
    const ellipse = rasterizeEllipse(
      { column: 0, row: 0 },
      { column: 6, row: 4 },
      { filled: false },
    );
    const pointSet = new Set(ellipse.map((point) => `${point.row}:${point.column}`));

    for (const point of ellipse) {
      expect(pointSet.has(`${point.row}:${6 - point.column}`)).toBe(true);
      expect(pointSet.has(`${4 - point.row}:${point.column}`)).toBe(true);
    }
  });
});
