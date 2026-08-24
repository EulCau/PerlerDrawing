import type { PatternDocument } from "../model/pattern-document";

export interface DocumentCommand {
  readonly label: string;
  readonly isEmpty: boolean;
  apply(document: PatternDocument): void;
  revert(document: PatternDocument): void;
}
