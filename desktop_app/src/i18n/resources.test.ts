import { describe, expect, it } from "vitest";
import { resources } from "./resources";

function leafKeys(value: object, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "object" && child !== null ? leafKeys(child, path) : [path];
  });
}

describe("translation resources", () => {
  it("keeps Chinese and English resource keys identical", () => {
    const chineseKeys = leafKeys(resources["zh-CN"].translation).sort();
    const englishKeys = leafKeys(resources["en-US"].translation).sort();

    expect(chineseKeys).toEqual(englishKeys);
  });
});
