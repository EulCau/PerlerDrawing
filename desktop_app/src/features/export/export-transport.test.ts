import { describe, expect, it } from "vitest";
import { createPatternDocument } from "../../editor/model/pattern-document";
import { mard221V1 } from "../palettes/builtins";
import { createCompleteExportSnapshot } from "./export-transport";

describe("complete export snapshot", () => {
  it("clones cells so later editing cannot change an in-flight export", () => {
    const document = createPatternDocument({
      artifact: { name: "test_pattern", version: "v1" },
      canvas: { columns: 2, rows: 2 },
      board: { columns: 2, rows: 2, subdivision: 1 },
      palette: mard221V1,
    });
    document.grid.cells[0] = 3;
    const snapshot = createCompleteExportSnapshot(document);
    document.grid.cells[0] = 8;

    expect(snapshot.cells[0]).toBe(3);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.cells)).toBe(true);
  });
});
