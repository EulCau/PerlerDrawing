import { describe, expect, it } from "vitest";
import { normalizeProjectMetadataPath, projectCsvPath } from "./project-transport";

describe("project path helpers", () => {
  it("normalizes Linux and Windows save paths to the project extension", () => {
    expect(normalizeProjectMetadataPath("/tmp/flower.json")).toBe("/tmp/flower.perler.json");
    expect(normalizeProjectMetadataPath("C:\\Patterns\\flower")).toBe(
      "C:\\Patterns\\flower.perler.json",
    );
  });

  it("derives the same-name sibling CSV path", () => {
    expect(projectCsvPath("/tmp/flower.perler.json")).toBe("/tmp/flower.csv");
    expect(projectCsvPath("C:\\Patterns\\flower.perler.json")).toBe("C:\\Patterns\\flower.csv");
  });
});
