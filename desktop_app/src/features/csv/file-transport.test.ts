import { describe, expect, it } from "vitest";
import { UTF8_BOM } from "./csv-format";
import { decodeCsvBytes } from "./file-transport";

describe("CSV file transport", () => {
  it("decodes UTF-8 and leaves BOM handling to the parser", () => {
    const bytes = new TextEncoder().encode(`${UTF8_BOM}A1,A2`);
    expect(decodeCsvBytes(bytes)).toBe(`${UTF8_BOM}A1,A2`);
  });

  it("rejects malformed UTF-8 bytes", () => {
    expect(() => decodeCsvBytes(new Uint8Array([0xc3, 0x28]))).toThrow("valid UTF-8");
  });
});
