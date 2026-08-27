import { EMPTY_CELL, type PatternGrid } from "../model/grid";
import type { CellDifference } from "../model/grid-comparison";
import type { PatternDocument } from "../model/pattern-document";
import type { GridSelection } from "../selection/grid-selection";
import type { GridPoint } from "../tools/geometry";
import { gridPointToCanvas, type CanvasSize, type CanvasViewport } from "./viewport";

export interface CanvasTheme {
  readonly workspace: string;
  readonly board: string;
  readonly grid: string;
  readonly subdivision: string;
  readonly boardBoundary: string;
  readonly coordinate: string;
  readonly beadHole: string;
  readonly accent: string;
  readonly erase: string;
  readonly selectionFill: string;
  readonly differenceAdded: string;
  readonly differenceRemoved: string;
  readonly differenceChanged: string;
}

export interface GridDirtyBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type CanvasDisplayMode = "draw" | "preview";

type VisibleRange = GridDirtyBounds;

function prepareCanvas(
  canvas: HTMLCanvasElement,
  size: CanvasSize,
  clear = true,
): CanvasRenderingContext2D | null {
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(size.width * ratio));
  const pixelHeight = Math.max(1, Math.round(size.height * ratio));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (clear) context.clearRect(0, 0, size.width, size.height);
  return context;
}

function visibleRange(grid: PatternGrid, viewport: CanvasViewport, size: CanvasSize): VisibleRange {
  return {
    left: Math.max(0, Math.floor(-viewport.offsetX / viewport.cellSize)),
    right: Math.min(
      grid.columns - 1,
      Math.ceil((size.width - viewport.offsetX) / viewport.cellSize),
    ),
    top: Math.max(0, Math.floor(-viewport.offsetY / viewport.cellSize)),
    bottom: Math.min(
      grid.rows - 1,
      Math.ceil((size.height - viewport.offsetY) / viewport.cellSize),
    ),
  };
}

export function computeGridDifferenceBounds(
  previous: Uint16Array,
  current: Uint16Array,
  columns: number,
): GridDirtyBounds | null {
  if (previous.length !== current.length || columns <= 0 || current.length % columns !== 0) {
    return null;
  }
  let left = columns;
  let right = -1;
  let top = current.length / columns;
  let bottom = -1;
  for (let index = 0; index < current.length; index += 1) {
    if (previous[index] === current[index]) continue;
    const row = Math.floor(index / columns);
    const column = index - row * columns;
    left = Math.min(left, column);
    right = Math.max(right, column);
    top = Math.min(top, row);
    bottom = Math.max(bottom, row);
  }
  return right < 0 ? null : { left, top, right, bottom };
}

function drawBead(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number,
  color: string,
  holeColor: string,
  displayMode: CanvasDisplayMode,
): void {
  if (displayMode === "preview" || cellSize < 4) {
    context.fillStyle = color;
    context.fillRect(x, y, cellSize, cellSize);
    return;
  }

  const centerX = x + cellSize / 2;
  const centerY = y + cellSize / 2;
  const radius = Math.max(1.5, cellSize * 0.4);

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();

  if (cellSize >= 13) {
    context.beginPath();
    context.arc(centerX, centerY, Math.max(1, cellSize * 0.105), 0, Math.PI * 2);
    context.fillStyle = holeColor;
    context.fill();
  }
}

function drawGridLines(
  context: CanvasRenderingContext2D,
  document: PatternDocument,
  viewport: CanvasViewport,
  size: CanvasSize,
  theme: CanvasTheme,
): void {
  const { cellSize, offsetX, offsetY } = viewport;
  const { columns, rows } = document.grid;
  const minColumn = Math.max(0, Math.floor(-offsetX / cellSize));
  const maxColumn = Math.min(columns, Math.ceil((size.width - offsetX) / cellSize));
  const minRow = Math.max(0, Math.floor(-offsetY / cellSize));
  const maxRow = Math.min(rows, Math.ceil((size.height - offsetY) / cellSize));
  const drawLine = (
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    color: string,
    width: number,
  ) => {
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.strokeStyle = color;
    context.lineWidth = width;
    context.stroke();
  };

  for (let column = minColumn; column <= maxColumn; column += 1) {
    const x = offsetX + column * cellSize;
    const isBoardBoundary = column % document.board.columns === 0;
    const isSubdivision = column % document.board.subdivision === 0;
    if (cellSize < 4 && !isBoardBoundary && !isSubdivision) continue;
    drawLine(
      x,
      Math.max(0, offsetY),
      x,
      Math.min(size.height, offsetY + rows * cellSize),
      isBoardBoundary ? theme.boardBoundary : isSubdivision ? theme.subdivision : theme.grid,
      isBoardBoundary ? 2 : isSubdivision ? 1.15 : 0.65,
    );
  }

  for (let row = minRow; row <= maxRow; row += 1) {
    const y = offsetY + row * cellSize;
    const isBoardBoundary = row % document.board.rows === 0;
    const isSubdivision = row % document.board.subdivision === 0;
    if (cellSize < 4 && !isBoardBoundary && !isSubdivision) continue;
    drawLine(
      Math.max(0, offsetX),
      y,
      Math.min(size.width, offsetX + columns * cellSize),
      y,
      isBoardBoundary ? theme.boardBoundary : isSubdivision ? theme.subdivision : theme.grid,
      isBoardBoundary ? 2 : isSubdivision ? 1.15 : 0.65,
    );
  }
}

function drawCoordinates(
  context: CanvasRenderingContext2D,
  document: PatternDocument,
  viewport: CanvasViewport,
  size: CanvasSize,
  theme: CanvasTheme,
): void {
  const { cellSize, offsetX, offsetY } = viewport;
  if (cellSize < 10) return;

  const interval = cellSize >= 28 ? 1 : document.board.subdivision;
  context.fillStyle = theme.coordinate;
  context.font = `${cellSize >= 28 ? 9 : 10}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.textAlign = "center";
  context.textBaseline = "bottom";

  for (let column = 0; column < document.grid.columns; column += interval) {
    const x = offsetX + (column + 0.5) * cellSize;
    if (x < 0 || x > size.width) continue;
    context.fillText(String(column + 1), x, offsetY - 7);
  }

  context.textAlign = "right";
  context.textBaseline = "middle";
  for (let row = 0; row < document.grid.rows; row += interval) {
    const y = offsetY + (row + 0.5) * cellSize;
    if (y < 0 || y > size.height) continue;
    context.fillText(String(row + 1), offsetX - 7, y);
  }
}

export function renderGridCanvas(
  canvas: HTMLCanvasElement,
  document: PatternDocument,
  viewport: CanvasViewport,
  size: CanvasSize,
  theme: CanvasTheme,
): void {
  const context = prepareCanvas(canvas, size);
  if (!context) return;
  context.fillStyle = theme.workspace;
  context.fillRect(0, 0, size.width, size.height);

  const gridWidth = document.grid.columns * viewport.cellSize;
  const gridHeight = document.grid.rows * viewport.cellSize;
  context.fillStyle = theme.board;
  context.fillRect(viewport.offsetX, viewport.offsetY, gridWidth, gridHeight);
}

export function renderGridOverlayCanvas(
  canvas: HTMLCanvasElement,
  document: PatternDocument,
  viewport: CanvasViewport,
  size: CanvasSize,
  theme: CanvasTheme,
  displayMode: CanvasDisplayMode = "draw",
): void {
  const context = prepareCanvas(canvas, size);
  if (!context) return;
  if (displayMode === "preview") return;
  drawGridLines(context, document, viewport, size, theme);
  drawCoordinates(context, document, viewport, size, theme);
}

export function renderBeadCanvas(
  canvas: HTMLCanvasElement,
  document: PatternDocument,
  viewport: CanvasViewport,
  size: CanvasSize,
  theme: CanvasTheme,
  dirtyBounds: GridDirtyBounds | null = null,
  displayMode: CanvasDisplayMode = "draw",
): void {
  const context = prepareCanvas(canvas, size, dirtyBounds === null);
  if (!context) return;
  if (dirtyBounds) {
    const start = gridPointToCanvas({ column: dirtyBounds.left, row: dirtyBounds.top }, viewport);
    context.clearRect(
      start.x,
      start.y,
      (dirtyBounds.right - dirtyBounds.left + 1) * viewport.cellSize,
      (dirtyBounds.bottom - dirtyBounds.top + 1) * viewport.cellSize,
    );
  }

  const visible = visibleRange(document.grid, viewport, size);
  const range = dirtyBounds
    ? {
        left: Math.max(visible.left, dirtyBounds.left),
        right: Math.min(visible.right, dirtyBounds.right),
        top: Math.max(visible.top, dirtyBounds.top),
        bottom: Math.min(visible.bottom, dirtyBounds.bottom),
      }
    : visible;
  for (let row = range.top; row <= range.bottom; row += 1) {
    for (let column = range.left; column <= range.right; column += 1) {
      const value = document.grid.cells[row * document.grid.columns + column];
      if (value === undefined || value === EMPTY_CELL) continue;
      const paletteColor = document.palette.colors[value];
      if (!paletteColor) continue;
      const point = gridPointToCanvas({ column, row }, viewport);
      drawBead(
        context,
        point.x,
        point.y,
        viewport.cellSize,
        paletteColor.hex,
        theme.beadHole,
        displayMode,
      );
    }
  }
}

export function renderInteractionCanvas(
  canvas: HTMLCanvasElement,
  points: readonly GridPoint[],
  hover: GridPoint | null,
  viewport: CanvasViewport,
  size: CanvasSize,
  previewColor: string,
  erasing: boolean,
  theme: CanvasTheme,
  selection: GridSelection | null,
  differences: readonly CellDifference[],
): void {
  const context = prepareCanvas(canvas, size);
  if (!context) return;

  context.save();
  context.globalAlpha = 0.48;
  for (const difference of differences) {
    const canvasPoint = gridPointToCanvas(difference, viewport);
    context.fillStyle =
      difference.kind === "added"
        ? theme.differenceAdded
        : difference.kind === "removed"
          ? theme.differenceRemoved
          : theme.differenceChanged;
    context.fillRect(canvasPoint.x, canvasPoint.y, viewport.cellSize, viewport.cellSize);
    if (difference.kind === "removed" && viewport.cellSize >= 8) {
      context.beginPath();
      context.moveTo(canvasPoint.x + 2, canvasPoint.y + 2);
      context.lineTo(canvasPoint.x + viewport.cellSize - 2, canvasPoint.y + viewport.cellSize - 2);
      context.moveTo(canvasPoint.x + viewport.cellSize - 2, canvasPoint.y + 2);
      context.lineTo(canvasPoint.x + 2, canvasPoint.y + viewport.cellSize - 2);
      context.strokeStyle = theme.differenceRemoved;
      context.lineWidth = 1.5;
      context.stroke();
    }
  }
  context.restore();

  context.save();
  context.globalAlpha = 0.66;
  for (const point of points) {
    const canvasPoint = gridPointToCanvas(point, viewport);
    const inset = Math.max(1, viewport.cellSize * 0.08);
    context.fillStyle = erasing ? theme.erase : previewColor;
    context.fillRect(
      canvasPoint.x + inset,
      canvasPoint.y + inset,
      viewport.cellSize - inset * 2,
      viewport.cellSize - inset * 2,
    );
  }
  context.restore();

  if (selection) {
    const topLeft = gridPointToCanvas({ column: selection.left, row: selection.top }, viewport);
    const width = (selection.right - selection.left + 1) * viewport.cellSize;
    const height = (selection.bottom - selection.top + 1) * viewport.cellSize;
    context.fillStyle = theme.selectionFill;
    context.fillRect(topLeft.x, topLeft.y, width, height);
    context.save();
    context.setLineDash([6, 4]);
    context.lineDashOffset = -0.5;
    context.strokeStyle = theme.accent;
    context.lineWidth = 2;
    context.strokeRect(topLeft.x + 1, topLeft.y + 1, width - 2, height - 2);
    context.restore();
  }

  if (hover) {
    const point = gridPointToCanvas(hover, viewport);
    const inset = 1.5;
    context.strokeStyle = theme.accent;
    context.lineWidth = 2;
    context.strokeRect(
      point.x + inset,
      point.y + inset,
      viewport.cellSize - inset * 2,
      viewport.cellSize - inset * 2,
    );
  }
}
