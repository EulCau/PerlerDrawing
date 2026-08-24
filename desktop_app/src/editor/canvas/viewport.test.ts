import { describe, expect, it } from "vitest";
import { canvasPointToGrid, fitViewport, gridPointToCanvas, zoomViewportAtPoint } from "./viewport";

describe("canvas viewport", () => {
  it("centers a fitted grid while preserving square cells", () => {
    expect(fitViewport({ width: 400, height: 300 }, { columns: 20, rows: 10 }, 40)).toEqual({
      offsetX: 40,
      offsetY: 70,
      cellSize: 16,
    });
  });

  it("maps canvas coordinates to grid cells at cell boundaries", () => {
    const viewport = { offsetX: 10, offsetY: 20, cellSize: 12 };
    const grid = { columns: 4, rows: 3 };

    expect(canvasPointToGrid({ x: 10, y: 20 }, viewport, grid)).toEqual({ column: 0, row: 0 });
    expect(canvasPointToGrid({ x: 33.9, y: 43.9 }, viewport, grid)).toEqual({
      column: 1,
      row: 1,
    });
    expect(canvasPointToGrid({ x: 58, y: 20 }, viewport, grid)).toBeNull();
    expect(canvasPointToGrid({ x: 9.9, y: 20 }, viewport, grid)).toBeNull();
  });

  it("keeps the zoom anchor over the same fractional grid position", () => {
    const anchor = { x: 130, y: 90 };
    const before = { offsetX: 10, offsetY: 10, cellSize: 20 };
    const after = zoomViewportAtPoint(before, 40, anchor);

    expect(after).toEqual({ offsetX: -110, offsetY: -70, cellSize: 40 });
    expect(gridPointToCanvas({ column: 6, row: 4 }, after)).toEqual(anchor);
  });

  it("fits the maximum blank-canvas size inside the desktop viewport", () => {
    const viewport = fitViewport({ width: 900, height: 593 }, { columns: 500, rows: 500 }, 44);

    expect(viewport.offsetX).toBeGreaterThanOrEqual(0);
    expect(viewport.offsetY).toBeGreaterThanOrEqual(0);
    expect(viewport.offsetX + viewport.cellSize * 500).toBeLessThanOrEqual(900);
    expect(viewport.offsetY + viewport.cellSize * 500).toBeLessThanOrEqual(593);
  });
});
