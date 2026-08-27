import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { EMPTY_CELL } from "../editor/model/grid";
import type { PatternDocument } from "../editor/model/pattern-document";
import type { ProjectWorkspaceSnapshot } from "../features/project/project-format";

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
  readonly workspaceRevision: number;
  setActiveTool(tool: EditorTool): void;
  setSelectedColorIndex(index: number): void;
  addColorIndex(index: number): void;
  setStrokeWidth(width: number): void;
  setShapeFilled(filled: boolean): void;
  resetForDocument(document: PatternDocument, workspace?: ProjectWorkspaceSnapshot): void;
}

export function collectDocumentColorIndices(document: PatternDocument): number[] {
  const used = new Set<number>();
  for (const value of document.grid.cells) {
    if (value !== EMPTY_CELL && value < document.palette.colors.length) used.add(value);
  }
  return [...used].sort((left, right) => left - right);
}

export function createProjectWorkspaceSnapshot(
  document: PatternDocument,
  state: Pick<EditorState, "addedColorIndices" | "selectedColorIndex">,
): ProjectWorkspaceSnapshot {
  const addedColorCodes = state.addedColorIndices.flatMap((index) => {
    const color = document.palette.colors[index];
    return color ? [color.code] : [];
  });
  const selectedColorCode =
    state.selectedColorIndex === null
      ? undefined
      : document.palette.colors[state.selectedColorIndex]?.code;
  return { addedColorCodes, selectedColorCode };
}

function restoredColorIndices(
  document: PatternDocument,
  workspace?: ProjectWorkspaceSnapshot,
): number[] {
  const byCode = new Map(document.palette.colors.map((color, index) => [color.code, index]));
  const restored = (workspace?.addedColorCodes ?? []).flatMap((code) => {
    const index = byCode.get(code);
    return index === undefined ? [] : [index];
  });
  return [...new Set([...restored, ...collectDocumentColorIndices(document)])];
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
    workspaceRevision: 0,

    setActiveTool(activeTool) {
      set({ activeTool });
    },

    setSelectedColorIndex(selectedColorIndex) {
      const { addedColorIndices, paletteColorCount, workspaceRevision } = get();
      assertPaletteIndex(selectedColorIndex, paletteColorCount);
      if (!addedColorIndices.includes(selectedColorIndex)) {
        throw new RangeError("Selected color must be added to the editor palette first.");
      }
      if (selectedColorIndex !== get().selectedColorIndex) {
        set({ selectedColorIndex, workspaceRevision: workspaceRevision + 1 });
      }
    },

    addColorIndex(index) {
      const { addedColorIndices, paletteColorCount, selectedColorIndex, workspaceRevision } = get();
      assertPaletteIndex(index, paletteColorCount);
      if (addedColorIndices.includes(index)) {
        if (selectedColorIndex !== index) {
          set({ selectedColorIndex: index, workspaceRevision: workspaceRevision + 1 });
        }
        return;
      }
      set({
        addedColorIndices: Object.freeze([...addedColorIndices, index]),
        selectedColorIndex: index,
        workspaceRevision: workspaceRevision + 1,
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

    resetForDocument(document, workspace) {
      const addedColorIndices = Object.freeze(restoredColorIndices(document, workspace));
      const selectedColorIndex = workspace?.selectedColorCode
        ? document.palette.colors.findIndex((color) => color.code === workspace.selectedColorCode)
        : -1;
      set((state) => ({
        activeTool: "brush",
        selectedColorIndex:
          selectedColorIndex >= 0 && addedColorIndices.includes(selectedColorIndex)
            ? selectedColorIndex
            : (addedColorIndices[0] ?? null),
        addedColorIndices,
        paletteColorCount: document.palette.colors.length,
        strokeWidth: 1,
        shapeFilled: false,
        workspaceRevision: state.workspaceRevision + 1,
      }));
    },
  }));
}

export const editorStore = createEditorStore();

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}
