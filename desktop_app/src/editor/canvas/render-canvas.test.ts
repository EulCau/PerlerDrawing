import { describe, expect, it } from "vitest";
import { computeGridDifferenceBounds } from "./render-canvas";

describe("dirty grid bounds", () => {
  it("limits a 300 x 300 canvas update to the changed rectangle", () => {
    const columns = 300;
    const previous = new Uint16Array(columns * columns);
    const current = previous.slice();
    current[24 * columns + 18] = 4;
    current[27 * columns + 21] = 5;
    expect(computeGridDifferenceBounds(previous, current, columns)).toEqual({
      left: 18,
      top: 24,
      right: 21,
      bottom: 27,
    });
  });

  it("skips redraw when revisions have identical cell values", () => {
    const cells = new Uint16Array(90_000);
    expect(computeGridDifferenceBounds(cells, cells.slice(), 300)).toBeNull();
  });
});
