export const EMPTY_CELL = 0xffff;
export const MAX_PALETTE_COLORS = EMPTY_CELL;

export interface GridDimensions {
  readonly columns: number;
  readonly rows: number;
}

export interface PatternGrid extends GridDimensions {
  readonly cells: Uint16Array;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
}

export function assertStoredCellValue(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > EMPTY_CELL) {
    throw new RangeError(`Cell value ${value} is outside the Uint16 range.`);
  }
}

export function assertGridDimensions(dimensions: GridDimensions): void {
  assertPositiveInteger(dimensions.columns, "columns");
  assertPositiveInteger(dimensions.rows, "rows");

  const cellCount = dimensions.columns * dimensions.rows;
  if (!Number.isSafeInteger(cellCount)) {
    throw new RangeError("Grid cell count exceeds the safe integer range.");
  }
}

export function createGrid(
  dimensions: GridDimensions,
  initialValue: number = EMPTY_CELL,
): PatternGrid {
  assertGridDimensions(dimensions);
  assertStoredCellValue(initialValue);

  const cells = new Uint16Array(dimensions.columns * dimensions.rows);
  cells.fill(initialValue);

  return {
    columns: dimensions.columns,
    rows: dimensions.rows,
    cells,
  };
}

export function cloneGrid(grid: PatternGrid): PatternGrid {
  assertGridShape(grid);
  return {
    columns: grid.columns,
    rows: grid.rows,
    cells: grid.cells.slice(),
  };
}

export function assertGridShape(grid: PatternGrid): void {
  assertGridDimensions(grid);
  const expectedLength = grid.columns * grid.rows;
  if (grid.cells.length !== expectedLength) {
    throw new RangeError(`Grid contains ${grid.cells.length} cells, expected ${expectedLength}.`);
  }
}

export function cellIndex(grid: GridDimensions, row: number, column: number): number {
  if (!Number.isInteger(row) || row < 0 || row >= grid.rows) {
    throw new RangeError(`Row ${row} is outside [0, ${grid.rows}).`);
  }
  if (!Number.isInteger(column) || column < 0 || column >= grid.columns) {
    throw new RangeError(`Column ${column} is outside [0, ${grid.columns}).`);
  }

  return row * grid.columns + column;
}

export function getCell(grid: PatternGrid, row: number, column: number): number {
  return grid.cells[cellIndex(grid, row, column)] ?? EMPTY_CELL;
}

export function setCell(grid: PatternGrid, row: number, column: number, value: number): number {
  assertStoredCellValue(value);
  const index = cellIndex(grid, row, column);
  const previousValue = grid.cells[index];

  if (previousValue === undefined) {
    throw new RangeError(`Cell index ${index} is outside the grid storage.`);
  }

  grid.cells[index] = value;
  return previousValue;
}
