import Papa, { type ParseError, type ParseResult } from "papaparse";
import { EMPTY_CELL } from "../../editor/model/grid";
import {
  clonePatternDocument,
  createPatternDocument,
  type BoardSettings,
  type PatternDocument,
} from "../../editor/model/pattern-document";
import type { PaletteSnapshot } from "../palettes/palette-types";

export const CSV_BYTE_LIMIT = 8 * 1024 * 1024;
export const CSV_DIMENSION_LIMIT = 500;
export const UTF8_BOM = "\uFEFF";

export type CsvDelimiter = "," | "\t";
export type PatternCsvFormat = "repository" | "simple";
export type CsvImportErrorCode =
  | "empty"
  | "too_large"
  | "invalid_csv"
  | "inconsistent_rows"
  | "invalid_coordinates"
  | "dimensions";

export class CsvImportError extends Error {
  readonly code: CsvImportErrorCode;
  readonly details?: Readonly<Record<string, number | string>>;

  constructor(
    code: CsvImportErrorCode,
    message: string,
    details?: Readonly<Record<string, number | string>>,
  ) {
    super(message);
    this.name = "CsvImportError";
    this.code = code;
    this.details = details;
  }
}

export interface UnknownCsvCell {
  readonly row: number;
  readonly column: number;
  readonly value: string;
  readonly reason: "unknown" | "ambiguous_hex";
}

export interface ParsedPatternCsv {
  readonly format: PatternCsvFormat;
  readonly delimiter: CsvDelimiter;
  readonly sourceHadBom: boolean;
  readonly columns: number;
  readonly rows: number;
  readonly cells: Uint16Array;
  readonly nonEmptyCellCount: number;
  readonly unknownCells: readonly UnknownCsvCell[];
}

export interface CsvTransformOptions {
  readonly transpose: boolean;
  readonly flipHorizontal: boolean;
  readonly flipVertical: boolean;
}

export interface TransformedCsvGrid {
  readonly columns: number;
  readonly rows: number;
  readonly cells: Uint16Array;
}

export interface CreateDocumentFromCsvOptions {
  readonly artifactName: string;
  readonly board: BoardSettings;
  readonly transform: CsvTransformOptions;
  readonly sourceFileName: string;
}

export interface SerializePatternCsvOptions {
  readonly includeCoordinates: boolean;
  readonly delimiter?: CsvDelimiter;
}

interface ParsedRows {
  readonly delimiter: CsvDelimiter;
  readonly rows: string[][];
  readonly errors: readonly ParseError[];
}

function withoutTerminalParserRow(rows: string[][], source: string): string[][] {
  const last = rows.at(-1);
  if ((source.endsWith("\n") || source.endsWith("\r")) && last?.length === 1 && last[0] === "") {
    return rows.slice(0, -1);
  }
  return rows;
}

function parseWithDelimiter(source: string, delimiter: CsvDelimiter): ParsedRows {
  const result: ParseResult<string[]> = Papa.parse<string[]>(source, {
    delimiter,
    dynamicTyping: false,
    skipEmptyLines: false,
  });
  return {
    delimiter,
    rows: withoutTerminalParserRow(result.data, source),
    errors: result.errors,
  };
}

function candidateScore(candidate: ParsedRows): number {
  if (candidate.rows.length === 0 || candidate.errors.length > 0) return -1;
  const width = candidate.rows[0]?.length ?? 0;
  if (width === 0 || candidate.rows.some((row) => row.length !== width)) return 0;
  return width === 1 ? 1 : 10_000 + width;
}

function parseDelimitedRows(source: string): ParsedRows {
  const auto = Papa.parse<string[]>(source, {
    delimiter: "",
    delimitersToGuess: [",", "\t"],
    dynamicTyping: false,
    skipEmptyLines: false,
  });
  const autoErrors = auto.errors.filter((error) => error.code !== "UndetectableDelimiter");
  if (
    !auto.errors.some((error) => error.code === "UndetectableDelimiter") &&
    (auto.meta.delimiter === "," || auto.meta.delimiter === "\t")
  ) {
    return {
      delimiter: auto.meta.delimiter,
      rows: withoutTerminalParserRow(auto.data, source),
      errors: autoErrors,
    };
  }

  const comma = parseWithDelimiter(source, ",");
  const tab = parseWithDelimiter(source, "\t");
  if (source.includes(",") && !source.includes("\t")) return comma;
  if (source.includes("\t") && !source.includes(",")) return tab;
  return candidateScore(tab) > candidateScore(comma) ? tab : comma;
}

function isCoordinateSequence(values: readonly string[]): boolean {
  return values.every((value, index) => value.trim() === String(index + 1));
}

function stripCoordinates(rows: string[][]): {
  readonly format: PatternCsvFormat;
  readonly rows: string[][];
} {
  const firstRow = rows[0];
  if (!firstRow) throw new CsvImportError("empty", "CSV contains no rows.");
  const marker = firstRow[0]?.trim().toLocaleLowerCase() ?? "";
  const explicitRepositoryFormat = marker === "row/col";
  const blankCoordinateHeader =
    marker === "" && firstRow.length > 1 && isCoordinateSequence(firstRow.slice(1));

  if (!explicitRepositoryFormat && !blankCoordinateHeader) {
    return { format: "simple", rows };
  }
  if (firstRow.length < 2 || !isCoordinateSequence(firstRow.slice(1))) {
    throw new CsvImportError(
      "invalid_coordinates",
      "CSV column coordinates must be consecutive integers starting at 1.",
    );
  }

  const dataRows = rows.slice(1);
  if (
    dataRows.length === 0 ||
    !dataRows.every((row, index) => row[0]?.trim() === String(index + 1))
  ) {
    throw new CsvImportError(
      "invalid_coordinates",
      "CSV row coordinates must be consecutive integers starting at 1.",
    );
  }
  return { format: "repository", rows: dataRows.map((row) => row.slice(1)) };
}

function paletteIndexes(palette: PaletteSnapshot): {
  readonly byCode: ReadonlyMap<string, number>;
  readonly byHex: ReadonlyMap<string, readonly number[]>;
} {
  const byCode = new Map<string, number>();
  const mutableByHex = new Map<string, number[]>();
  palette.colors.forEach((color, index) => {
    byCode.set(color.code.toLocaleUpperCase(), index);
    const hex = color.hex.toLocaleUpperCase();
    const indexes = mutableByHex.get(hex) ?? [];
    indexes.push(index);
    mutableByHex.set(hex, indexes);
  });
  return { byCode, byHex: mutableByHex };
}

export function parsePatternCsv(source: string, palette: PaletteSnapshot): ParsedPatternCsv {
  const byteLength = new TextEncoder().encode(source).byteLength;
  if (byteLength > CSV_BYTE_LIMIT) {
    throw new CsvImportError("too_large", "CSV exceeds the byte limit.", {
      byteLength,
      maximum: CSV_BYTE_LIMIT,
    });
  }
  const sourceHadBom = source.startsWith(UTF8_BOM);
  const text = sourceHadBom ? source.slice(1) : source;
  if (text.length === 0) {
    throw new CsvImportError("empty", "CSV is empty.");
  }
  if (text.includes("\0")) {
    throw new CsvImportError("invalid_csv", "CSV contains a NUL character.");
  }

  const parsed = parseDelimitedRows(text);
  if (parsed.errors.length > 0) {
    const firstError = parsed.errors[0];
    throw new CsvImportError("invalid_csv", firstError?.message ?? "CSV syntax is invalid.", {
      row: (firstError?.row ?? 0) + 1,
    });
  }
  if (parsed.rows.length === 0) throw new CsvImportError("empty", "CSV contains no rows.");

  const rowWidth = parsed.rows[0]?.length ?? 0;
  const inconsistentRow = parsed.rows.findIndex((row) => row.length !== rowWidth);
  if (rowWidth === 0 || inconsistentRow >= 0) {
    throw new CsvImportError(
      "inconsistent_rows",
      "CSV rows must all contain the same number of cells.",
      inconsistentRow >= 0
        ? {
            row: inconsistentRow + 1,
            expected: rowWidth,
            actual: parsed.rows[inconsistentRow]?.length ?? 0,
          }
        : undefined,
    );
  }

  const stripped = stripCoordinates(parsed.rows);
  const rows = stripped.rows.length;
  const columns = stripped.rows[0]?.length ?? 0;
  if (rows < 1 || columns < 1 || rows > CSV_DIMENSION_LIMIT || columns > CSV_DIMENSION_LIMIT) {
    throw new CsvImportError("dimensions", "CSV dimensions are outside the supported range.", {
      rows,
      columns,
      maximum: CSV_DIMENSION_LIMIT,
    });
  }
  if (stripped.rows.some((row) => row.length !== columns)) {
    throw new CsvImportError(
      "inconsistent_rows",
      "CSV data rows must all contain the same number of cells.",
    );
  }

  const indexes = paletteIndexes(palette);
  const cells = new Uint16Array(rows * columns);
  cells.fill(EMPTY_CELL);
  const unknownCells: UnknownCsvCell[] = [];
  let nonEmptyCellCount = 0;

  stripped.rows.forEach((row, rowIndex) => {
    row.forEach((rawValue, columnIndex) => {
      const value = rawValue.trim();
      if (value === "") return;
      nonEmptyCellCount += 1;
      const normalized = value.toLocaleUpperCase();
      const codeIndex = indexes.byCode.get(normalized);
      if (codeIndex !== undefined) {
        cells[rowIndex * columns + columnIndex] = codeIndex;
        return;
      }

      const hexIndexes = /^#[0-9A-F]{6}$/.test(normalized)
        ? indexes.byHex.get(normalized)
        : undefined;
      if (hexIndexes?.length === 1 && hexIndexes[0] !== undefined) {
        cells[rowIndex * columns + columnIndex] = hexIndexes[0];
        return;
      }

      unknownCells.push({
        row: rowIndex + 1,
        column: columnIndex + 1,
        value,
        reason: hexIndexes && hexIndexes.length > 1 ? "ambiguous_hex" : "unknown",
      });
    });
  });

  return {
    format: stripped.format,
    delimiter: parsed.delimiter,
    sourceHadBom,
    columns,
    rows,
    cells,
    nonEmptyCellCount,
    unknownCells,
  };
}

export function transformParsedCsv(
  parsed: ParsedPatternCsv,
  options: CsvTransformOptions,
): TransformedCsvGrid {
  const columns = options.transpose ? parsed.rows : parsed.columns;
  const rows = options.transpose ? parsed.columns : parsed.rows;
  const cells = new Uint16Array(columns * rows);
  cells.fill(EMPTY_CELL);

  for (let sourceRow = 0; sourceRow < parsed.rows; sourceRow += 1) {
    for (let sourceColumn = 0; sourceColumn < parsed.columns; sourceColumn += 1) {
      let targetColumn = options.transpose ? sourceRow : sourceColumn;
      let targetRow = options.transpose ? sourceColumn : sourceRow;
      if (options.flipHorizontal) targetColumn = columns - 1 - targetColumn;
      if (options.flipVertical) targetRow = rows - 1 - targetRow;
      cells[targetRow * columns + targetColumn] =
        parsed.cells[sourceRow * parsed.columns + sourceColumn] ?? EMPTY_CELL;
    }
  }

  return { columns, rows, cells };
}

export function createDocumentFromCsv(
  parsed: ParsedPatternCsv,
  palette: PaletteSnapshot,
  options: CreateDocumentFromCsvOptions,
): PatternDocument {
  if (parsed.unknownCells.length > 0) {
    throw new CsvImportError("invalid_csv", "CSV contains unresolved color values.");
  }
  const transformed = transformParsedCsv(parsed, options.transform);
  const document = createPatternDocument({
    artifact: { name: options.artifactName, version: "v1" },
    canvas: { columns: transformed.columns, rows: transformed.rows },
    board: options.board,
    palette,
    processing: {
      source: "csv_import",
      sourceFileName: options.sourceFileName,
      csvFormat: parsed.format,
      delimiter: parsed.delimiter === "\t" ? "tab" : "comma",
      sourceHadBom: parsed.sourceHadBom,
      transform: { ...options.transform },
    },
  });
  document.grid.cells.set(transformed.cells);
  return document;
}

export function serializePatternCsv(
  sourceDocument: PatternDocument,
  options: SerializePatternCsvOptions,
): string {
  const document = clonePatternDocument(sourceDocument);
  const delimiter = options.delimiter ?? ",";
  const matrix: string[][] = [];
  if (options.includeCoordinates) {
    matrix.push([
      "row/col",
      ...Array.from({ length: document.grid.columns }, (_, index) => String(index + 1)),
    ]);
  }

  for (let row = 0; row < document.grid.rows; row += 1) {
    const values = Array.from({ length: document.grid.columns }, (_, column) => {
      const value = document.grid.cells[row * document.grid.columns + column];
      if (value === undefined || value === EMPTY_CELL) return "";
      const color = document.palette.colors[value];
      if (!color) throw new Error(`Grid contains missing palette index ${value}.`);
      return color.code;
    });
    matrix.push(options.includeCoordinates ? [String(row + 1), ...values] : values);
  }

  const quoteSingleColumnEmpties = !options.includeCoordinates && document.grid.columns === 1;
  const body = Papa.unparse(matrix, {
    delimiter,
    newline: "\r\n",
    quotes: (value) => quoteSingleColumnEmpties && value === "",
  });
  return `${UTF8_BOM}${body}`;
}

export function verifyPatternCsvRoundTrip(document: PatternDocument, serialized: string): void {
  const parsed = parsePatternCsv(serialized, document.palette);
  if (parsed.unknownCells.length > 0) throw new Error("Round-trip produced unknown colors.");
  if (parsed.columns !== document.grid.columns || parsed.rows !== document.grid.rows) {
    throw new Error("Round-trip changed grid dimensions.");
  }
  for (let index = 0; index < document.grid.cells.length; index += 1) {
    if (parsed.cells[index] !== document.grid.cells[index]) {
      throw new Error(`Round-trip changed grid cell ${index}.`);
    }
  }
}

export function csvArtifactName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(?:csv|tsv)$/i, "");
  const normalized = withoutExtension
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "imported_pattern";
}
