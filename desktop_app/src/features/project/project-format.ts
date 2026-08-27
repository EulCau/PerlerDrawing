import { clonePatternDocument, createPatternDocument } from "../../editor/model/pattern-document";
import type { PatternDocument, SymmetrySettings } from "../../editor/model/pattern-document";
import { computeOccupiedBounds } from "../../editor/model/occupied-bounds";
import { parsePatternCsv, serializePatternCsv, verifyPatternCsvRoundTrip } from "../csv/csv-format";
import { parsePaletteFile } from "../palettes/palette-registry";
import { createProjectPreview, parseProjectPreview, type ProjectPreview } from "./project-preview";

export const PATTERN_PROJECT_KIND = "perlerdrawing.pattern" as const;
export const PATTERN_PROJECT_SCHEMA_VERSION = 1 as const;

export interface ProjectWorkspaceSnapshot {
  readonly addedColorCodes: readonly string[];
  readonly selectedColorCode?: string;
}

export interface PatternProjectMetadata {
  readonly kind: typeof PATTERN_PROJECT_KIND;
  readonly schemaVersion: typeof PATTERN_PROJECT_SCHEMA_VERSION;
  readonly savedAt: string;
  readonly csv: {
    readonly fileName: string;
    readonly encoding: "utf-8-bom";
    readonly delimiter: "comma";
    readonly includeCoordinates: true;
    readonly byteLength: number;
    readonly checksum: string;
  };
  readonly document: Omit<PatternDocument, "grid">;
  readonly workspace: ProjectWorkspaceSnapshot;
  readonly preview: ProjectPreview;
}

export interface PatternProjectContents {
  readonly csvContents: string;
  readonly metadataContents: string;
}

export interface OpenedPatternProject {
  readonly document: PatternDocument;
  readonly workspace: ProjectWorkspaceSnapshot;
  readonly savedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${path} must be an object.`);
  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string.`);
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new TypeError(`${path} must be a positive integer.`);
  }
  return value as number;
}

function readSymmetry(value: unknown): SymmetrySettings {
  const raw = requiredRecord(value, "document.symmetry");
  if (!["none", "vertical", "horizontal", "central"].includes(String(raw.type))) {
    throw new TypeError("document.symmetry.type is unsupported.");
  }
  const type = raw.type as SymmetrySettings["type"];
  if (raw.axisOrCenter === undefined) return { type };
  if (
    !Array.isArray(raw.axisOrCenter) ||
    raw.axisOrCenter.length === 0 ||
    raw.axisOrCenter.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    throw new TypeError("document.symmetry.axisOrCenter must contain finite numbers.");
  }
  return { type, axisOrCenter: [...raw.axisOrCenter] as number[] };
}

function readWorkspace(
  value: unknown,
  paletteCodes: ReadonlySet<string>,
): ProjectWorkspaceSnapshot {
  if (value === undefined) return { addedColorCodes: [] };
  const raw = requiredRecord(value, "workspace");
  if (
    !Array.isArray(raw.addedColorCodes) ||
    raw.addedColorCodes.some((entry) => typeof entry !== "string")
  ) {
    throw new TypeError("workspace.addedColorCodes must be an array of color codes.");
  }
  const addedColorCodes = [...new Set(raw.addedColorCodes as string[])];
  if (addedColorCodes.some((code) => !paletteCodes.has(code))) {
    throw new TypeError("workspace.addedColorCodes contains a color outside the saved palette.");
  }
  const selectedColorCode =
    raw.selectedColorCode === undefined
      ? undefined
      : requiredString(raw.selectedColorCode, "workspace.selectedColorCode");
  if (selectedColorCode !== undefined && !addedColorCodes.includes(selectedColorCode)) {
    throw new TypeError("workspace.selectedColorCode must be present in addedColorCodes.");
  }
  return { addedColorCodes, selectedColorCode };
}

function validateCsvFileName(fileName: string): void {
  if (
    fileName === "." ||
    fileName === ".." ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    !fileName.toLocaleLowerCase().endsWith(".csv")
  ) {
    throw new TypeError("csv.fileName must be a sibling CSV file name.");
  }
}

export function checksumUtf8(contents: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(contents)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function suggestedProjectBaseName(document: PatternDocument): string {
  const bounds = computeOccupiedBounds(document.grid);
  const size = bounds ? `${bounds.width}x${bounds.height}` : "0x0";
  return `${document.artifact.name}_${size}_${document.artifact.version}`;
}

export function suggestedProjectFileName(document: PatternDocument): string {
  return `${suggestedProjectBaseName(document)}.perler.json`;
}

export function createPatternProjectContents(
  sourceDocument: PatternDocument,
  csvFileName: string,
  workspace: ProjectWorkspaceSnapshot,
  savedAt = new Date().toISOString(),
): PatternProjectContents {
  validateCsvFileName(csvFileName);
  if (!Number.isFinite(Date.parse(savedAt))) throw new TypeError("savedAt must be an ISO date.");

  const document = clonePatternDocument(sourceDocument);
  const paletteCodes = new Set(document.palette.colors.map((color) => color.code));
  const normalizedWorkspace = readWorkspace(workspace, paletteCodes);
  const csvContents = serializePatternCsv(document, {
    delimiter: ",",
    includeCoordinates: true,
  });
  verifyPatternCsvRoundTrip(document, csvContents);
  const csvByteLength = new TextEncoder().encode(csvContents).byteLength;
  const metadata: PatternProjectMetadata = {
    kind: PATTERN_PROJECT_KIND,
    schemaVersion: PATTERN_PROJECT_SCHEMA_VERSION,
    savedAt,
    csv: {
      fileName: csvFileName,
      encoding: "utf-8-bom",
      delimiter: "comma",
      includeCoordinates: true,
      byteLength: csvByteLength,
      checksum: checksumUtf8(csvContents),
    },
    document: {
      schemaVersion: document.schemaVersion,
      artifact: { ...document.artifact },
      canvas: { ...document.canvas },
      board: { ...document.board },
      palette: document.palette,
      symmetry: {
        ...document.symmetry,
        axisOrCenter: document.symmetry.axisOrCenter
          ? [...document.symmetry.axisOrCenter]
          : undefined,
      },
      processing: { ...document.processing },
    },
    workspace: normalizedWorkspace,
    preview: createProjectPreview(document),
  };
  return {
    csvContents,
    metadataContents: `${JSON.stringify(metadata, null, 2)}\n`,
  };
}

export function parsePatternProject(
  metadataContents: string,
  csvContents: string,
): OpenedPatternProject {
  let parsedMetadata: unknown;
  try {
    parsedMetadata = JSON.parse(metadataContents);
  } catch {
    throw new TypeError("Project metadata must be valid JSON.");
  }
  const metadata = requiredRecord(parsedMetadata, "project");
  if (metadata.kind !== PATTERN_PROJECT_KIND) {
    throw new TypeError("The selected JSON file is not a PerlerDrawing project.");
  }
  if (metadata.schemaVersion !== PATTERN_PROJECT_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported project schema version ${String(metadata.schemaVersion)}.`);
  }
  const savedAt = requiredString(metadata.savedAt, "savedAt");
  if (!Number.isFinite(Date.parse(savedAt))) throw new TypeError("savedAt must be an ISO date.");
  parseProjectPreview(metadata.preview);

  const csv = requiredRecord(metadata.csv, "csv");
  const csvFileName = requiredString(csv.fileName, "csv.fileName");
  validateCsvFileName(csvFileName);
  if (
    csv.encoding !== "utf-8-bom" ||
    csv.delimiter !== "comma" ||
    csv.includeCoordinates !== true
  ) {
    throw new TypeError("The project uses unsupported CSV settings.");
  }
  if (!Number.isSafeInteger(csv.byteLength) || (csv.byteLength as number) < 0) {
    throw new TypeError("csv.byteLength must be a non-negative integer.");
  }
  if (typeof csv.checksum !== "string" || !/^[0-9a-f]{16}$/.test(csv.checksum)) {
    throw new TypeError("csv.checksum must be a 64-bit lowercase hexadecimal value.");
  }
  const actualByteLength = new TextEncoder().encode(csvContents).byteLength;
  if (csv.byteLength !== actualByteLength || csv.checksum !== checksumUtf8(csvContents)) {
    throw new TypeError("Project CSV does not match its metadata checksum.");
  }

  const rawDocument = requiredRecord(metadata.document, "document");
  const artifact = requiredRecord(rawDocument.artifact, "document.artifact");
  const canvas = requiredRecord(rawDocument.canvas, "document.canvas");
  const board = requiredRecord(rawDocument.board, "document.board");
  const rawPalette = requiredRecord(rawDocument.palette, "document.palette");
  const palette = parsePaletteFile(
    {
      name: rawPalette.name,
      source: rawPalette.source,
      retrieved: rawPalette.retrieved,
      colors: rawPalette.colors,
    },
    {
      standardId: requiredString(rawPalette.standardId, "document.palette.standardId"),
      version: requiredString(rawPalette.version, "document.palette.version"),
    },
  );
  const processing = requiredRecord(rawDocument.processing, "document.processing");
  const document = createPatternDocument({
    artifact: {
      name: requiredString(artifact.name, "document.artifact.name"),
      version: requiredString(artifact.version, "document.artifact.version") as `v${number}`,
    },
    canvas: {
      columns: positiveInteger(canvas.columns, "document.canvas.columns"),
      rows: positiveInteger(canvas.rows, "document.canvas.rows"),
    },
    board: {
      columns: positiveInteger(board.columns, "document.board.columns"),
      rows: positiveInteger(board.rows, "document.board.rows"),
      subdivision: positiveInteger(board.subdivision, "document.board.subdivision"),
    },
    palette,
    symmetry: readSymmetry(rawDocument.symmetry),
    processing,
  });
  if (rawDocument.schemaVersion !== document.schemaVersion) {
    throw new TypeError(
      `Unsupported document schema version ${String(rawDocument.schemaVersion)}.`,
    );
  }

  const parsedCsv = parsePatternCsv(csvContents, palette);
  if (parsedCsv.format !== "repository" || parsedCsv.delimiter !== "," || !parsedCsv.sourceHadBom) {
    throw new TypeError("Project CSV settings do not match the metadata.");
  }
  if (parsedCsv.unknownCells.length > 0) {
    throw new TypeError("Project CSV contains colors outside the saved palette.");
  }
  if (parsedCsv.columns !== document.canvas.columns || parsedCsv.rows !== document.canvas.rows) {
    throw new TypeError("Project CSV dimensions do not match the metadata canvas.");
  }
  document.grid.cells.set(parsedCsv.cells);
  verifyPatternCsvRoundTrip(document, csvContents);
  const paletteCodes = new Set(palette.colors.map((color) => color.code));
  return {
    document,
    workspace: readWorkspace(metadata.workspace, paletteCodes),
    savedAt,
  };
}
