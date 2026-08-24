import { cellIndex } from "../model/grid";
import { assertDocumentCellValue, type PatternDocument } from "../model/pattern-document";
import type { DocumentCommand } from "./document-command";

export interface CellChange {
  readonly row: number;
  readonly column: number;
  readonly value: number;
}

interface CellPatch {
  readonly index: number;
  readonly before: number;
  readonly after: number;
}

function assertCommandLabel(label: string): void {
  if (label.trim().length === 0) {
    throw new TypeError("Command label cannot be empty.");
  }
}

export class GridPatchCommand implements DocumentCommand {
  readonly label: string;
  readonly #patches: readonly CellPatch[];

  constructor(label: string, patches: readonly CellPatch[]) {
    assertCommandLabel(label);
    this.label = label;
    this.#patches = patches.map((patch) => ({ ...patch }));
  }

  get isEmpty(): boolean {
    return this.#patches.length === 0;
  }

  get changeCount(): number {
    return this.#patches.length;
  }

  apply(document: PatternDocument): void {
    this.#applyPatches(document, false);
  }

  revert(document: PatternDocument): void {
    this.#applyPatches(document, true);
  }

  #applyPatches(document: PatternDocument, reverse: boolean): void {
    for (const patch of this.#patches) {
      const expected = reverse ? patch.after : patch.before;
      const next = reverse ? patch.before : patch.after;
      const current = document.grid.cells[patch.index];

      if (current === undefined) {
        throw new RangeError(`Patch index ${patch.index} is outside the document grid.`);
      }
      if (current !== expected) {
        throw new Error(
          `Command history diverged at cell ${patch.index}: expected ${expected}, found ${current}.`,
        );
      }
      assertDocumentCellValue(document, next);
    }

    for (const patch of this.#patches) {
      document.grid.cells[patch.index] = reverse ? patch.before : patch.after;
    }
  }
}

export function createGridPatchCommand(
  document: PatternDocument,
  label: string,
  changes: readonly CellChange[],
): GridPatchCommand {
  assertCommandLabel(label);
  const patchesByIndex = new Map<number, CellPatch>();

  for (const change of changes) {
    assertDocumentCellValue(document, change.value);
    const index = cellIndex(document.grid, change.row, change.column);
    const existingPatch = patchesByIndex.get(index);
    const before = existingPatch?.before ?? document.grid.cells[index];

    if (before === undefined) {
      throw new RangeError(`Cell index ${index} is outside the document grid.`);
    }

    if (before === change.value) {
      patchesByIndex.delete(index);
    } else {
      patchesByIndex.set(index, {
        index,
        before,
        after: change.value,
      });
    }
  }

  const patches = [...patchesByIndex.values()].sort((left, right) => left.index - right.index);
  return new GridPatchCommand(label, patches);
}
