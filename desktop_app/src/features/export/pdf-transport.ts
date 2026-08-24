import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createJobId, ImageProcessingError } from "../image/image-transport";
import type { ImageJobProgress } from "../image/image-types";
import type { CompleteExportSnapshot } from "./export-transport";

interface SidecarEventEnvelope {
  readonly job_id: string;
  readonly event: ImageJobProgress;
}

export interface BoardPdfResult {
  readonly artifact_id: string;
  readonly pdf_path: string;
  readonly page_count: number;
}

export async function choosePdfPath(fileName: string): Promise<string | null> {
  if (!isTauri()) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({
    defaultPath: fileName,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
}

export async function runBoardPdfExport(
  snapshot: CompleteExportSnapshot,
  pdfPath: string,
  onProgress: (event: ImageJobProgress) => void,
): Promise<BoardPdfResult> {
  if (!isTauri()) {
    throw new ImageProcessingError("desktop_required", "PDF export requires the desktop runtime.");
  }
  const jobId = createJobId("pdf");
  const unlisten = await listen<SidecarEventEnvelope>(
    "perlerdrawing://sidecar-event",
    ({ payload }) => {
      if (payload.job_id === jobId) onProgress(payload.event);
    },
  );
  try {
    return await invoke<BoardPdfResult>("run_pdf_export_job", {
      jobId,
      pdfPath,
      snapshot,
    });
  } finally {
    unlisten();
  }
}
