import { describe, expect, it } from "vitest";
import { mard221V1 } from "../../features/palettes/builtins";
import { EMPTY_CELL, getCell, setCell } from "../model/grid";
import { createPatternDocument } from "../model/pattern-document";
import { CommandHistory } from "./command-history";
import { createGridPatchCommand } from "./grid-patch-command";

function createDocument() {
  return createPatternDocument({
    artifact: { name: "test_pattern", version: "v1" },
    canvas: { columns: 5, rows: 4 },
    board: { columns: 29, rows: 29, subdivision: 5 },
    palette: mard221V1,
  });
}

describe("command history", () => {
  it("applies, undoes, and redoes one atomic grid command", () => {
    const document = createDocument();
    const history = new CommandHistory();
    const command = createGridPatchCommand(document, "draw stroke", [
      { row: 1, column: 1, value: 0 },
      { row: 1, column: 2, value: 1 },
      { row: 1, column: 1, value: 2 },
    ]);

    expect(command.changeCount).toBe(2);
    expect(history.execute(document, command)).toBe(true);
    expect(getCell(document.grid, 1, 1)).toBe(2);
    expect(getCell(document.grid, 1, 2)).toBe(1);
    expect(history.undo(document)).toBe(true);
    expect(getCell(document.grid, 1, 1)).toBe(EMPTY_CELL);
    expect(history.redo(document)).toBe(true);
    expect(getCell(document.grid, 1, 1)).toBe(2);
  });

  it("rejects divergent state before mutating any patched cell", () => {
    const document = createDocument();
    const command = createGridPatchCommand(document, "draw", [
      { row: 0, column: 0, value: 0 },
      { row: 0, column: 1, value: 1 },
    ]);
    setCell(document.grid, 0, 1, 2);

    expect(() => command.apply(document)).toThrow(/diverged/);
    expect(getCell(document.grid, 0, 0)).toBe(EMPTY_CELL);
    expect(getCell(document.grid, 0, 1)).toBe(2);
  });

  it("clears redo history after a new command", () => {
    const document = createDocument();
    const history = new CommandHistory();
    history.execute(
      document,
      createGridPatchCommand(document, "first", [{ row: 0, column: 0, value: 0 }]),
    );
    history.undo(document);
    history.execute(
      document,
      createGridPatchCommand(document, "replacement", [{ row: 0, column: 1, value: 1 }]),
    );

    expect(history.canRedo).toBe(false);
  });
});
