import type { GridDimensions } from "../model/grid";
import type { GridPoint } from "../tools/geometry";

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface CanvasViewport {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly cellSize: number;
}

export const MIN_CELL_SIZE = 1;
export const MAX_CELL_SIZE = 72;
export const VIEWPORT_PADDING = 44;

export function clampCellSize(cellSize: number): number {
  if (!Number.isFinite(cellSize)) throw new RangeError("Cell size must be finite.");
  return Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, cellSize));
}

export function fitViewport(
  canvas: CanvasSize,
  grid: GridDimensions,
  padding = VIEWPORT_PADDING,
): CanvasViewport {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { offsetX: 0, offsetY: 0, cellSize: MIN_CELL_SIZE };
  }
  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError("Viewport padding must be a finite non-negative number.");
  }

  const availableWidth = Math.max(1, canvas.width - padding * 2);
  const availableHeight = Math.max(1, canvas.height - padding * 2);
  const cellSize = clampCellSize(
    Math.min(availableWidth / grid.columns, availableHeight / grid.rows),
  );
  const gridWidth = grid.columns * cellSize;
  const gridHeight = grid.rows * cellSize;

  return {
    offsetX: (canvas.width - gridWidth) / 2,
    offsetY: (canvas.height - gridHeight) / 2,
    cellSize,
  };
}

export function canvasPointToGrid(
  point: CanvasPoint,
  viewport: CanvasViewport,
  grid: GridDimensions,
): GridPoint | null {
  const column = Math.floor((point.x - viewport.offsetX) / viewport.cellSize);
  const row = Math.floor((point.y - viewport.offsetY) / viewport.cellSize);

  if (column < 0 || row < 0 || column >= grid.columns || row >= grid.rows) return null;
  return { column, row };
}

export function gridPointToCanvas(point: GridPoint, viewport: CanvasViewport): CanvasPoint {
  return {
    x: viewport.offsetX + point.column * viewport.cellSize,
    y: viewport.offsetY + point.row * viewport.cellSize,
  };
}

export function zoomViewportAtPoint(
  viewport: CanvasViewport,
  nextCellSize: number,
  anchor: CanvasPoint,
): CanvasViewport {
  const cellSize = clampCellSize(nextCellSize);
  const gridX = (anchor.x - viewport.offsetX) / viewport.cellSize;
  const gridY = (anchor.y - viewport.offsetY) / viewport.cellSize;

  return {
    offsetX: anchor.x - gridX * cellSize,
    offsetY: anchor.y - gridY * cellSize,
    cellSize,
  };
}
