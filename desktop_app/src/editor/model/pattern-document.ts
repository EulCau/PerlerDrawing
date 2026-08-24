import type { PaletteSnapshot } from "../../features/palettes/palette-types";
import {
  EMPTY_CELL,
  MAX_PALETTE_COLORS,
  assertGridShape,
  cloneGrid,
  createGrid,
  type GridDimensions,
  type PatternGrid,
} from "./grid";

export const PATTERN_DOCUMENT_SCHEMA_VERSION = 1 as const;

export type ArtifactVersion = `v${number}`;
export type SymmetryType = "none" | "vertical" | "horizontal" | "central";

export interface ArtifactIdentity {
  readonly name: string;
  readonly version: ArtifactVersion;
}

export interface BoardSettings extends GridDimensions {
  readonly subdivision: number;
}

export interface SymmetrySettings {
  readonly type: SymmetryType;
  readonly axisOrCenter?: readonly number[];
}

export interface PatternDocument {
  readonly schemaVersion: typeof PATTERN_DOCUMENT_SCHEMA_VERSION;
  readonly artifact: ArtifactIdentity;
  readonly canvas: GridDimensions;
  readonly board: BoardSettings;
  readonly palette: PaletteSnapshot;
  readonly symmetry: SymmetrySettings;
  readonly processing: Readonly<Record<string, unknown>>;
  readonly grid: PatternGrid;
}

export interface CreatePatternDocumentOptions {
  readonly artifact: ArtifactIdentity;
  readonly canvas: GridDimensions;
  readonly board: BoardSettings;
  readonly palette: PaletteSnapshot;
  readonly symmetry?: SymmetrySettings;
  readonly processing?: Readonly<Record<string, unknown>>;
}

function assertArtifactIdentity(artifact: ArtifactIdentity): void {
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(artifact.name)) {
    throw new TypeError("Artifact name must use lowercase snake_case.");
  }
  if (!/^v[1-9]\d*$/.test(artifact.version)) {
    throw new TypeError("Artifact version must use the vN format.");
  }
}

function assertBoardSettings(board: BoardSettings): void {
  if (!Number.isSafeInteger(board.columns) || board.columns <= 0) {
    throw new RangeError("Board columns must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(board.rows) || board.rows <= 0) {
    throw new RangeError("Board rows must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(board.subdivision) || board.subdivision <= 0) {
    throw new RangeError("Board subdivision must be a positive safe integer.");
  }
}

function cloneRgb(rgb: readonly [number, number, number]): readonly [number, number, number] {
  const copy: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
  return Object.freeze(copy);
}

function clonePaletteSnapshot(palette: PaletteSnapshot): PaletteSnapshot {
  return Object.freeze({
    ...palette,
    colors: Object.freeze(
      palette.colors.map((color) =>
        Object.freeze({
          ...color,
          rgb: cloneRgb(color.rgb),
        }),
      ),
    ),
  });
}

export function createPatternDocument(options: CreatePatternDocumentOptions): PatternDocument {
  assertArtifactIdentity(options.artifact);
  assertBoardSettings(options.board);

  const grid = createGrid(options.canvas);
  const document: PatternDocument = {
    schemaVersion: PATTERN_DOCUMENT_SCHEMA_VERSION,
    artifact: { ...options.artifact },
    canvas: { ...options.canvas },
    board: { ...options.board },
    palette: clonePaletteSnapshot(options.palette),
    symmetry: options.symmetry
      ? {
          ...options.symmetry,
          axisOrCenter: options.symmetry.axisOrCenter
            ? [...options.symmetry.axisOrCenter]
            : undefined,
        }
      : { type: "none" },
    processing: { ...(options.processing ?? {}) },
    grid,
  };

  validatePatternDocument(document);
  return document;
}

export function clonePatternDocument(document: PatternDocument): PatternDocument {
  validatePatternDocument(document);
  return {
    ...document,
    artifact: { ...document.artifact },
    canvas: { ...document.canvas },
    board: { ...document.board },
    palette: clonePaletteSnapshot(document.palette),
    symmetry: {
      ...document.symmetry,
      axisOrCenter: document.symmetry.axisOrCenter
        ? [...document.symmetry.axisOrCenter]
        : undefined,
    },
    processing: { ...document.processing },
    grid: cloneGrid(document.grid),
  };
}

export function assertDocumentCellValue(document: PatternDocument, value: number): void {
  if (value === EMPTY_CELL) return;
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    value >= document.palette.colors.length ||
    value >= MAX_PALETTE_COLORS
  ) {
    throw new RangeError(
      `Palette index ${value} is outside [0, ${document.palette.colors.length}).`,
    );
  }
}

export function validatePatternDocument(document: PatternDocument): void {
  if (document.schemaVersion !== PATTERN_DOCUMENT_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported document schema version ${document.schemaVersion}.`);
  }

  assertArtifactIdentity(document.artifact);
  assertBoardSettings(document.board);
  assertGridShape(document.grid);

  if (document.palette.colors.length === 0 || document.palette.colors.length > MAX_PALETTE_COLORS) {
    throw new RangeError(`Palette must contain between 1 and ${MAX_PALETTE_COLORS} colors.`);
  }

  if (
    document.canvas.columns !== document.grid.columns ||
    document.canvas.rows !== document.grid.rows
  ) {
    throw new RangeError("Canvas dimensions do not match grid dimensions.");
  }

  for (const value of document.grid.cells) {
    assertDocumentCellValue(document, value);
  }
}
