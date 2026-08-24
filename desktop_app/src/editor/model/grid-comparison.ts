import { EMPTY_CELL, type PatternGrid } from "./grid";

export type CellDifferenceKind = "added" | "removed" | "changed";

export interface CellDifference {
  readonly column: number;
  readonly row: number;
  readonly kind: CellDifferenceKind;
}

export interface GridComparison {
  readonly columns: number;
  readonly rows: number;
  readonly dimensionsMatch: boolean;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly differences: readonly CellDifference[];
}

export function comparePatternGrids(current: PatternGrid, reference: PatternGrid): GridComparison {
  const columns = Math.max(current.columns, reference.columns);
  const rows = Math.max(current.rows, reference.rows);
  const differences: CellDifference[] = [];
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const currentValue =
        row < current.rows && column < current.columns
          ? (current.cells[row * current.columns + column] ?? EMPTY_CELL)
          : EMPTY_CELL;
      const referenceValue =
        row < reference.rows && column < reference.columns
          ? (reference.cells[row * reference.columns + column] ?? EMPTY_CELL)
          : EMPTY_CELL;
      if (currentValue === referenceValue) continue;
      const kind: CellDifferenceKind =
        referenceValue === EMPTY_CELL
          ? "added"
          : currentValue === EMPTY_CELL
            ? "removed"
            : "changed";
      if (kind === "added") added += 1;
      else if (kind === "removed") removed += 1;
      else changed += 1;
      if (row < current.rows && column < current.columns) differences.push({ row, column, kind });
    }
  }
  return {
    columns: reference.columns,
    rows: reference.rows,
    dimensionsMatch: current.columns === reference.columns && current.rows === reference.rows,
    added,
    removed,
    changed,
    differences,
  };
}
