import { isTauri } from "@tauri-apps/api/core";
import { CSV_BYTE_LIMIT, CsvImportError } from "./csv-format";

export interface SelectedCsvFile {
  readonly name: string;
  readonly byteLength: number;
  readonly text: string;
}

export interface SaveCsvResult {
  readonly status: "saved" | "cancelled";
  readonly path?: string;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).at(-1) || "imported_pattern.csv";
}

export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes.byteLength > CSV_BYTE_LIMIT) {
    throw new CsvImportError("too_large", "CSV exceeds the byte limit.", {
      byteLength: bytes.byteLength,
      maximum: CSV_BYTE_LIMIT,
    });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new CsvImportError("invalid_csv", "CSV must be valid UTF-8.");
  }
}

async function readBrowserFile(file: File): Promise<SelectedCsvFile> {
  if (file.size > CSV_BYTE_LIMIT) {
    throw new CsvImportError("too_large", "CSV exceeds the byte limit.", {
      byteLength: file.size,
      maximum: CSV_BYTE_LIMIT,
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { name: file.name, byteLength: bytes.byteLength, text: decodeCsvBytes(bytes) };
}

function pickBrowserCsvFile(): Promise<SelectedCsvFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.tsv,text/csv,text/tab-separated-values";
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
        void readBrowserFile(file).then(resolve, reject).finally(cleanup);
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

export async function pickCsvFile(): Promise<SelectedCsvFile | null> {
  if (!isTauri()) return pickBrowserCsvFile();
  const [{ open }, { readFile }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("@tauri-apps/plugin-fs"),
  ]);
  const path = await open({
    directory: false,
    multiple: false,
    filters: [{ name: "CSV / TSV", extensions: ["csv", "tsv"] }],
  });
  if (typeof path !== "string") return null;
  const bytes = await readFile(path);
  return {
    name: fileNameFromPath(path),
    byteLength: bytes.byteLength,
    text: decodeCsvBytes(bytes),
  };
}

export async function saveCsvFile(
  fileName: string,
  contents: string,
  lastExportDirectory?: string,
): Promise<SaveCsvResult> {
  if (isTauri()) {
    const [{ save }, { writeTextFile }, { join }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/plugin-fs"),
      import("@tauri-apps/api/path"),
    ]);
    const path = await save({
      defaultPath: lastExportDirectory ? await join(lastExportDirectory, fileName) : fileName,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return { status: "cancelled" };
    await writeTextFile(path, contents);
    return { status: "saved", path };
  }

  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = fileName;
  anchor.href = url;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { status: "saved" };
}
