import { EMPTY_CELL } from "../../editor/model/grid";
import {
  createPatternDocument,
  type PatternDocument,
  type SymmetryType,
} from "../../editor/model/pattern-document";
import type { CodexImagePlan } from "../codex/codex-types";
import type { PaletteSnapshot } from "../palettes/palette-types";

export interface ImageConversionSettings {
  readonly columns: number;
  readonly rows: number;
  readonly color_count: number;
  readonly alpha_threshold: number;
  readonly background_mode: "auto" | "preserve" | "none";
  readonly background_tolerance: number;
  readonly wavelet_strength: number;
  readonly seed: number;
  readonly remove_tiny_components: boolean;
  readonly symmetry: SymmetryType;
}

export interface ImageJobProgress {
  readonly type: "progress";
  readonly job_id: string;
  readonly stage: string;
  readonly progress: number;
  readonly message_key: string;
}

export interface ImageConversionMetadata {
  readonly pipeline_version: number;
  readonly source: Readonly<Record<string, unknown>>;
  readonly background: Readonly<Record<string, unknown>>;
  readonly wavelet: Readonly<Record<string, unknown>>;
  readonly master_clustering: Readonly<Record<string, unknown>>;
  readonly target_maximum: readonly [number, number];
  readonly grid: readonly [number, number];
  readonly footprint: readonly [number, number];
  readonly alpha_threshold: number;
  readonly seed: number;
  readonly symmetry: SymmetryType;
  readonly symmetry_axis_or_center?: readonly number[] | null;
  readonly symmetry_check_passed?: boolean;
  readonly used_palette_indices: readonly number[];
  readonly bead_count: number;
  readonly operations: readonly string[];
}

export interface ImageConversionResult {
  readonly document: {
    readonly columns: number;
    readonly rows: number;
    readonly cells: readonly (number | null)[];
    readonly processing: ImageConversionMetadata;
  };
  readonly assets: {
    readonly master: "master.png";
    readonly pattern: "pattern.png";
  };
  readonly metadata: ImageConversionMetadata;
}

export interface ImageJobResultEnvelope {
  readonly result_path: string;
  readonly result: ImageConversionResult;
}

export interface CreateImageDocumentOptions {
  readonly artifactName: string;
  readonly sourceFileName: string;
  readonly jobId: string;
  readonly codexPlan?: CodexImagePlan;
  readonly board: {
    readonly columns: number;
    readonly rows: number;
    readonly subdivision: number;
  };
}

export function createDocumentFromImageResult(
  result: ImageConversionResult,
  palette: PaletteSnapshot,
  options: CreateImageDocumentOptions,
): PatternDocument {
  if (result.document.cells.length !== result.document.columns * result.document.rows) {
    throw new RangeError("Image result cell count does not match its dimensions.");
  }
  const axisOrCenter = result.metadata.symmetry_axis_or_center ?? undefined;
  const document = createPatternDocument({
    artifact: { name: options.artifactName, version: "v1" },
    canvas: { columns: result.document.columns, rows: result.document.rows },
    board: options.board,
    palette,
    symmetry: { type: result.metadata.symmetry, axisOrCenter },
    processing: {
      ...result.document.processing,
      source: "image_import",
      sourceImage: result.document.processing.source,
      sourceFileName: options.sourceFileName,
      imageJobId: options.jobId,
      master_artifact: `${options.artifactName}_master.png`,
      codex: options.codexPlan
        ? {
            enabled: true,
            trustBoundary: "validated_parameter_plan",
            plan: options.codexPlan,
          }
        : { enabled: false },
    },
  });
  result.document.cells.forEach((value, index) => {
    document.grid.cells[index] = value === null ? EMPTY_CELL : value;
  });
  return document;
}

export function imageArtifactName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.(?:png|jpe?g|webp)$/i, "");
  const normalized = withoutExtension
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "imported_image";
}
