import { MAX_PALETTE_COLORS } from "../../editor/model/grid";
import type { PaletteColor, PaletteIdentity, PaletteSnapshot } from "./palette-types";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ID_COMPONENT_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

interface RawPaletteColor {
  readonly code?: unknown;
  readonly name?: unknown;
  readonly hex?: unknown;
}

interface RawPaletteFile {
  readonly name?: unknown;
  readonly source?: unknown;
  readonly retrieved?: unknown;
  readonly colors?: unknown;
}

export class PaletteValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Palette validation failed: ${issues.join("; ")}`);
    this.name = "PaletteValidationError";
    this.issues = [...issues];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateIdentity(identity: PaletteIdentity, issues: string[]): void {
  if (!ID_COMPONENT_PATTERN.test(identity.standardId)) {
    issues.push(
      "standardId must contain lowercase letters, numbers, dots, underscores, or hyphens",
    );
  }
  if (!ID_COMPONENT_PATTERN.test(identity.version)) {
    issues.push("version must contain lowercase letters, numbers, dots, underscores, or hyphens");
  }
}

function readOptionalString(value: unknown, path: string, issues: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string when provided`);
    return undefined;
  }
  return value.trim();
}

function readRequiredString(value: unknown, path: string, issues: string[]): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${path} must be a non-empty string`);
    return undefined;
  }
  return value.trim();
}

export function hexToRgb(hex: string): readonly [number, number, number] {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    throw new TypeError(`Invalid six-digit RGB color ${hex}.`);
  }

  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function paletteKey(identity: PaletteIdentity): string {
  return `${identity.standardId}@${identity.version}`;
}

export function parsePaletteFile(raw: unknown, identity: PaletteIdentity): PaletteSnapshot {
  const issues: string[] = [];
  validateIdentity(identity, issues);

  if (!isRecord(raw)) {
    throw new PaletteValidationError(["palette root must be an object"]);
  }

  const paletteFile: RawPaletteFile = raw;
  const name = readRequiredString(paletteFile.name, "name", issues);
  const source = readOptionalString(paletteFile.source, "source", issues);
  const retrieved = readOptionalString(paletteFile.retrieved, "retrieved", issues);
  const rawColors = paletteFile.colors;

  if (!Array.isArray(rawColors) || rawColors.length === 0) {
    issues.push("colors must be a non-empty array");
  } else if (rawColors.length > MAX_PALETTE_COLORS) {
    issues.push(`colors cannot exceed ${MAX_PALETTE_COLORS} entries`);
  }

  const colors: PaletteColor[] = [];
  const usedCodes = new Set<string>();

  if (Array.isArray(rawColors)) {
    rawColors.forEach((rawColor, index) => {
      const path = `colors[${index}]`;
      if (!isRecord(rawColor)) {
        issues.push(`${path} must be an object`);
        return;
      }

      const color: RawPaletteColor = rawColor;
      const code = readRequiredString(color.code, `${path}.code`, issues);
      const colorName = readOptionalString(color.name, `${path}.name`, issues);
      const hex = readRequiredString(color.hex, `${path}.hex`, issues);

      if (code && usedCodes.has(code)) issues.push(`${path}.code duplicates ${code}`);
      if (code) usedCodes.add(code);
      if (hex && !HEX_COLOR_PATTERN.test(hex)) {
        issues.push(`${path}.hex must use #RRGGBB`);
      }

      if (code && hex && HEX_COLOR_PATTERN.test(hex)) {
        const normalizedHex = hex.toUpperCase() as `#${string}`;
        colors.push(
          Object.freeze({
            code,
            name: colorName,
            hex: normalizedHex,
            rgb: Object.freeze(hexToRgb(normalizedHex)),
          }),
        );
      }
    });
  }

  if (issues.length > 0 || !name) {
    throw new PaletteValidationError(issues);
  }

  return Object.freeze({
    ...identity,
    name,
    source,
    retrieved,
    colors: Object.freeze(colors),
  });
}

export class PaletteRegistry {
  readonly #palettes = new Map<string, PaletteSnapshot>();

  constructor(palettes: readonly PaletteSnapshot[] = []) {
    palettes.forEach((palette) => this.register(palette));
  }

  register(palette: PaletteSnapshot): void {
    const key = paletteKey(palette);
    if (this.#palettes.has(key)) {
      throw new Error(`Palette ${key} is already registered.`);
    }
    const validatedPalette = parsePaletteFile(
      {
        name: palette.name,
        source: palette.source,
        retrieved: palette.retrieved,
        colors: palette.colors.map(({ code, name, hex }) => ({ code, name, hex })),
      },
      palette,
    );
    this.#palettes.set(key, validatedPalette);
  }

  find(identity: PaletteIdentity): PaletteSnapshot | undefined {
    return this.#palettes.get(paletteKey(identity));
  }

  get(identity: PaletteIdentity): PaletteSnapshot {
    const palette = this.find(identity);
    if (!palette) throw new Error(`Palette ${paletteKey(identity)} is not registered.`);
    return palette;
  }

  list(): readonly PaletteSnapshot[] {
    return [...this.#palettes.values()].sort((left, right) =>
      paletteKey(left).localeCompare(paletteKey(right)),
    );
  }
}
