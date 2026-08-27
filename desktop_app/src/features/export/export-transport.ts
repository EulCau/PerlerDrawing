import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { clonePatternDocument, type PatternDocument } from "../../editor/model/pattern-document";
import { createJobId, ImageProcessingError } from "../image/image-transport";
import type { ImageJobProgress } from "../image/image-types";

interface SidecarEventEnvelope {
  readonly job_id: string;
  readonly event: ImageJobProgress;
}

export interface CompleteExportResult {
  readonly artifact_id: string;
  readonly archive_path: string;
  readonly file_count: number;
  readonly validation: {
    readonly required_files: boolean;
    readonly inventory_matches: boolean;
    readonly palette_indices_valid: boolean;
    readonly preview_occupancy_matches: boolean;
    readonly tile_count: number;
    readonly pdf_valid: boolean;
  };
}

export interface CompleteExportSnapshot {
  readonly schemaVersion: number;
  readonly artifact: PatternDocument["artifact"];
  readonly canvas: PatternDocument["canvas"];
  readonly board: PatternDocument["board"];
  readonly palette: PatternDocument["palette"];
  readonly symmetry: PatternDocument["symmetry"];
  readonly processing: PatternDocument["processing"];
  readonly cells: readonly number[];
}

export function createCompleteExportSnapshot(document: PatternDocument): CompleteExportSnapshot {
  const snapshot = clonePatternDocument(document);
  return Object.freeze({
    schemaVersion: snapshot.schemaVersion,
    artifact: Object.freeze({ ...snapshot.artifact }),
    canvas: Object.freeze({ ...snapshot.canvas }),
    board: Object.freeze({ ...snapshot.board }),
    palette: snapshot.palette,
    symmetry: Object.freeze({ ...snapshot.symmetry }),
    processing: Object.freeze({ ...snapshot.processing }),
    cells: Object.freeze(Array.from(snapshot.grid.cells)),
  });
}

export async function chooseArchivePath(
  fileName: string,
  lastExportDirectory?: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  const [{ save }, { join }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/api/path"),
  ]);
  return save({
    defaultPath: lastExportDirectory ? await join(lastExportDirectory, fileName) : fileName,
    filters: [{ name: "Compressed tar archive", extensions: ["tar.gz"] }],
  });
}

export async function runCompleteExport(
  snapshot: CompleteExportSnapshot,
  archivePath: string,
  onProgress: (event: ImageJobProgress) => void,
): Promise<CompleteExportResult> {
  if (!isTauri()) {
    throw new ImageProcessingError(
      "desktop_required",
      "Complete export requires the desktop runtime.",
    );
  }
  const jobId = createJobId("export");
  const unlisten = await listen<SidecarEventEnvelope>(
    "perlerdrawing://sidecar-event",
    ({ payload }) => {
      if (payload.job_id === jobId) onProgress(payload.event);
    },
  );
  try {
    return await invoke<CompleteExportResult>("run_export_job", {
      jobId,
      archivePath,
      snapshot,
    });
  } finally {
    unlisten();
  }
}
