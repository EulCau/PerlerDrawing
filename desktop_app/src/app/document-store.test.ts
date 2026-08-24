import { describe, expect, it } from "vitest";
import { createGridPatchCommand } from "../editor/commands/grid-patch-command";
import { EMPTY_CELL, getCell } from "../editor/model/grid";
import { createPatternDocument } from "../editor/model/pattern-document";
import { mard221V1 } from "../features/palettes/builtins";
import { createDocumentStore } from "./document-store";

function createDocument() {
  return createPatternDocument({
    artifact: { name: "store_test", version: "v1" },
    canvas: { columns: 3, rows: 3 },
    board: { columns: 29, rows: 29, subdivision: 5 },
    palette: mard221V1,
  });
}

describe("document store", () => {
  it("owns a document copy and publishes undo state", () => {
    const source = createDocument();
    const store = createDocumentStore();
    store.getState().openDocument(source);
    const owned = store.getState().document;

    expect(owned).not.toBe(source);
    expect(owned?.grid.cells).not.toBe(source.grid.cells);
    if (!owned) throw new Error("Expected an open document.");

    const command = createGridPatchCommand(owned, "paint", [{ row: 1, column: 1, value: 0 }]);
    expect(store.getState().executeCommand(command)).toBe(true);
    expect(store.getState().canUndo).toBe(true);
    expect(getCell(store.getState().document!.grid, 1, 1)).toBe(0);

    expect(store.getState().undo()).toBe(true);
    expect(getCell(store.getState().document!.grid, 1, 1)).toBe(EMPTY_CELL);
    expect(store.getState().canRedo).toBe(true);
  });
});
