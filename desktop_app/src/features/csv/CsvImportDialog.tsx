import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { AlertIcon, CloseIcon, FileIcon, UploadIcon } from "../../components/Icons";
import type { PatternDocument } from "../../editor/model/pattern-document";
import { mard221V1 } from "../palettes/builtins";
import {
  CSV_DIMENSION_LIMIT,
  CsvImportError,
  createDocumentFromCsv,
  csvArtifactName,
  parsePatternCsv,
  type CsvTransformOptions,
  type ParsedPatternCsv,
} from "./csv-format";
import { pickCsvFile, type SelectedCsvFile } from "./file-transport";

interface CsvImportDialogProps {
  readonly onCancel: () => void;
  readonly onImport: (document: PatternDocument) => void;
}

function readInteger(form: FormData, name: string): number {
  return Number.parseInt(String(form.get(name) ?? ""), 10);
}

export function CsvImportDialog({ onCancel, onImport }: CsvImportDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLElement>(null);
  const [file, setFile] = useState<SelectedCsvFile | null>(null);
  const [parsed, setParsed] = useState<ParsedPatternCsv | null>(null);
  const [artifactName, setArtifactName] = useState("imported_pattern");
  const [transform, setTransform] = useState<CsvTransformOptions>({
    transpose: false,
    flipHorizontal: false,
    flipVertical: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const errorMessage = (caught: unknown): string => {
    if (caught instanceof CsvImportError) {
      return t(`csv.errors.${caught.code}`, caught.details ?? {});
    }
    return t("csv.errors.read");
  };

  const chooseFile = async () => {
    setBusy(true);
    setError("");
    try {
      const selected = await pickCsvFile();
      if (!selected) return;
      const nextParsed = parsePatternCsv(selected.text, mard221V1);
      setFile(selected);
      setParsed(nextParsed);
      setArtifactName(csvArtifactName(selected.name));
      setTransform({ transpose: false, flipHorizontal: false, flipVertical: false });
    } catch (caught) {
      setFile(null);
      setParsed(null);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!parsed || !file || parsed.unknownCells.length > 0) return;
    const form = new FormData(event.currentTarget);
    const boardColumns = readInteger(form, "boardColumns");
    const boardRows = readInteger(form, "boardRows");
    const subdivision = readInteger(form, "subdivision");
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(artifactName)) {
      setError(t("newPattern.errors.name"));
      return;
    }
    if (
      [boardColumns, boardRows].some(
        (value) => !Number.isSafeInteger(value) || value < 1 || value > CSV_DIMENSION_LIMIT,
      )
    ) {
      setError(t("newPattern.errors.dimensions", { maximum: CSV_DIMENSION_LIMIT }));
      return;
    }
    if (!Number.isSafeInteger(subdivision) || subdivision < 1 || subdivision > 100) {
      setError(t("newPattern.errors.subdivision"));
      return;
    }

    try {
      onImport(
        createDocumentFromCsv(parsed, mard221V1, {
          artifactName,
          board: { columns: boardColumns, rows: boardRows, subdivision },
          sourceFileName: file.name,
          transform,
        }),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const outputColumns = parsed ? (transform.transpose ? parsed.rows : parsed.columns) : 0;
  const outputRows = parsed ? (transform.transpose ? parsed.columns : parsed.rows) : 0;
  const canImport = Boolean(parsed && file && parsed.unknownCells.length === 0 && !busy);

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-describedby="csv-import-description"
        aria-labelledby="csv-import-title"
        aria-modal="true"
        className="csv-dialog"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <div className="new-pattern-dialog__heading">
          <div>
            <span className="section-heading__eyebrow">{t("csv.importEyebrow")}</span>
            <h2 id="csv-import-title">{t("csv.importTitle")}</h2>
            <p id="csv-import-description">{t("csv.importDescription")}</p>
          </div>
          <button
            aria-label={t("common.close")}
            className="icon-button"
            onClick={onCancel}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>

        <form className="csv-import-form" onSubmit={submit}>
          <div className="csv-file-picker">
            <button
              autoFocus
              className="button button--secondary"
              disabled={busy}
              onClick={() => void chooseFile()}
              type="button"
            >
              <UploadIcon />
              {busy ? t("csv.reading") : t("csv.chooseFile")}
            </button>
            <span>{t("csv.fileLimits")}</span>
          </div>

          {file && parsed ? (
            <>
              <div className="csv-file-summary">
                <span className="csv-file-summary__icon" aria-hidden="true">
                  <FileIcon />
                </span>
                <span>
                  <strong>{file.name}</strong>
                  <small>{(file.byteLength / 1024).toFixed(1)} KB</small>
                </span>
                <span
                  className="csv-validation-badge"
                  data-valid={parsed.unknownCells.length === 0}
                >
                  {parsed.unknownCells.length === 0
                    ? t("csv.validationPassed")
                    : t("csv.validationBlocked")}
                </span>
              </div>

              <div className="csv-stat-grid">
                <span>
                  <small>{t("csv.format")}</small>
                  <strong>{t(`csv.formats.${parsed.format}`)}</strong>
                </span>
                <span>
                  <small>{t("csv.delimiter")}</small>
                  <strong>{t(parsed.delimiter === "\t" ? "csv.tab" : "csv.comma")}</strong>
                </span>
                <span>
                  <small>{t("csv.sourceSize")}</small>
                  <strong>
                    {parsed.columns} × {parsed.rows}
                  </strong>
                </span>
                <span>
                  <small>{t("csv.nonEmpty")}</small>
                  <strong>{parsed.nonEmptyCellCount}</strong>
                </span>
                <span>
                  <small>{t("csv.bom")}</small>
                  <strong>{parsed.sourceHadBom ? t("common.yes") : t("common.no")}</strong>
                </span>
              </div>

              {parsed.unknownCells.length > 0 ? (
                <section className="csv-issues" aria-labelledby="csv-issues-title">
                  <div className="csv-issues__heading">
                    <AlertIcon />
                    <span>
                      <strong id="csv-issues-title">
                        {t("csv.unknownTitle", { count: parsed.unknownCells.length })}
                      </strong>
                      <small>{t("csv.unknownDescription")}</small>
                    </span>
                  </div>
                  <div className="csv-issue-list">
                    {parsed.unknownCells.slice(0, 24).map((issue) => (
                      <span key={`${issue.row}:${issue.column}:${issue.value}`}>
                        <code>{issue.value}</code>
                        <small>
                          ({issue.column}, {issue.row})
                        </small>
                      </span>
                    ))}
                  </div>
                  {parsed.unknownCells.length > 24 ? (
                    <small>
                      {t("csv.moreUnknown", { count: parsed.unknownCells.length - 24 })}
                    </small>
                  ) : null}
                </section>
              ) : null}

              <div className="csv-import-options">
                <fieldset>
                  <legend>{t("csv.transform")}</legend>
                  <label className="checkbox-row">
                    <input
                      checked={transform.transpose}
                      onChange={(event) =>
                        setTransform((current) => ({
                          ...current,
                          transpose: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span>{t("csv.transpose")}</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      checked={transform.flipHorizontal}
                      onChange={(event) =>
                        setTransform((current) => ({
                          ...current,
                          flipHorizontal: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span>{t("csv.flipHorizontal")}</span>
                  </label>
                  <label className="checkbox-row">
                    <input
                      checked={transform.flipVertical}
                      onChange={(event) =>
                        setTransform((current) => ({
                          ...current,
                          flipVertical: event.target.checked,
                        }))
                      }
                      type="checkbox"
                    />
                    <span>{t("csv.flipVertical")}</span>
                  </label>
                  <output>
                    {t("csv.outputSize", { columns: outputColumns, rows: outputRows })}
                  </output>
                </fieldset>

                <fieldset>
                  <legend>{t("csv.documentSettings")}</legend>
                  <label className="form-field">
                    <span>{t("newPattern.name")}</span>
                    <input
                      onChange={(event) => setArtifactName(event.target.value)}
                      spellCheck={false}
                      value={artifactName}
                    />
                  </label>
                  <div className="form-field-row">
                    <label className="form-field">
                      <span>{t("csv.boardColumns")}</span>
                      <input
                        defaultValue="29"
                        max={CSV_DIMENSION_LIMIT}
                        min="1"
                        name="boardColumns"
                        type="number"
                      />
                    </label>
                    <span aria-hidden="true" className="form-field-row__times">
                      ×
                    </span>
                    <label className="form-field">
                      <span>{t("csv.boardRows")}</span>
                      <input
                        defaultValue="29"
                        max={CSV_DIMENSION_LIMIT}
                        min="1"
                        name="boardRows"
                        type="number"
                      />
                    </label>
                  </div>
                  <label className="form-field csv-subdivision-field">
                    <span>{t("newPattern.subdivision")}</span>
                    <input defaultValue="5" max="100" min="1" name="subdivision" type="number" />
                  </label>
                </fieldset>
              </div>
            </>
          ) : (
            <div className="csv-empty-preview">
              <FileIcon />
              <strong>{t("csv.emptyTitle")}</strong>
              <span>{t("csv.emptyDescription")}</span>
            </div>
          )}

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="new-pattern-dialog__actions">
            <button className="button button--secondary" onClick={onCancel} type="button">
              {t("common.cancel")}
            </button>
            <button className="button button--primary" disabled={!canImport} type="submit">
              {t("csv.importAction")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
