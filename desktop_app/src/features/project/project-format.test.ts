import { describe, expect, it } from "vitest";
import { EMPTY_CELL } from "../../editor/model/grid";
import { createPatternDocument } from "../../editor/model/pattern-document";
import { mard221V1 } from "../palettes/builtins";
import {
  checksumUtf8,
  createPatternProjectContents,
  parsePatternProject,
  suggestedProjectFileName,
} from "./project-format";

function projectDocument() {
  const document = createPatternDocument({
    artifact: { name: "flower_badge", version: "v2" },
    canvas: { columns: 3, rows: 2 },
    board: { columns: 29, rows: 29, subdivision: 5 },
    palette: mard221V1,
    symmetry: { type: "vertical", axisOrCenter: [1] },
    processing: { source: "unit_test" },
  });
  document.grid.cells.set([0, 1, 0, EMPTY_CELL, 2, EMPTY_CELL]);
  return document;
}

describe("pattern project format", () => {
  it("round-trips a CSV grid and JSON metadata without embedding the grid twice", () => {
    const document = projectDocument();
    const contents = createPatternProjectContents(
      document,
      "flower_badge_3x2_v2.csv",
      { addedColorCodes: ["A1", "A2", "A3"], selectedColorCode: "A2" },
      "2026-08-26T10:00:00.000Z",
    );
    const metadata = JSON.parse(contents.metadataContents) as Record<string, unknown>;
    const opened = parsePatternProject(contents.metadataContents, contents.csvContents);

    expect((metadata.document as Record<string, unknown>).grid).toBeUndefined();
    expect(metadata.preview).toMatchObject({ schemaVersion: 1, columns: 3, rows: 2 });
    expect(opened.document.grid.cells).toEqual(document.grid.cells);
    expect(opened.document.artifact).toEqual(document.artifact);
    expect(opened.document.symmetry).toEqual(document.symmetry);
    expect(opened.workspace).toEqual({
      addedColorCodes: ["A1", "A2", "A3"],
      selectedColorCode: "A2",
    });
  });

  it("rejects a CSV whose dimensions do not match the metadata", () => {
    const contents = createPatternProjectContents(projectDocument(), "flower_badge_3x2_v2.csv", {
      addedColorCodes: [],
    });

    const mismatchedCsv = "\uFEFFrow/col,1\r\n1,A1";
    const metadata = JSON.parse(contents.metadataContents) as {
      csv: { byteLength: number; checksum: string };
    };
    metadata.csv.byteLength = new TextEncoder().encode(mismatchedCsv).byteLength;
    metadata.csv.checksum = checksumUtf8(mismatchedCsv);

    expect(() => parsePatternProject(JSON.stringify(metadata), mismatchedCsv)).toThrow(
      /dimensions do not match/,
    );
  });

  it("rejects a CSV that no longer matches its metadata checksum", () => {
    const contents = createPatternProjectContents(projectDocument(), "flower_badge_3x2_v2.csv", {
      addedColorCodes: [],
    });

    expect(() =>
      parsePatternProject(contents.metadataContents, contents.csvContents.replace("A2", "A3")),
    ).toThrow(/checksum/);
  });

  it("rejects an invalid persisted preview without requiring it for legacy projects", () => {
    const contents = createPatternProjectContents(projectDocument(), "flower_badge_3x2_v2.csv", {
      addedColorCodes: [],
    });
    const metadata = JSON.parse(contents.metadataContents) as Record<string, unknown>;
    delete metadata.preview;
    expect(() => parsePatternProject(JSON.stringify(metadata), contents.csvContents)).not.toThrow();

    metadata.preview = { schemaVersion: 1, columns: 1, rows: 1, colors: [], cells: "0000" };
    expect(() => parsePatternProject(JSON.stringify(metadata), contents.csvContents)).toThrow(
      /color index/,
    );
  });

  it("uses the final occupied bounds in its suggested file name", () => {
    expect(suggestedProjectFileName(projectDocument())).toBe("flower_badge_3x2_v2.perler.json");
  });
});
