import { describe, expect, it } from "vitest";
import { setCell } from "../editor/model/grid";
import { createPatternDocument } from "../editor/model/pattern-document";
import { mard221V1 } from "../features/palettes/builtins";
import { collectDocumentColorIndices, createEditorStore } from "./editor-store";

function createDocument() {
  return createPatternDocument({
    artifact: { name: "palette_test", version: "v1" },
    canvas: { columns: 3, rows: 2 },
    board: { columns: 3, rows: 2, subdivision: 1 },
    palette: mard221V1,
  });
}

describe("editor color bar", () => {
  it("starts blank documents without a paint color", () => {
    const store = createEditorStore();
    const document = createDocument();

    store.getState().resetForDocument(document);

    expect(store.getState().addedColorIndices).toEqual([]);
    expect(store.getState().selectedColorIndex).toBeNull();
  });

  it("restores all colors already used by an imported document", () => {
    const store = createEditorStore();
    const document = createDocument();
    setCell(document.grid, 0, 0, 7);
    setCell(document.grid, 0, 1, 2);
    setCell(document.grid, 1, 2, 7);

    expect(collectDocumentColorIndices(document)).toEqual([2, 7]);
    store.getState().resetForDocument(document);

    expect(store.getState().addedColorIndices).toEqual([2, 7]);
    expect(store.getState().selectedColorIndex).toBe(2);
  });

  it("restores saved drawing colors even when they are not used in the grid", () => {
    const store = createEditorStore();
    const document = createDocument();

    store.getState().resetForDocument(document, {
      addedColorCodes: ["A3", "A8"],
      selectedColorCode: "A8",
    });

    expect(store.getState().addedColorIndices).toEqual([2, 7]);
    expect(store.getState().selectedColorIndex).toBe(7);
  });

  it("only selects colors that were explicitly added", () => {
    const store = createEditorStore();
    store.getState().resetForDocument(createDocument());

    expect(() => store.getState().setSelectedColorIndex(4)).toThrow("Selected color must be added");

    store.getState().addColorIndex(4);
    store.getState().addColorIndex(4);

    expect(store.getState().addedColorIndices).toEqual([4]);
    expect(store.getState().selectedColorIndex).toBe(4);
  });

  it("tracks changes to the color bar fields stored with a project", () => {
    const store = createEditorStore();
    store.getState().resetForDocument(createDocument());
    const initialRevision = store.getState().workspaceRevision;

    store.getState().addColorIndex(2);
    store.getState().addColorIndex(4);
    store.getState().setSelectedColorIndex(2);

    expect(store.getState().workspaceRevision).toBe(initialRevision + 3);
  });
});
