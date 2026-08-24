import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { CommandHistory } from "../editor/commands/command-history";
import type { DocumentCommand } from "../editor/commands/document-command";
import {
  clonePatternDocument,
  validatePatternDocument,
  type PatternDocument,
} from "../editor/model/pattern-document";

export interface DocumentState {
  readonly document: PatternDocument | null;
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  openDocument(document: PatternDocument): void;
  closeDocument(): void;
  executeCommand(command: DocumentCommand): boolean;
  undo(): boolean;
  redo(): boolean;
}

function changedDocumentReference(document: PatternDocument): PatternDocument {
  return {
    ...document,
    grid: {
      ...document.grid,
    },
  };
}

export function createDocumentStore(): StoreApi<DocumentState> {
  const history = new CommandHistory();

  return createStore<DocumentState>((set, get) => ({
    document: null,
    revision: 0,
    canUndo: false,
    canRedo: false,

    openDocument(document) {
      validatePatternDocument(document);
      history.clear();
      set((state) => ({
        document: clonePatternDocument(document),
        revision: state.revision + 1,
        canUndo: false,
        canRedo: false,
      }));
    },

    closeDocument() {
      history.clear();
      set((state) => ({
        document: null,
        revision: state.revision + 1,
        canUndo: false,
        canRedo: false,
      }));
    },

    executeCommand(command) {
      const document = get().document;
      if (!document) throw new Error("Cannot execute a command without an open document.");
      if (!history.execute(document, command)) return false;

      set((state) => ({
        document: changedDocumentReference(document),
        revision: state.revision + 1,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
      }));
      return true;
    },

    undo() {
      const document = get().document;
      if (!document || !history.undo(document)) return false;

      set((state) => ({
        document: changedDocumentReference(document),
        revision: state.revision + 1,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
      }));
      return true;
    },

    redo() {
      const document = get().document;
      if (!document || !history.redo(document)) return false;

      set((state) => ({
        document: changedDocumentReference(document),
        revision: state.revision + 1,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
      }));
      return true;
    },
  }));
}

export const documentStore = createDocumentStore();

export function useDocumentStore<T>(selector: (state: DocumentState) => T): T {
  return useStore(documentStore, selector);
}
