import { EMPTY_CELL, cellIndex, type PatternGrid } from "../model/grid";
import type { GridPoint } from "./geometry";

export function floodFillCells(
  grid: PatternGrid,
  start: GridPoint,
  replacementValue: number,
): GridPoint[] {
  const startIndex = cellIndex(grid, start.row, start.column);
  const targetValue = grid.cells[startIndex];
  if (targetValue === undefined || targetValue === replacementValue) return [];
  if (
    !Number.isInteger(replacementValue) ||
    replacementValue < 0 ||
    replacementValue > EMPTY_CELL
  ) {
    throw new RangeError("Replacement value must fit the grid cell storage.");
  }

  const visited = new Uint8Array(grid.cells.length);
  const queue = new Uint32Array(grid.cells.length);
  const result: GridPoint[] = [];
  let head = 0;
  let tail = 1;
  queue[0] = startIndex;
  visited[startIndex] = 1;

  while (head < tail) {
    const index = queue[head];
    head += 1;
    if (index === undefined || grid.cells[index] !== targetValue) continue;

    const row = Math.floor(index / grid.columns);
    const column = index - row * grid.columns;
    result.push({ column, row });

    const neighbors = [
      column > 0 ? index - 1 : -1,
      column + 1 < grid.columns ? index + 1 : -1,
      row > 0 ? index - grid.columns : -1,
      row + 1 < grid.rows ? index + grid.columns : -1,
    ];

    for (const neighbor of neighbors) {
      if (neighbor < 0 || visited[neighbor] === 1 || grid.cells[neighbor] !== targetValue) continue;
      visited[neighbor] = 1;
      queue[tail] = neighbor;
      tail += 1;
    }
  }

  return result;
}
