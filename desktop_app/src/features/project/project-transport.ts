import { invoke, isTauri } from "@tauri-apps/api/core";
import type { PatternProjectContents } from "./project-format";
import type { ProjectPreview } from "./project-preview";

export const APP_USER_STATE_SCHEMA_VERSION = 1 as const;

export interface RecentProject {
  readonly metadataPath: string;
  readonly csvPath: string;
  readonly displayName: string;
  readonly lastOpenedAt: number;
  readonly preview?: ProjectPreview;
}

export interface AppUserState {
  readonly schemaVersion: typeof APP_USER_STATE_SCHEMA_VERSION;
  readonly recentProjects: readonly RecentProject[];
  readonly lastProjectDirectory?: string;
  readonly lastSavedProjectPath?: string;
  readonly lastExportDirectory?: string;
  readonly extensions: Readonly<Record<string, unknown>>;
}

export interface SaveProjectResponse {
  readonly project: RecentProject;
  readonly userState: AppUserState;
}

export interface ReadProjectResponse {
  readonly project: RecentProject;
  readonly metadataContents: string;
  readonly csvContents: string;
}

export function emptyAppUserState(): AppUserState {
  return {
    schemaVersion: APP_USER_STATE_SCHEMA_VERSION,
    recentProjects: [],
    extensions: {},
  };
}

function replaceFinalExtension(path: string): string {
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const finalDot = path.lastIndexOf(".");
  return finalDot > separator ? path.slice(0, finalDot) : path;
}

export function normalizeProjectMetadataPath(path: string): string {
  if (path.toLocaleLowerCase().endsWith(".perler.json")) return path;
  return `${replaceFinalExtension(path)}.perler.json`;
}

export function projectCsvPath(metadataPath: string): string {
  const normalized = normalizeProjectMetadataPath(metadataPath);
  return `${normalized.slice(0, -".perler.json".length)}.csv`;
}

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

export async function loadAppUserState(): Promise<AppUserState> {
  if (!isTauri()) return emptyAppUserState();
  return invoke<AppUserState>("load_app_user_state");
}

export async function chooseProjectSavePath(
  suggestedFileName: string,
  lastProjectDirectory?: string,
): Promise<string | null> {
  if (!isTauri()) return null;
  const [{ save }, { join }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/api/path"),
  ]);
  const defaultPath = lastProjectDirectory
    ? await join(lastProjectDirectory, suggestedFileName)
    : suggestedFileName;
  const selected = await save({
    defaultPath,
    filters: [{ name: "PerlerDrawing project", extensions: ["perler.json"] }],
  });
  return selected ? normalizeProjectMetadataPath(selected) : null;
}

export async function chooseProjectOpenPath(lastProjectDirectory?: string): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    defaultPath: lastProjectDirectory,
    directory: false,
    multiple: false,
    filters: [{ name: "PerlerDrawing project", extensions: ["perler.json"] }],
  });
  return typeof selected === "string" ? selected : null;
}

export async function savePatternProject(
  metadataPath: string,
  contents: PatternProjectContents,
): Promise<SaveProjectResponse> {
  if (!isTauri()) throw new Error("Project saving requires the desktop runtime.");
  return invoke<SaveProjectResponse>("save_pattern_project", {
    metadataPath: normalizeProjectMetadataPath(metadataPath),
    csvContents: contents.csvContents,
    metadataContents: contents.metadataContents,
  });
}

export async function readPatternProject(metadataPath: string): Promise<ReadProjectResponse> {
  if (!isTauri()) throw new Error("Opening projects requires the desktop runtime.");
  return invoke<ReadProjectResponse>("read_pattern_project", { metadataPath });
}

export async function recordRecentProject(
  metadataPath: string,
  preview: ProjectPreview,
): Promise<AppUserState> {
  if (!isTauri()) return emptyAppUserState();
  return invoke<AppUserState>("record_recent_project", { metadataPath, preview });
}

export async function recordExportPath(exportPath: string): Promise<AppUserState> {
  if (!isTauri()) return emptyAppUserState();
  return invoke<AppUserState>("record_export_path", { exportPath });
}
