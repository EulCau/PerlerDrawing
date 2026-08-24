import type { CellChange } from "../commands/grid-patch-command";
import type { GridDimensions } from "../model/grid";
import type { SymmetrySettings } from "../model/pattern-document";

function reflectedCoordinate(value: number, axis: number): number {
  return Math.round(axis * 2 - value);
}

function symmetryPoint(
  change: CellChange,
  grid: GridDimensions,
  symmetry: SymmetrySettings,
): { readonly column: number; readonly row: number } | null {
  if (symmetry.type === "none") return null;
  if (symmetry.type === "vertical") {
    const axis = symmetry.axisOrCenter?.[0] ?? (grid.columns - 1) / 2;
    return { column: reflectedCoordinate(change.column, axis), row: change.row };
  }
  if (symmetry.type === "horizontal") {
    const axis = symmetry.axisOrCenter?.[0] ?? (grid.rows - 1) / 2;
    return { column: change.column, row: reflectedCoordinate(change.row, axis) };
  }
  const centerRow = symmetry.axisOrCenter?.[0] ?? (grid.rows - 1) / 2;
  const centerColumn = symmetry.axisOrCenter?.[1] ?? (grid.columns - 1) / 2;
  return {
    column: reflectedCoordinate(change.column, centerColumn),
    row: reflectedCoordinate(change.row, centerRow),
  };
}

export function applySymmetryToChanges(
  changes: readonly CellChange[],
  grid: GridDimensions,
  symmetry: SymmetrySettings,
): CellChange[] {
  if (symmetry.type === "none") return changes.map((change) => ({ ...change }));
  const expanded = new Map<string, CellChange>();
  for (const change of changes) {
    expanded.set(`${change.row}:${change.column}`, { ...change });
    const point = symmetryPoint(change, grid, symmetry);
    if (
      point &&
      point.column >= 0 &&
      point.row >= 0 &&
      point.column < grid.columns &&
      point.row < grid.rows
    ) {
      expanded.set(`${point.row}:${point.column}`, { ...point, value: change.value });
    }
  }
  return [...expanded.values()];
}
