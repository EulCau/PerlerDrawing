import rawMard221V1 from "./data/mard_221_v1.json";
import { PaletteRegistry, parsePaletteFile } from "./palette-registry";

export const MARD_221_V1_IDENTITY = {
  standardId: "mard-221",
  version: "v1",
} as const;

export const mard221V1 = parsePaletteFile(rawMard221V1, MARD_221_V1_IDENTITY);

export const builtInPaletteRegistry = new PaletteRegistry([mard221V1]);
