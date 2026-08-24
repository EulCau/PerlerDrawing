import { isTauri } from "@tauri-apps/api/core";
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, CloseIcon, DownloadIcon, FileIcon } from "../../components/Icons";
import { computeOccupiedBounds } from "../../editor/model/occupied-bounds";
import type { PatternDocument } from "../../editor/model/pattern-document";
import { createCompleteExportSnapshot } from "./export-transport";
import { choosePdfPath, runBoardPdfExport, type BoardPdfResult } from "./pdf-transport";

interface BoardPdfDialogProps {
  readonly document: PatternDocument;
  readonly onClose: () => void;
}

export function BoardPdfDialog({ document, onClose }: BoardPdfDialogProps) {
  const { t } = useTranslation();
  const bounds = useMemo(() => computeOccupiedBounds(document.grid), [document]);
  const snapshot = useMemo(() => createCompleteExportSnapshot(document), [document]);
  const artifactId = `${document.artifact.name}_${bounds ? `${bounds.width}x${bounds.height}` : "0x0"}_${document.artifact.version}`;
  const boardColumns = Math.ceil(document.grid.columns / document.board.columns);
  const boardRows = Math.ceil(document.grid.rows / document.board.rows);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BoardPdfResult | null>(null);
  const [error, setError] = useState("");

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !exporting) {
      event.preventDefault();
      onClose();
    }
  };

  const exportPdf = async () => {
    setError("");
    const pdfPath = await choosePdfPath(`${artifactId}_boards.pdf`);
    if (!pdfPath) return;
    setExporting(true);
    setProgress(0.02);
    try {
      const exported = await runBoardPdfExport(snapshot, pdfPath, (update) => {
        setProgress(update.progress);
      });
      setResult(exported);
      setProgress(1);
    } catch {
      setError(t("pdf.errors.failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="board-pdf-title"
        aria-modal="true"
        className="csv-dialog board-pdf-dialog"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="new-pattern-dialog__heading">
          <div>
            <span className="section-heading__eyebrow">{t("pdf.eyebrow")}</span>
            <h2 id="board-pdf-title">{t("pdf.title")}</h2>
            <p>{t("pdf.description")}</p>
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
            <strong>{artifactId}_boards.pdf</strong>
            <small>{t("pdf.pageSummary", { pages: boardColumns * boardRows })}</small>
          </span>
        </div>
        <div className="export-summary-grid">
          <span>
            <small>{t("export.canvas")}</small>
            <strong>
              {document.grid.columns} × {document.grid.rows}
            </strong>
          </span>
          <span>
            <small>{t("newPattern.board")}</small>
            <strong>
              {document.board.columns} × {document.board.rows}
            </strong>
          </span>
          <span>
            <small>{t("export.boards")}</small>
            <strong>
              {boardColumns} × {boardRows}
            </strong>
          </span>
          <span>
            <small>{t("pdf.scale")}</small>
            <strong>100% · 5.08 mm</strong>
          </span>
        </div>
        {progress > 0 ? (
          <div className="image-progress" role="status">
            <span style={{ "--job-progress": `${Math.round(progress * 100)}%` } as CSSProperties} />
            <div>
              <strong>{exporting ? t("pdf.exporting") : t("pdf.complete")}</strong>
              <small>{Math.round(progress * 100)}%</small>
            </div>
          </div>
        ) : null}
        {result ? (
          <div className="export-validation" role="status">
            <CheckIcon />
            <span>
              <strong>{t("pdf.complete")}</strong>
              <small>{t("pdf.pageSummary", { pages: result.page_count })}</small>
            </span>
          </div>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {!isTauri() ? <p className="image-runtime-note">{t("pdf.desktopNote")}</p> : null}
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
            disabled={!bounds || exporting || !isTauri()}
            onClick={() => void exportPdf()}
            type="button"
          >
            <DownloadIcon />
            {exporting ? t("pdf.exporting") : t("pdf.saveAction")}
          </button>
        </div>
      </section>
    </div>
  );
}
