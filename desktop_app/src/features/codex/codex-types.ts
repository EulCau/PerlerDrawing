import type { ImageConversionSettings } from "../image/image-types";

export interface CodexCliStatus {
  readonly available: boolean;
  readonly compatible: boolean;
  readonly version: string | null;
  readonly missingFlags: readonly string[];
}

export interface CodexProgressEvent {
  readonly job_id: string;
  readonly stage: string;
  readonly progress: number;
  readonly event_count: number;
}

export interface CodexImagePlan {
  readonly background_mode: ImageConversionSettings["background_mode"];
  readonly background_tolerance: number;
  readonly wavelet_strength: number;
  readonly alpha_threshold: number;
  readonly color_count: number;
  readonly symmetry: ImageConversionSettings["symmetry"];
  readonly rationale: string;
}

export interface CodexPlanEnvelope {
  readonly plan: CodexImagePlan;
  readonly cliVersion: string;
  readonly finalMessage: string;
}

function finiteInRange(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function validateCodexPlan(plan: CodexImagePlan): CodexImagePlan {
  if (
    !["auto", "preserve", "none"].includes(plan.background_mode) ||
    !finiteInRange(plan.background_tolerance, 4, 60) ||
    !finiteInRange(plan.wavelet_strength, 0, 1) ||
    !finiteInRange(plan.alpha_threshold, 0.05, 0.95) ||
    !Number.isInteger(plan.color_count) ||
    plan.color_count < 2 ||
    plan.color_count > 64 ||
    !["none", "vertical", "horizontal", "central"].includes(plan.symmetry)
  ) {
    throw new RangeError("Codex plan contains parameters outside the allowed bounds.");
  }
  const rationale = plan.rationale.trim();
  if (rationale.length < 1 || [...rationale].length > 500) {
    throw new RangeError("Codex plan rationale is invalid.");
  }
  return { ...plan, rationale };
}

export function applyCodexPlan(
  settings: ImageConversionSettings,
  untrustedPlan: CodexImagePlan,
): ImageConversionSettings {
  const plan = validateCodexPlan(untrustedPlan);
  return {
    ...settings,
    background_mode: plan.background_mode,
    background_tolerance: plan.background_tolerance,
    wavelet_strength: plan.wavelet_strength,
    alpha_threshold: plan.alpha_threshold,
    color_count: plan.color_count,
    symmetry: plan.symmetry,
  };
}
