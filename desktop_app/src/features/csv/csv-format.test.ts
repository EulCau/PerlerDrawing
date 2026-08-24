import { describe, expect, it } from "vitest";
import { setCell } from "../../editor/model/grid";
import { createPatternDocument } from "../../editor/model/pattern-document";
import { mard221V1 } from "../palettes/builtins";
import {
  CSV_DIMENSION_LIMIT,
  UTF8_BOM,
  csvArtifactName,
  parsePatternCsv,
  serializePatternCsv,
  transformParsedCsv,
  verifyPatternCsvRoundTrip,
} from "./csv-format";

describe("pattern CSV", () => {
  const colorIndex = (code: string) => mard221V1.colors.findIndex((color) => color.code === code);

  it("parses the repository coordinate format with a BOM", () => {
    const parsed = parsePatternCsv(`${UTF8_BOM}row/col,1,2\r\n1,A1,\r\n2,,H7`, mard221V1);

    expect(parsed).toMatchObject({
      format: "repository",
      delimiter: ",",
      sourceHadBom: true,
      columns: 2,
      rows: 2,
      nonEmptyCellCount: 2,
      unknownCells: [],
    });
    expect([...parsed.cells]).toEqual([colorIndex("A1"), 65535, 65535, colorIndex("H7")]);
  });

  it("detects a single-row tab matrix and maps exact palette RGB values", () => {
    const parsed = parsePatternCsv("A1\t#010101\t", mard221V1);
    expect(parsed.delimiter).toBe("\t");
    expect(parsed.format).toBe("simple");
    expect([...parsed.cells]).toEqual([colorIndex("A1"), colorIndex("H7"), 65535]);
  });

  it("preserves quoted delimiters as one unknown cell", () => {
    const parsed = parsePatternCsv('A1,"NOT,REAL"\nA2,A3', mard221V1);
    expect(parsed.unknownCells).toEqual([
      { row: 1, column: 2, value: "NOT,REAL", reason: "unknown" },
    ]);
  });

  it("rejects inconsistent row widths", () => {
    expect(() => parsePatternCsv("A1,A2\nA3", mard221V1)).toThrowError(
      expect.objectContaining({ code: "inconsistent_rows" }),
    );
  });

  it("rejects malformed explicit coordinate headers", () => {
    expect(() => parsePatternCsv("row/col,1,3\n1,A1,A2", mard221V1)).toThrowError(
      expect.objectContaining({ code: "invalid_coordinates" }),
    );
  });

  it("reports every unknown value at its one-based data coordinate", () => {
    const parsed = parsePatternCsv("A1,NOPE\n#123456,H1", mard221V1);
    expect(parsed.unknownCells).toEqual([
      { row: 1, column: 2, value: "NOPE", reason: "unknown" },
      { row: 2, column: 1, value: "#123456", reason: "unknown" },
    ]);
  });

  it("applies transpose before explicit horizontal and vertical flips", () => {
    const parsed = parsePatternCsv("A1,A2,A3\nA4,A5,A6", mard221V1);
    const transformed = transformParsedCsv(parsed, {
      transpose: true,
      flipHorizontal: true,
      flipVertical: true,
    });
    expect(transformed.columns).toBe(2);
    expect(transformed.rows).toBe(3);
    expect([...transformed.cells]).toEqual([5, 2, 4, 1, 3, 0]);
  });

  it("exports repository CSV with BOM and verifies exact round-trip", () => {
    const document = createPatternDocument({
      artifact: { name: "round_trip", version: "v1" },
      canvas: { columns: 3, rows: 2 },
      board: { columns: 29, rows: 29, subdivision: 5 },
      palette: mard221V1,
    });
    setCell(document.grid, 0, 0, 0);
    setCell(document.grid, 1, 2, 205);

    const serialized = serializePatternCsv(document, { includeCoordinates: true });
    expect(serialized.startsWith(`${UTF8_BOM}row/col,1,2,3\r\n`)).toBe(true);
    expect(() => verifyPatternCsvRoundTrip(document, serialized)).not.toThrow();
  });

  it("round-trips coordinate-free single-column empty rows", () => {
    const document = createPatternDocument({
      artifact: { name: "empty_column", version: "v1" },
      canvas: { columns: 1, rows: 3 },
      board: { columns: 29, rows: 29, subdivision: 5 },
      palette: mard221V1,
    });
    const serialized = serializePatternCsv(document, { includeCoordinates: false });
    expect(() => verifyPatternCsvRoundTrip(document, serialized)).not.toThrow();
  });

  it("round-trips an empty coordinate-free tab matrix", () => {
    const document = createPatternDocument({
      artifact: { name: "empty_tab_matrix", version: "v1" },
      canvas: { columns: 4, rows: 3 },
      board: { columns: 29, rows: 29, subdivision: 5 },
      palette: mard221V1,
    });
    const serialized = serializePatternCsv(document, {
      includeCoordinates: false,
      delimiter: "\t",
    });
    expect(() => verifyPatternCsvRoundTrip(document, serialized)).not.toThrow();
  });

  it("enforces the dimension limit and normalizes imported file names", () => {
    const tooWide = Array.from({ length: CSV_DIMENSION_LIMIT + 1 }, () => "A1").join(",");
    expect(() => parsePatternCsv(tooWide, mard221V1)).toThrowError(
      expect.objectContaining({ code: "dimensions" }),
    );
    expect(csvArtifactName("My Pattern 01.CSV")).toBe("my_pattern_01");
    expect(csvArtifactName("拼豆.csv")).toBe("imported_pattern");
  });
});
