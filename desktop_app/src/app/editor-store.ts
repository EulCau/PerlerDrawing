import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

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
  readonly selectedColorIndex: number;
  readonly strokeWidth: number;
  readonly shapeFilled: boolean;
  setActiveTool(tool: EditorTool): void;
  setSelectedColorIndex(index: number): void;
  setStrokeWidth(width: number): void;
  setShapeFilled(filled: boolean): void;
  resetForDocument(): void;
}

export const editorStore = createStore<EditorState>((set) => ({
  activeTool: "brush",
  selectedColorIndex: 0,
  strokeWidth: 1,
  shapeFilled: false,

  setActiveTool(activeTool) {
    set({ activeTool });
  },

  setSelectedColorIndex(selectedColorIndex) {
    if (!Number.isSafeInteger(selectedColorIndex) || selectedColorIndex < 0) {
      throw new RangeError("Selected color index must be a non-negative safe integer.");
    }
    set({ selectedColorIndex });
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

  resetForDocument() {
    set({
      activeTool: "brush",
      selectedColorIndex: 0,
      strokeWidth: 1,
      shapeFilled: false,
    });
  },
}));

export function useEditorStore<T>(selector: (state: EditorState) => T): T {
  return useStore(editorStore, selector);
}
