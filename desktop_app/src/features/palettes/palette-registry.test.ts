import { describe, expect, it } from "vitest";
import repositoryMard221V1 from "../../../../palettes/mard_221_v1.json";
import rawMard221V1 from "./data/mard_221_v1.json";
import { MARD_221_V1_IDENTITY, builtInPaletteRegistry, mard221V1 } from "./builtins";
import { PaletteRegistry, PaletteValidationError, parsePaletteFile } from "./palette-registry";

describe("palette registry", () => {
  it("loads the complete MARD 221 v1 snapshot without invented colors", () => {
    expect(mard221V1.name).toBe("MARD 221 v1");
    expect(mard221V1.colors).toHaveLength(221);
    expect(mard221V1.colors[0]).toMatchObject({
      code: "A1",
      hex: "#FAF5CD",
      rgb: [250, 245, 205],
    });
    expect(mard221V1.colors.at(-1)).toMatchObject({ code: "M15", hex: "#747D7A" });
    expect(builtInPaletteRegistry.get(MARD_221_V1_IDENTITY)).toEqual(mard221V1);
  });

  it("keeps the bundled immutable snapshot identical to the repository palette", () => {
    expect(rawMard221V1).toEqual(repositoryMard221V1);
  });

  it("rejects duplicate codes and malformed RGB values", () => {
    expect(() =>
      parsePaletteFile(
        {
          name: "Invalid",
          colors: [
            { code: "A1", hex: "#FFFFFF" },
            { code: "A1", hex: "#FFF" },
          ],
        },
        { standardId: "custom-test", version: "v1" },
      ),
    ).toThrow(PaletteValidationError);
  });

  it("does not allow one identity to be registered twice", () => {
    const registry = new PaletteRegistry([mard221V1]);
    expect(() => registry.register(mard221V1)).toThrow(/already registered/);
  });

  it("rejects missing required color fields", () => {
    expect(() =>
      parsePaletteFile(
        { name: "Missing code", colors: [{ hex: "#FFFFFF" }] },
        { standardId: "custom-test", version: "v1" },
      ),
    ).toThrow(PaletteValidationError);
  });
});
