import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PaletteSnapshot } from "../palettes/palette-types";
import type { ImageConversionSettings } from "../image/image-types";
import {
  normalizeCodexProxy,
  validateCodexPlan,
  type CodexCliStatus,
  type CodexPlanEnvelope,
  type CodexProgressEvent,
} from "./codex-types";

interface CodexFailureShape {
  readonly code?: unknown;
  readonly message?: unknown;
}

export class CodexIntegrationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CodexIntegrationError";
    this.code = code;
  }
}

function codexError(error: unknown): CodexIntegrationError {
  if (error instanceof CodexIntegrationError) return error;
  if (typeof error === "object" && error !== null) {
    const shaped = error as CodexFailureShape;
    return new CodexIntegrationError(
      typeof shaped.code === "string" ? shaped.code : "codex_failed",
      typeof shaped.message === "string" ? shaped.message : "Codex processing failed.",
    );
  }
  return new CodexIntegrationError("codex_failed", String(error));
}

export async function detectCodexCli(): Promise<CodexCliStatus> {
  if (!isTauri()) {
    return { available: false, compatible: false, version: null, missingFlags: [] };
  }
  try {
    return await invoke<CodexCliStatus>("detect_codex_cli");
  } catch (error) {
    throw codexError(error);
  }
}

export async function runCodexImagePlan(
  jobId: string,
  inputPath: string,
  settings: ImageConversionSettings,
  palette: PaletteSnapshot,
  proxy: string,
  onProgress: (event: CodexProgressEvent) => void,
): Promise<CodexPlanEnvelope> {
  if (!isTauri()) {
    throw new CodexIntegrationError("desktop_required", "Codex requires the desktop runtime.");
  }
  const unlisten = await listen<CodexProgressEvent>(
    "perlerdrawing://codex-event",
    ({ payload }) => {
      if (payload.job_id === jobId) onProgress(payload);
    },
  );
  try {
    const envelope = await invoke<CodexPlanEnvelope>("run_codex_image_plan", {
      jobId,
      inputPath,
      settings,
      palette: palette.colors,
      timeoutSeconds: 300,
      proxy: normalizeCodexProxy(proxy),
    });
    return { ...envelope, plan: validateCodexPlan(envelope.plan) };
  } catch (error) {
    throw codexError(error);
  } finally {
    unlisten();
  }
}

export async function cancelCodexJob(jobId: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("cancel_codex_job", { jobId });
}
