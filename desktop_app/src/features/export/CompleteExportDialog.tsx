import { isTauri } from "@tauri-apps/api/core";
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, CloseIcon, DownloadIcon, FileIcon } from "../../components/Icons";
import { computeOccupiedBounds } from "../../editor/model/occupied-bounds";
import type { PatternDocument } from "../../editor/model/pattern-document";
import {
  chooseArchivePath,
  createCompleteExportSnapshot,
  runCompleteExport,
  type CompleteExportResult,
} from "./export-transport";

interface CompleteExportDialogProps {
  readonly document: PatternDocument;
  readonly onClose: () => void;
}

export function CompleteExportDialog({ document, onClose }: CompleteExportDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLElement>(null);
  const snapshot = useMemo(() => createCompleteExportSnapshot(document), [document]);
  const bounds = useMemo(() => computeOccupiedBounds(document.grid), [document]);
  const artifactId = `${document.artifact.name}_${bounds ? `${bounds.width}x${bounds.height}` : "0x0"}_${document.artifact.version}`;
  const fileName = `${artifactId}.tar.gz`;
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [messageKey, setMessageKey] = useState("export.progress.ready");
  const [result, setResult] = useState<CompleteExportResult | null>(null);
  const [error, setError] = useState("");
  const desktopAvailable = isTauri();

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !exporting) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && globalThis.document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && globalThis.document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const exportPackage = async () => {
    setError("");
    setResult(null);
    const archivePath = await chooseArchivePath(fileName);
    if (!archivePath) return;
    setExporting(true);
    setProgress(0.02);
    setMessageKey("export.progress.starting");
    try {
      const exported = await runCompleteExport(snapshot, archivePath, (update) => {
        setProgress(update.progress);
        setMessageKey(update.message_key);
      });
      setResult(exported);
      setProgress(1);
      setMessageKey("export.progress.complete");
    } catch {
      setError(t("export.errors.failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-describedby="complete-export-description"
        aria-labelledby="complete-export-title"
        aria-modal="true"
        className="csv-dialog complete-export-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="new-pattern-dialog__heading">
          <div>
            <span className="section-heading__eyebrow">{t("export.eyebrow")}</span>
            <h2 id="complete-export-title">{t("export.title")}</h2>
            <p id="complete-export-description">{t("export.description")}</p>
          </div>
          <button
            aria-label={t("common.close")}
            className="icon-button"
            disabled={exporting}
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="csv-export-file">
          <FileIcon />
          <span>
            <strong>{fileName}</strong>
            <small>{t("export.immutableSnapshot")}</small>
          </span>
        </div>

        <div className="export-summary-grid">
          <span>
            <small>{t("export.footprint")}</small>
            <strong>{bounds ? `${bounds.width} × ${bounds.height}` : "0 × 0"}</strong>
          </span>
          <span>
            <small>{t("export.canvas")}</small>
            <strong>
              {document.grid.columns} × {document.grid.rows}
            </strong>
          </span>
          <span>
            <small>{t("export.palette")}</small>
            <strong>{document.palette.name}</strong>
          </span>
          <span>
            <small>{t("export.boards")}</small>
            <strong>
              {Math.ceil(document.grid.columns / document.board.columns)} ×{" "}
              {Math.ceil(document.grid.rows / document.board.rows)}
            </strong>
          </span>
        </div>

        <section className="export-file-list">
          <strong>{t("export.contents")}</strong>
          <div>
            {[
              "csv",
              "transparent",
              "white",
              "chart",
              "inventory",
              "metadata",
              "paletteFile",
              "tiles",
            ].map((item) => (
              <span key={item}>
                <CheckIcon />
                {t(`export.files.${item}`)}
              </span>
            ))}
          </div>
        </section>

        {progress > 0 ? (
          <div className="image-progress" role="status">
            <span style={{ "--job-progress": `${Math.round(progress * 100)}%` } as CSSProperties} />
            <div>
              <strong>{t(messageKey)}</strong>
              <small>{Math.round(progress * 100)}%</small>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="export-validation" role="status">
            <CheckIcon />
            <span>
              <strong>{t("export.validationPassed")}</strong>
              <small>
                {t("export.validationDetail", {
                  files: result.file_count,
                  tiles: result.validation.tile_count,
                })}
              </small>
            </span>
          </div>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {!desktopAvailable ? <p className="image-runtime-note">{t("export.desktopNote")}</p> : null}

        <div className="new-pattern-dialog__actions">
          <button
            className="button button--secondary"
            disabled={exporting}
            onClick={onClose}
            type="button"
          >
            {result ? t("common.done") : t("common.cancel")}
          </button>
          <button
            className="button button--primary"
            disabled={exporting || !bounds || !desktopAvailable}
            onClick={() => void exportPackage()}
            type="button"
          >
            <DownloadIcon />
            {exporting ? t("export.exporting") : t("export.saveAction")}
          </button>
        </div>
      </section>
    </div>
  );
}
