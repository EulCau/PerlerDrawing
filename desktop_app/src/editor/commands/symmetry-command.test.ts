import { describe, expect, it } from "vitest";
import { mard221V1 } from "../../features/palettes/builtins";
import { createPatternDocument } from "../model/pattern-document";
import { CommandHistory } from "./command-history";
import { createSymmetryCommand } from "./symmetry-command";

describe("symmetry command", () => {
  it("persists an explicit axis and restores the prior constraint on undo", () => {
    const document = createPatternDocument({
      artifact: { name: "symmetry_test", version: "v1" },
      canvas: { columns: 9, rows: 7 },
      board: { columns: 9, rows: 7, subdivision: 1 },
      palette: mard221V1,
    });
    const history = new CommandHistory();
    history.execute(
      document,
      createSymmetryCommand(document, { type: "vertical", axisOrCenter: [4] }),
    );
    expect(document.symmetry).toEqual({ type: "vertical", axisOrCenter: [4] });
    history.undo(document);
    expect(document.symmetry).toEqual({ type: "none", axisOrCenter: undefined });
  });
});
