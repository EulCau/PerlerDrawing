import type { PatternDocument } from "../model/pattern-document";
import type { DocumentCommand } from "./document-command";

export const DEFAULT_HISTORY_LIMIT = 200;

export class CommandHistory {
  readonly #limit: number;
  readonly #undoStack: DocumentCommand[] = [];
  readonly #redoStack: DocumentCommand[] = [];

  constructor(limit: number = DEFAULT_HISTORY_LIMIT) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new RangeError("Command history limit must be a positive safe integer.");
    }
    this.#limit = limit;
  }

  get canUndo(): boolean {
    return this.#undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.#redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.#undoStack.length;
  }

  get redoDepth(): number {
    return this.#redoStack.length;
  }

  execute(document: PatternDocument, command: DocumentCommand): boolean {
    if (command.isEmpty) return false;

    command.apply(document);
    this.#undoStack.push(command);
    if (this.#undoStack.length > this.#limit) this.#undoStack.shift();
    this.#redoStack.length = 0;
    return true;
  }

  undo(document: PatternDocument): boolean {
    const command = this.#undoStack.at(-1);
    if (!command) return false;

    command.revert(document);
    this.#undoStack.pop();
    this.#redoStack.push(command);
    return true;
  }

  redo(document: PatternDocument): boolean {
    const command = this.#redoStack.at(-1);
    if (!command) return false;

    command.apply(document);
    this.#redoStack.pop();
    this.#undoStack.push(command);
    return true;
  }

  clear(): void {
    this.#undoStack.length = 0;
    this.#redoStack.length = 0;
  }
}
