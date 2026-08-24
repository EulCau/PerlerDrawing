export interface PaletteColor {
  readonly code: string;
  readonly name?: string;
  readonly hex: `#${string}`;
  readonly rgb: readonly [number, number, number];
}

export interface PaletteIdentity {
  readonly standardId: string;
  readonly version: string;
}

export interface PaletteSnapshot extends PaletteIdentity {
  readonly name: string;
  readonly source?: string;
  readonly retrieved?: string;
  readonly colors: readonly PaletteColor[];
}
