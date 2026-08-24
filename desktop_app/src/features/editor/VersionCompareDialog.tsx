import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { AlertIcon, CheckIcon, CloseIcon, UploadIcon } from "../../components/Icons";
import { comparePatternGrids, type GridComparison } from "../../editor/model/grid-comparison";
import type { PatternGrid } from "../../editor/model/grid";
import type { PatternDocument } from "../../editor/model/pattern-document";
import { CsvImportError, parsePatternCsv } from "../csv/csv-format";
import { pickCsvFile } from "../csv/file-transport";

interface VersionCompareDialogProps {
  readonly document: PatternDocument;
  readonly onApply: (reference: PatternGrid, fileName: string) => void;
  readonly onClose: () => void;
}

export function VersionCompareDialog({ document, onApply, onClose }: VersionCompareDialogProps) {
  const { t } = useTranslation();
  const [fileName, setFileName] = useState("");
  const [comparison, setComparison] = useState<GridComparison | null>(null);
  const [reference, setReference] = useState<PatternGrid | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const chooseReference = async () => {
    setBusy(true);
    setError("");
    try {
      const file = await pickCsvFile();
      if (!file) return;
      const parsed = parsePatternCsv(file.text, document.palette);
      if (parsed.unknownCells.length > 0) {
        setComparison(null);
        setReference(null);
        setError(t("compare.errors.unknown", { count: parsed.unknownCells.length }));
        return;
      }
      setFileName(file.name);
      const nextReference = {
        columns: parsed.columns,
        rows: parsed.rows,
        cells: parsed.cells,
      };
      setReference(nextReference);
      setComparison(comparePatternGrids(document.grid, nextReference));
    } catch (caught) {
      const code = caught instanceof CsvImportError ? caught.code : "read";
      setComparison(null);
      setReference(null);
      setError(t(`csv.errors.${code}`));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="version-compare-title"
        aria-modal="true"
        className="csv-dialog version-compare-dialog"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="new-pattern-dialog__heading">
          <div>
            <span className="section-heading__eyebrow">{t("compare.eyebrow")}</span>
            <h2 id="version-compare-title">{t("compare.title")}</h2>
            <p>{t("compare.description")}</p>
          </div>
          <button
            aria-label={t("common.close")}
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
        <button
          className="button button--secondary compare-file-button"
          disabled={busy}
          onClick={() => void chooseReference()}
          type="button"
        >
          <UploadIcon />
          {busy ? t("csv.reading") : t("compare.chooseFile")}
        </button>
        {comparison ? (
          <>
            <div className="csv-file-summary compare-file-summary">
              <CheckIcon />
              <span>
                <strong>{fileName}</strong>
                <small>
                  {comparison.columns} × {comparison.rows}
                </small>
              </span>
              <span className="csv-validation-badge" data-valid={comparison.dimensionsMatch}>
                {comparison.dimensionsMatch
                  ? t("compare.dimensionsMatch")
                  : t("compare.dimensionsDiffer")}
              </span>
            </div>
            <div className="compare-summary-grid">
              <span data-kind="added">
                <small>{t("compare.added")}</small>
                <strong>{comparison.added}</strong>
              </span>
              <span data-kind="removed">
                <small>{t("compare.removed")}</small>
                <strong>{comparison.removed}</strong>
              </span>
              <span data-kind="changed">
                <small>{t("compare.changed")}</small>
                <strong>{comparison.changed}</strong>
              </span>
            </div>
          </>
        ) : (
          <div className="csv-empty-preview compare-empty-preview">
            <AlertIcon />
            <strong>{t("compare.emptyTitle")}</strong>
            <span>{t("compare.emptyDescription")}</span>
          </div>
        )}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="new-pattern-dialog__actions">
          <button className="button button--secondary" onClick={onClose} type="button">
            {t("common.cancel")}
          </button>
          <button
            className="button button--primary"
            disabled={!comparison || !reference}
            onClick={() => {
              if (reference) onApply(reference, fileName);
            }}
            type="button"
          >
            {t("compare.showOverlay")}
          </button>
        </div>
      </section>
    </div>
  );
}
