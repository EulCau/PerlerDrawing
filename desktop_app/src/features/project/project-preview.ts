import { EMPTY_CELL } from "../../editor/model/grid";
import { computeOccupiedBounds } from "../../editor/model/occupied-bounds";
import type { PatternDocument } from "../../editor/model/pattern-document";

export const PROJECT_PREVIEW_SCHEMA_VERSION = 1 as const;
export const PROJECT_PREVIEW_MAX_DIMENSION = 48;
const TRANSPARENT_CELL = 0xffff;

export interface ProjectPreview {
  readonly schemaVersion: typeof PROJECT_PREVIEW_SCHEMA_VERSION;
  readonly columns: number;
  readonly rows: number;
  readonly colors: readonly `#${string}`[];
  readonly cells: string;
}

function previewDimensions(width: number, height: number): { columns: number; rows: number } {
  const scale = Math.min(
    1,
    PROJECT_PREVIEW_MAX_DIMENSION / width,
    PROJECT_PREVIEW_MAX_DIMENSION / height,
  );
  return {
    columns: Math.max(1, Math.round(width * scale)),
    rows: Math.max(1, Math.round(height * scale)),
  };
}

function cellToken(value: number): string {
  return value.toString(16).padStart(4, "0");
}

export function createProjectPreview(document: PatternDocument): ProjectPreview {
  const bounds = computeOccupiedBounds(document.grid);
  if (!bounds) {
    return {
      schemaVersion: PROJECT_PREVIEW_SCHEMA_VERSION,
      columns: 1,
      rows: 1,
      colors: [],
      cells: cellToken(TRANSPARENT_CELL),
    };
  }

  const { columns, rows } = previewDimensions(bounds.width, bounds.height);
  const colors: `#${string}`[] = [];
  const colorIndices = new Map<string, number>();
  const cells: string[] = [];

  for (let previewRow = 0; previewRow < rows; previewRow += 1) {
    const sourceRowStart = bounds.minRow + Math.floor((previewRow * bounds.height) / rows);
    const sourceRowEnd =
      bounds.minRow + Math.max(1, Math.floor(((previewRow + 1) * bounds.height) / rows));
    for (let previewColumn = 0; previewColumn < columns; previewColumn += 1) {
      const sourceColumnStart =
        bounds.minColumn + Math.floor((previewColumn * bounds.width) / columns);
      const sourceColumnEnd =
        bounds.minColumn + Math.max(1, Math.floor(((previewColumn + 1) * bounds.width) / columns));
      const counts = new Map<number, number>();

      for (let row = sourceRowStart; row < sourceRowEnd; row += 1) {
        for (let column = sourceColumnStart; column < sourceColumnEnd; column += 1) {
          const value = document.grid.cells[row * document.grid.columns + column];
          if (value === undefined || value === EMPTY_CELL) continue;
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }

      let selected = EMPTY_CELL;
      let selectedCount = 0;
      for (const [value, count] of counts) {
        if (count > selectedCount) {
          selected = value;
          selectedCount = count;
        }
      }
      if (selected === EMPTY_CELL) {
        cells.push(cellToken(TRANSPARENT_CELL));
        continue;
      }

      const color = document.palette.colors[selected];
      if (!color) {
        cells.push(cellToken(TRANSPARENT_CELL));
        continue;
      }
      let previewColorIndex = colorIndices.get(color.hex);
      if (previewColorIndex === undefined) {
        previewColorIndex = colors.length;
        colors.push(color.hex);
        colorIndices.set(color.hex, previewColorIndex);
      }
      cells.push(cellToken(previewColorIndex));
    }
  }

  return {
    schemaVersion: PROJECT_PREVIEW_SCHEMA_VERSION,
    columns,
    rows,
    colors,
    cells: cells.join(""),
  };
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("preview must be an object.");
  }
  return value as Record<string, unknown>;
}

export function parseProjectPreview(value: unknown): ProjectPreview | undefined {
  if (value === undefined) return undefined;
  const preview = requiredRecord(value);
  if (preview.schemaVersion !== PROJECT_PREVIEW_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported project preview schema ${String(preview.schemaVersion)}.`);
  }
  if (
    !Number.isSafeInteger(preview.columns) ||
    (preview.columns as number) <= 0 ||
    (preview.columns as number) > PROJECT_PREVIEW_MAX_DIMENSION ||
    !Number.isSafeInteger(preview.rows) ||
    (preview.rows as number) <= 0 ||
    (preview.rows as number) > PROJECT_PREVIEW_MAX_DIMENSION
  ) {
    throw new TypeError("preview dimensions are invalid.");
  }
  if (
    !Array.isArray(preview.colors) ||
    preview.colors.length > (preview.columns as number) * (preview.rows as number) ||
    preview.colors.some((color) => typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color))
  ) {
    throw new TypeError("preview colors are invalid.");
  }
  if (
    typeof preview.cells !== "string" ||
    preview.cells.length !== (preview.columns as number) * (preview.rows as number) * 4 ||
    !/^[0-9a-f]+$/i.test(preview.cells)
  ) {
    throw new TypeError("preview cells are invalid.");
  }
  for (let offset = 0; offset < preview.cells.length; offset += 4) {
    const index = Number.parseInt(preview.cells.slice(offset, offset + 4), 16);
    if (index !== TRANSPARENT_CELL && index >= preview.colors.length) {
      throw new TypeError("preview contains an invalid color index.");
    }
  }
  return {
    schemaVersion: PROJECT_PREVIEW_SCHEMA_VERSION,
    columns: preview.columns as number,
    rows: preview.rows as number,
    colors: [...(preview.colors as `#${string}`[])],
    cells: preview.cells,
  };
}

function escapeXmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

export function projectPreviewDataUrl(preview: ProjectPreview): string {
  const validated = parseProjectPreview(preview);
  if (!validated) throw new TypeError("preview is required.");
  const paths = validated.colors.map(() => [] as string[]);
  for (let index = 0; index < validated.columns * validated.rows; index += 1) {
    const colorIndex = Number.parseInt(validated.cells.slice(index * 4, index * 4 + 4), 16);
    if (colorIndex === TRANSPARENT_CELL) continue;
    const column = index % validated.columns;
    const row = Math.floor(index / validated.columns);
    paths[colorIndex]?.push(`M${column} ${row}h1v1h-1z`);
  }
  const shapes = paths
    .map((commands, index) =>
      commands.length > 0
        ? `<path fill="${escapeXmlAttribute(validated.colors[index] ?? "#000000")}" d="${commands.join("")}"/>`
        : "",
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${validated.columns} ${validated.rows}" shape-rendering="crispEdges">${shapes}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
