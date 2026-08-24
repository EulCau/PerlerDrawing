import { describe, expect, it } from "vitest";
import type { ImageConversionSettings } from "../image/image-types";
import { applyCodexPlan, validateCodexPlan, type CodexImagePlan } from "./codex-types";

const plan: CodexImagePlan = {
  background_mode: "auto",
  background_tolerance: 21,
  wavelet_strength: 0.65,
  alpha_threshold: 0.3,
  color_count: 20,
  symmetry: "vertical",
  rationale: " Preserve the centered silhouette. ",
};

const settings: ImageConversionSettings = {
  columns: 87,
  rows: 87,
  color_count: 24,
  alpha_threshold: 0.28,
  background_mode: "auto",
  background_tolerance: 18,
  wavelet_strength: 0.55,
  seed: 20260824,
  remove_tiny_components: true,
  symmetry: "none",
};

describe("Codex image plan validation", () => {
  it("applies only validated preprocessing fields", () => {
    expect(applyCodexPlan(settings, plan)).toEqual({
      ...settings,
      background_tolerance: 21,
      wavelet_strength: 0.65,
      alpha_threshold: 0.3,
      color_count: 20,
      symmetry: "vertical",
    });
  });

  it("rejects parameters outside the local processor bounds", () => {
    expect(() => validateCodexPlan({ ...plan, color_count: 65 })).toThrow(RangeError);
    expect(() => validateCodexPlan({ ...plan, background_tolerance: Number.NaN })).toThrow(
      RangeError,
    );
    expect(() => validateCodexPlan({ ...plan, rationale: " " })).toThrow(RangeError);
  });
});
