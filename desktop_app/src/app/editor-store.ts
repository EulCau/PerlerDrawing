import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { EMPTY_CELL } from "../editor/model/grid";
import type { PatternDocument } from "../editor/model/pattern-document";

export type EditorTool =
  | "brush"
  | "eraser"
  | "eyedropper"
  | "fill"
  | "line"
  | "rectangle"
  | "ellipse"
  | "selection"
  | "pan";

interface EditorState {
  readonly activeTool: EditorTool;
  readonly selectedColorIndex: number | null;
  readonly addedColorIndices: readonly number[];
  readonly paletteColorCount: number;
  readonly strokeWidth: number;
  readonly shapeFilled: boolean;
  setActiveTool(tool: EditorTool): void;
  setSelectedColorIndex(index: number): void;
  addColorIndex(index: number): void;
  setStrokeWidth(width: number): void;
  setShapeFilled(filled: boolean): void;
  resetForDocument(document: PatternDocument): void;
}

export function collectDocumentColorIndices(document: PatternDocument): number[] {
  const used = new Set<number>();
  for (const value of document.grid.cells) {
    if (value !== EMPTY_CELL && value < document.palette.colors.length) used.add(value);
  }
  return [...used].sort((left, right) => left - right);
}

function assertPaletteIndex(index: number, paletteColorCount: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index >= paletteColorCount) {
    throw new RangeError(`Color index must be an integer between 0 and ${paletteColorCount - 1}.`);
  }
}

export function createEditorStore(): StoreApi<EditorState> {
  return createStore<EditorState>((set, get) => ({
    activeTool: "brush",
    selectedColorIndex: null,
    addedColorIndices: Object.freeze([]),
    paletteColorCount: 0,
    strokeWidth: 1,
    shapeFilled: false,

    setActiveTool(activeTool) {
      set({ activeTool });
    },

    setSelectedColorIndex(selectedColorIndex) {
      const { addedColorIndices, paletteColorCount } = get();
      assertPaletteIndex(selectedColorIndex, paletteColorCount);
      if (!addedColorIndices.includes(selectedColorIndex)) {
        throw new RangeError("Selected color must be added to the editor palette first.");
      }
      set({ selectedColorIndex });
    },

    addColorIndex(index) {
      const { addedColorIndices, paletteColorCount } = get();
      assertPaletteIndex(index, paletteColorCount);
      if (addedColorIndices.includes(index)) {
        set({ selectedColorIndex: index });
        return;
      }
      set({
        addedColorIndices: Object.freeze([...addedColorIndices, index]),
        selectedColorIndex: index,
      });
    },

    setStrokeWidth(strokeWidth) {
      if (!Number.isSafeInteger(strokeWidth) || strokeWidth < 1 || strokeWidth > 12) {
        throw new RangeError("Stroke width must be an integer between 1 and 12.");
      }
      set({ strokeWidth });
    },

    setShapeFilled(shapeFilled) {
      set({ shapeFilled });
    },

    resetForDocument(document) {
      const addedColorIndices = Object.freeze(collectDocumentColorIndices(document));
      set({
        activeTool: "brush",
        selectedColorIndex: addedColorIndices[0] ?? null,
        addedColorIndices,
        paletteColorCount: document.palette.colors.length,
        strokeWidth: 1,
        shapeFilled: false,
      });
    },
  }));
}

export const editorStore = createEditorStore();

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}
