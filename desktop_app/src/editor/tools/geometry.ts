export interface GridPoint {
  readonly column: number;
  readonly row: number;
}

function assertGridPoint(point: GridPoint): void {
  if (!Number.isSafeInteger(point.column) || !Number.isSafeInteger(point.row)) {
    throw new RangeError("Grid point coordinates must be safe integers.");
  }
}

function assertStrokeWidth(strokeWidth: number): void {
  if (!Number.isSafeInteger(strokeWidth) || strokeWidth <= 0) {
    throw new RangeError("Stroke width must be a positive safe integer.");
  }
}

function pointKey(point: GridPoint): string {
  return `${point.row}:${point.column}`;
}

function sortedPoints(points: Iterable<GridPoint>): GridPoint[] {
  return [...points].sort((left, right) => left.row - right.row || left.column - right.column);
}

function addPoint(points: Map<string, GridPoint>, column: number, row: number): void {
  const point = { column, row };
  points.set(pointKey(point), point);
}

function squareStrokeOffsets(strokeWidth: number): readonly number[] {
  assertStrokeWidth(strokeWidth);
  const first = -Math.floor((strokeWidth - 1) / 2);
  return Array.from({ length: strokeWidth }, (_, index) => first + index);
}

/**
 * Rasterizes a Bresenham line and stamps a square integer-width brush on every path cell.
 * For even widths, the extra row and column are anchored toward positive coordinates.
 */
export function rasterizeLine(start: GridPoint, end: GridPoint, strokeWidth = 1): GridPoint[] {
  assertGridPoint(start);
  assertGridPoint(end);
  const offsets = squareStrokeOffsets(strokeWidth);
  const points = new Map<string, GridPoint>();
  const startComesFirst =
    start.column < end.column || (start.column === end.column && start.row <= end.row);
  const lineStart = startComesFirst ? start : end;
  const lineEnd = startComesFirst ? end : start;
  let column = lineStart.column;
  let row = lineStart.row;
  const deltaColumn = Math.abs(lineEnd.column - lineStart.column);
  const deltaRow = Math.abs(lineEnd.row - lineStart.row);
  const stepColumn = lineStart.column < lineEnd.column ? 1 : -1;
  const stepRow = lineStart.row < lineEnd.row ? 1 : -1;
  let error = deltaColumn - deltaRow;

  while (true) {
    for (const rowOffset of offsets) {
      for (const columnOffset of offsets) {
        addPoint(points, column + columnOffset, row + rowOffset);
      }
    }

    if (column === lineEnd.column && row === lineEnd.row) break;
    const doubledError = 2 * error;
    if (doubledError > -deltaRow) {
      error -= deltaRow;
      column += stepColumn;
    }
    if (doubledError < deltaColumn) {
      error += deltaColumn;
      row += stepRow;
    }
  }

  return sortedPoints(points.values());
}

export function rasterizeRectangle(
  start: GridPoint,
  end: GridPoint,
  options: { readonly filled: boolean; readonly strokeWidth?: number },
): GridPoint[] {
  assertGridPoint(start);
  assertGridPoint(end);
  const strokeWidth = options.strokeWidth ?? 1;
  assertStrokeWidth(strokeWidth);
  const minColumn = Math.min(start.column, end.column);
  const maxColumn = Math.max(start.column, end.column);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const points: GridPoint[] = [];

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const onStroke =
        column - minColumn < strokeWidth ||
        maxColumn - column < strokeWidth ||
        row - minRow < strokeWidth ||
        maxRow - row < strokeWidth;

      if (options.filled || onStroke) points.push({ column, row });
    }
  }

  return points;
}

function ellipseFill(start: GridPoint, end: GridPoint): Map<string, GridPoint> {
  const minColumn = Math.min(start.column, end.column);
  const maxColumn = Math.max(start.column, end.column);
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const centerColumn = (minColumn + maxColumn) / 2;
  const centerRow = (minRow + maxRow) / 2;
  const radiusColumn = Math.max((maxColumn - minColumn + 1) / 2, 0.5);
  const radiusRow = Math.max((maxRow - minRow + 1) / 2, 0.5);
  const points = new Map<string, GridPoint>();

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      const normalizedColumn = (column - centerColumn) / radiusColumn;
      const normalizedRow = (row - centerRow) / radiusRow;
      if (normalizedColumn ** 2 + normalizedRow ** 2 <= 1 + Number.EPSILON) {
        addPoint(points, column, row);
      }
    }
  }

  return points;
}

export function rasterizeEllipse(
  start: GridPoint,
  end: GridPoint,
  options: { readonly filled: boolean; readonly strokeWidth?: number },
): GridPoint[] {
  assertGridPoint(start);
  assertGridPoint(end);
  const strokeWidth = options.strokeWidth ?? 1;
  assertStrokeWidth(strokeWidth);
  const fill = ellipseFill(start, end);
  if (options.filled) return sortedPoints(fill.values());

  const remaining = new Map(fill);
  const stroke = new Map<string, GridPoint>();
  const neighbors = [
    { column: 1, row: 0 },
    { column: -1, row: 0 },
    { column: 0, row: 1 },
    { column: 0, row: -1 },
  ] as const;

  for (let layer = 0; layer < strokeWidth && remaining.size > 0; layer += 1) {
    const boundary: GridPoint[] = [];

    for (const point of remaining.values()) {
      const isBoundary = neighbors.some(
        (offset) =>
          !remaining.has(
            pointKey({
              column: point.column + offset.column,
              row: point.row + offset.row,
            }),
          ),
      );
      if (isBoundary) boundary.push(point);
    }

    for (const point of boundary) {
      const key = pointKey(point);
      stroke.set(key, point);
      remaining.delete(key);
    }
  }

  return sortedPoints(stroke.values());
}
