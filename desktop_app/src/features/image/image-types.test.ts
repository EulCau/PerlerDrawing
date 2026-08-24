import { describe, expect, it } from "vitest";
import { EMPTY_CELL } from "../../editor/model/grid";
import { mard221V1 } from "../palettes/builtins";
import {
  createDocumentFromImageResult,
  imageArtifactName,
  type ImageConversionResult,
} from "./image-types";

function result(): ImageConversionResult {
  const processing = {
    pipeline_version: 1,
    source: { source_width: 120, source_height: 80 },
    background: { method: "border_lab_connected_matte" },
    wavelet: { method: "haar_soft_threshold_edge_blend" },
    master_clustering: { method: "lab_kmeans", cluster_count: 8 },
    target_maximum: [3, 2] as const,
    grid: [3, 2] as const,
    footprint: [2, 2] as const,
    alpha_threshold: 0.28,
    seed: 9,
    symmetry: "none" as const,
    used_palette_indices: [0, 2],
    bead_count: 4,
    operations: ["haar_wavelet_structure_simplification"],
  };
  return {
    document: {
      columns: 3,
      rows: 2,
      cells: [null, 0, 2, null, 2, 0],
      processing,
    },
    assets: { master: "master.png", pattern: "pattern.png" },
    metadata: processing,
  };
}

describe("image conversion result", () => {
  it("creates a validated document while retaining empty cells", () => {
    const document = createDocumentFromImageResult(result(), mard221V1, {
      artifactName: "red_badge",
      sourceFileName: "private-source.png",
      jobId: "image-job",
      board: { columns: 29, rows: 29, subdivision: 5 },
    });

    expect(Array.from(document.grid.cells)).toEqual([EMPTY_CELL, 0, 2, EMPTY_CELL, 2, 0]);
    expect(document.processing.source).toBe("image_import");
    expect(document.processing.background).toEqual({ method: "border_lab_connected_matte" });
    expect(document.processing.master_artifact).toBe("red_badge_master.png");
  });

  it("normalizes an image file name to an artifact name", () => {
    expect(imageArtifactName("Red Badge 02.WEBP")).toBe("red_badge_02");
    expect(imageArtifactName("花朵.png")).toBe("imported_image");
  });
});
