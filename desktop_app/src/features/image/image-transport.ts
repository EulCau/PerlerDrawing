import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PaletteSnapshot } from "../palettes/palette-types";
import type {
  ImageConversionSettings,
  ImageJobProgress,
  ImageJobResultEnvelope,
} from "./image-types";

export const IMAGE_BYTE_LIMIT = 64 * 1024 * 1024;

export interface SelectedImageFile {
  readonly name: string;
  readonly byteLength: number;
  readonly path: string | null;
  readonly previewUrl: string;
}

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

interface SidecarEventEnvelope {
  readonly job_id: string;
  readonly event: ImageJobProgress;
}

interface SidecarFailureShape {
  readonly code?: unknown;
  readonly message?: unknown;
}

export class ImageProcessingError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ImageProcessingError";
    this.code = code;
  }
}

function imageMimeType(name: string): string {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  return "image/jpeg";
}

function imageNameFromPath(path: string): string {
  return path.split(/[\\/]/).at(-1) || "imported_image.png";
}

function ensureImageSize(byteLength: number): void {
  if (byteLength > IMAGE_BYTE_LIMIT) {
    throw new ImageProcessingError("image_too_large", "Image exceeds the 64 MB file limit.");
  }
}

async function browserImageFile(): Promise<SelectedImageFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp";
    input.hidden = true;
    const cleanup = () => input.remove();
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0];
        if (!file) {
          cleanup();
          resolve(null);
          return;
        }
        try {
          ensureImageSize(file.size);
          resolve({
            name: file.name,
            byteLength: file.size,
            path: null,
            previewUrl: URL.createObjectURL(file),
          });
        } catch (error) {
          reject(error);
        } finally {
          cleanup();
        }
      },
      { once: true },
    );
    input.addEventListener(
      "cancel",
      () => {
        cleanup();
        resolve(null);
      },
      { once: true },
    );
    document.body.append(input);
    input.click();
  });
}

export async function pickImageFile(): Promise<SelectedImageFile | null> {
  if (!isTauri()) return browserImageFile();
  const [{ open }, { readFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const path = await open({
    directory: false,
    multiple: false,
    filters: [{ name: "PNG / JPEG / WebP", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (typeof path !== "string") return null;
  const bytes = await readFile(path);
  ensureImageSize(bytes.byteLength);
  const name = imageNameFromPath(path);
  return {
    name,
    byteLength: bytes.byteLength,
    path,
    previewUrl: URL.createObjectURL(new Blob([bytes], { type: imageMimeType(name) })),
  };
}

export function inspectImageDimensions(previewUrl: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener(
      "load",
      () => resolve({ width: image.naturalWidth, height: image.naturalHeight }),
      { once: true },
    );
    image.addEventListener(
      "error",
      () =>
        reject(new ImageProcessingError("invalid_image", "The selected image cannot be decoded.")),
      { once: true },
    );
    image.src = previewUrl;
  });
}

export function revokeImageUrl(url: string | null | undefined): void {
  if (url) URL.revokeObjectURL(url);
}

function sidecarError(error: unknown): ImageProcessingError {
  if (error instanceof ImageProcessingError) return error;
  if (typeof error === "object" && error !== null) {
    const shaped = error as SidecarFailureShape;
    const code = typeof shaped.code === "string" ? shaped.code : "processing_failed";
    const message =
      typeof shaped.message === "string" ? shaped.message : "Image processing failed.";
    return new ImageProcessingError(code, message);
  }
  return new ImageProcessingError("processing_failed", String(error));
}

export async function runImageJob(
  jobId: string,
  inputPath: string,
  settings: ImageConversionSettings,
  palette: PaletteSnapshot,
  onProgress: (event: ImageJobProgress) => void,
): Promise<ImageJobResultEnvelope> {
  if (!isTauri()) {
    throw new ImageProcessingError(
      "desktop_required",
      "Image conversion requires the desktop runtime.",
    );
  }
  const unlisten = await listen<SidecarEventEnvelope>(
    "perlerdrawing://sidecar-event",
    ({ payload }) => {
      if (payload.job_id === jobId) onProgress(payload.event);
    },
  );
  try {
    return await invoke<ImageJobResultEnvelope>("run_image_job", {
      jobId,
      inputPath,
      settings,
      palette: palette.colors,
    });
  } catch (error) {
    throw sidecarError(error);
  } finally {
    unlisten();
  }
}

export async function cancelImageJob(jobId: string): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("cancel_sidecar_job", { jobId });
}

export async function readJobImage(
  jobId: string,
  fileName: "master.png" | "pattern.png",
): Promise<string> {
  const bytes = await invoke<number[]>("read_job_asset", { jobId, fileName });
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
}

export function createJobId(prefix: "image" | "export"): string {
  const suffix =
    globalThis.crypto?.randomUUID?.().replaceAll("-", "") ??
    `${Date.now()}${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}
