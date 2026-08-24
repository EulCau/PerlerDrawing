import { describe, expect, it } from "vitest";
import { mard221V1 } from "../../features/palettes/builtins";
import { EMPTY_CELL, setCell } from "./grid";
import {
  clonePatternDocument,
  createPatternDocument,
  validatePatternDocument,
} from "./pattern-document";

function createDocument() {
  return createPatternDocument({
    artifact: { name: "document_test", version: "v1" },
    canvas: { columns: 4, rows: 3 },
    board: { columns: 29, rows: 29, subdivision: 5 },
    palette: mard221V1,
  });
}

describe("pattern document", () => {
  it("creates an empty document with an owned palette snapshot", () => {
    const document = createDocument();

    expect(document.grid.cells.every((value) => value === EMPTY_CELL)).toBe(true);
    expect(document.palette).not.toBe(mard221V1);
    expect(document.palette.colors).not.toBe(mard221V1.colors);
    expect(Object.isFrozen(document.palette)).toBe(true);
  });

  it("clones binary grid storage without sharing mutations", () => {
    const document = createDocument();
    const clone = clonePatternDocument(document);
    setCell(clone.grid, 1, 1, 0);

    expect(document.grid.cells).not.toBe(clone.grid.cells);
    expect(document.grid.cells[5]).toBe(EMPTY_CELL);
    expect(clone.grid.cells[5]).toBe(0);
  });

  it("rejects invalid artifact identities and unknown palette indexes", () => {
    expect(() =>
      createPatternDocument({
        artifact: { name: "Invalid Name", version: "v1" },
        canvas: { columns: 2, rows: 2 },
        board: { columns: 29, rows: 29, subdivision: 5 },
        palette: mard221V1,
      }),
    ).toThrow(/snake_case/);

    const document = createDocument();
    document.grid.cells[0] = 500;
    expect(() => validatePatternDocument(document)).toThrow(/Palette index/);
  });
});
