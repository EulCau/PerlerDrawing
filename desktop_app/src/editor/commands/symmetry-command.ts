import type { PatternDocument, SymmetrySettings } from "../model/pattern-document";
import type { DocumentCommand } from "./document-command";

function cloneSettings(settings: SymmetrySettings): SymmetrySettings {
  return {
    type: settings.type,
    axisOrCenter: settings.axisOrCenter ? [...settings.axisOrCenter] : undefined,
  };
}

function assignSettings(document: PatternDocument, settings: SymmetrySettings): void {
  (document as { symmetry: SymmetrySettings }).symmetry = cloneSettings(settings);
}

export class SymmetryCommand implements DocumentCommand {
  readonly label = "Change symmetry drawing constraint";
  readonly isEmpty: boolean;
  readonly #before: SymmetrySettings;
  readonly #after: SymmetrySettings;

  constructor(before: SymmetrySettings, after: SymmetrySettings) {
    this.#before = cloneSettings(before);
    this.#after = cloneSettings(after);
    this.isEmpty = JSON.stringify(this.#before) === JSON.stringify(this.#after);
  }

  apply(document: PatternDocument): void {
    assignSettings(document, this.#after);
  }

  revert(document: PatternDocument): void {
    assignSettings(document, this.#before);
  }
}

export function createSymmetryCommand(
  document: PatternDocument,
  symmetry: SymmetrySettings,
): SymmetryCommand {
  return new SymmetryCommand(document.symmetry, symmetry);
}
