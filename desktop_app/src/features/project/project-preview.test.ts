import { describe, expect, it } from "vitest";
import { EMPTY_CELL } from "../../editor/model/grid";
import { createPatternDocument } from "../../editor/model/pattern-document";
import { mard221V1 } from "../palettes/builtins";
import {
  createProjectPreview,
  parseProjectPreview,
  projectPreviewDataUrl,
  PROJECT_PREVIEW_MAX_DIMENSION,
} from "./project-preview";

function createDocument(columns = 3, rows = 2) {
  return createPatternDocument({
    artifact: { name: "preview_test", version: "v1" },
    canvas: { columns, rows },
    board: { columns: 29, rows: 29, subdivision: 5 },
    palette: mard221V1,
  });
}

describe("project previews", () => {
  it("stores a compact crop using palette colors and transparent cells", () => {
    const document = createDocument();
    document.grid.cells.set([EMPTY_CELL, 0, EMPTY_CELL, 1, 1, EMPTY_CELL]);

    const preview = createProjectPreview(document);

    expect(preview).toEqual({
      schemaVersion: 1,
      columns: 2,
      rows: 2,
      colors: [mard221V1.colors[0]?.hex, mard221V1.colors[1]?.hex],
      cells: "ffff000000010001",
    });
    expect(projectPreviewDataUrl(preview)).toMatch(/^data:image\/svg\+xml/);
  });

  it("bounds large previews while retaining their aspect ratio", () => {
    const document = createDocument(120, 60);
    document.grid.cells.fill(0);

    expect(createProjectPreview(document)).toMatchObject({
      columns: PROJECT_PREVIEW_MAX_DIMENSION,
      rows: PROJECT_PREVIEW_MAX_DIMENSION / 2,
    });
  });

  it("rejects preview color references outside the compact palette", () => {
    expect(() =>
      parseProjectPreview({ schemaVersion: 1, columns: 1, rows: 1, colors: [], cells: "0000" }),
    ).toThrow(/color index/);
  });
});
