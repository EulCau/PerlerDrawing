import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, CloseIcon, DownloadIcon, FileIcon } from "../../components/Icons";
import { computeOccupiedBounds } from "../../editor/model/occupied-bounds";
import type { PatternDocument } from "../../editor/model/pattern-document";
import { serializePatternCsv, verifyPatternCsvRoundTrip, type CsvDelimiter } from "./csv-format";
import { saveCsvFile } from "./file-transport";

interface CsvExportDialogProps {
  readonly document: PatternDocument;
  readonly lastExportDirectory?: string;
  readonly onClose: () => void;
  readonly onExportSaved: (path: string) => Promise<void>;
}

function csvFileName(document: PatternDocument): string {
  const bounds = computeOccupiedBounds(document.grid);
  const size = bounds ? `${bounds.width}x${bounds.height}` : "0x0";
  return `${document.artifact.name}_${size}_${document.artifact.version}.csv`;
}

export function CsvExportDialog({
  document,
  lastExportDirectory,
  onClose,
  onExportSaved,
}: CsvExportDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLElement>(null);
  const [includeCoordinates, setIncludeCoordinates] = useState(true);
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(",");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileName = csvFileName(document);
  const exportResult = useMemo(() => {
    try {
      const contents = serializePatternCsv(document, { includeCoordinates, delimiter });
      verifyPatternCsvRoundTrip(document, contents);
      return { contents, error: "" };
    } catch (caught) {
      return {
        contents: "",
        error: caught instanceof Error ? caught.message : "Round-trip validation failed.",
      };
    }
  }, [delimiter, document, includeCoordinates]);
  const preview = exportResult.contents
    .slice(1)
    .split("\r\n")
    .slice(0, 4)
    .map((line) => (line.length > 150 ? `${line.slice(0, 150)}…` : line))
    .join("\n");
  const previewText = preview.trim().length === 0 ? t("csv.emptyMatrixPreview") : preview;

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
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

  const save = async () => {
    if (!exportResult.contents) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await saveCsvFile(fileName, exportResult.contents, lastExportDirectory);
      if (result.status === "saved") {
        setSaved(true);
        if (result.path) await onExportSaved(result.path);
      }
    } catch {
      setError(t("csv.errors.write"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-describedby="csv-export-description"
        aria-labelledby="csv-export-title"
        aria-modal="true"
        className="csv-dialog csv-export-dialog"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="new-pattern-dialog__heading">
          <div>
            <span className="section-heading__eyebrow">{t("csv.exportEyebrow")}</span>
            <h2 id="csv-export-title">{t("csv.exportTitle")}</h2>
            <p id="csv-export-description">{t("csv.exportDescription")}</p>
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

        <div className="csv-export-file">
          <FileIcon />
          <span>
            <strong>{fileName}</strong>
            <small>{t("csv.exportEncoding")}</small>
          </span>
        </div>

        <div className="csv-export-options">
          <label className="checkbox-row">
            <input
              autoFocus
              checked={includeCoordinates}
              onChange={(event) => {
                setIncludeCoordinates(event.target.checked);
                setSaved(false);
              }}
              type="checkbox"
            />
            <span>{t("csv.includeCoordinates")}</span>
          </label>
          <label className="form-field">
            <span>{t("csv.delimiter")}</span>
            <select
              onChange={(event) => {
                setDelimiter(event.target.value === "tab" ? "\t" : ",");
                setSaved(false);
              }}
              value={delimiter === "\t" ? "tab" : "comma"}
            >
              <option value="comma">{t("csv.comma")}</option>
              <option value="tab">{t("csv.tab")}</option>
            </select>
          </label>
        </div>

        <div className="csv-round-trip" data-valid={exportResult.error === ""}>
          {exportResult.error === "" ? <CheckIcon /> : null}
          <span>
            <strong>
              {exportResult.error === "" ? t("csv.roundTripPassed") : t("csv.roundTripFailed")}
            </strong>
            <small>
              {exportResult.error ||
                t("csv.exportBytes", {
                  count: new TextEncoder().encode(exportResult.contents).byteLength,
                })}
            </small>
          </span>
        </div>

        <pre className="csv-preview" aria-label={t("csv.preview")}>
          {previewText}
        </pre>

        {saved ? (
          <p className="csv-save-success" role="status">
            <CheckIcon />
            {t("csv.saved")}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="new-pattern-dialog__actions">
          <button className="button button--secondary" onClick={onClose} type="button">
            {saved ? t("common.done") : t("common.cancel")}
          </button>
          <button
            className="button button--primary"
            disabled={saving || exportResult.error !== ""}
            onClick={() => void save()}
            type="button"
          >
            <DownloadIcon />
            {saving ? t("csv.saving") : t("csv.saveAction")}
          </button>
        </div>
      </section>
    </div>
  );
}
