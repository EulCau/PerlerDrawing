import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { BackIcon, CheckIcon, ImageIcon, UploadIcon } from "../../components/Icons";
import type { PatternDocument, SymmetryType } from "../../editor/model/pattern-document";
import { mard221V1 } from "../palettes/builtins";
import {
  cancelImageJob,
  createJobId,
  ImageProcessingError,
  inspectImageDimensions,
  pickImageFile,
  readJobImage,
  revokeImageUrl,
  runImageJob,
  type ImageDimensions,
  type SelectedImageFile,
} from "./image-transport";
import {
  createDocumentFromImageResult,
  imageArtifactName,
  type ImageConversionResult,
  type ImageConversionSettings,
} from "./image-types";

interface ImageImportPageProps {
  readonly onBack: () => void;
  readonly onImport: (document: PatternDocument) => void;
}

interface ProcessedPreview {
  readonly jobId: string;
  readonly masterUrl: string;
  readonly patternUrl: string;
  readonly result: ImageConversionResult;
}

const MAX_IMAGE_PIXELS = 32_000_000;

function integer(form: FormData, name: string): number {
  return Number.parseInt(String(form.get(name) ?? ""), 10);
}

function translatedError(error: unknown, t: (key: string) => string): string {
  const code = error instanceof ImageProcessingError ? error.code : "processing_failed";
  const supported = new Set([
    "desktop_required",
    "image_too_large",
    "invalid_image",
    "sidecar_missing",
    "sidecar_start_failed",
    "processing_failed",
  ]);
  return t(`image.errors.${supported.has(code) ? code : "processing_failed"}`);
}

export function ImageImportPage({ onBack, onImport }: ImageImportPageProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<SelectedImageFile | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
  const [artifactName, setArtifactName] = useState("imported_image");
  const [processing, setProcessing] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressKey, setProgressKey] = useState("image.progress.ready");
  const [error, setError] = useState("");
  const [processed, setProcessed] = useState<ProcessedPreview | null>(null);
  const [backgroundMode, setBackgroundMode] =
    useState<ImageConversionSettings["background_mode"]>("auto");
  const [waveletStrength, setWaveletStrength] = useState(0.55);
  const [backgroundTolerance, setBackgroundTolerance] = useState(18);
  const [alphaThreshold, setAlphaThreshold] = useState(0.28);
  const desktopAvailable = isTauri();

  useEffect(() => () => revokeImageUrl(selected?.previewUrl), [selected?.previewUrl]);
  useEffect(
    () => () => {
      revokeImageUrl(processed?.masterUrl);
      revokeImageUrl(processed?.patternUrl);
    },
    [processed?.masterUrl, processed?.patternUrl],
  );

  const estimatedMemory = useMemo(() => {
    if (!dimensions) return null;
    return Math.ceil((dimensions.width * dimensions.height * 32) / (1024 * 1024));
  }, [dimensions]);

  const chooseFile = async () => {
    setError("");
    try {
      const file = await pickImageFile();
      if (!file) return;
      const nextDimensions = await inspectImageDimensions(file.previewUrl);
      if (nextDimensions.width * nextDimensions.height > MAX_IMAGE_PIXELS) {
        revokeImageUrl(file.previewUrl);
        throw new ImageProcessingError("image_too_large", "Image exceeds the pixel limit.");
      }
      revokeImageUrl(selected?.previewUrl);
      revokeImageUrl(processed?.masterUrl);
      revokeImageUrl(processed?.patternUrl);
      setSelected(file);
      setDimensions(nextDimensions);
      setArtifactName(imageArtifactName(file.name));
      setProcessed(null);
      setProgress(0);
      setProgressKey("image.progress.ready");
    } catch (caught) {
      setError(translatedError(caught, t));
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected?.path) {
      setError(t("image.errors.desktop_required"));
      return;
    }
    const form = new FormData(event.currentTarget);
    const columns = integer(form, "columns");
    const rows = integer(form, "rows");
    const colorCount = integer(form, "colorCount");
    const boardColumns = integer(form, "boardColumns");
    const boardRows = integer(form, "boardRows");
    const subdivision = integer(form, "subdivision");
    const seed = integer(form, "seed");
    const symmetry = String(form.get("symmetry") ?? "none") as SymmetryType;
    const name = artifactName.trim();
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(name)) {
      setError(t("newPattern.errors.name"));
      return;
    }
    if (
      [columns, rows, boardColumns, boardRows].some(
        (value) => !Number.isInteger(value) || value < 1 || value > 500,
      )
    ) {
      setError(t("newPattern.errors.dimensions", { maximum: 500 }));
      return;
    }
    if (!Number.isInteger(colorCount) || colorCount < 2 || colorCount > 64) {
      setError(t("image.errors.colorCount"));
      return;
    }
    if (
      !Number.isInteger(subdivision) ||
      subdivision < 1 ||
      subdivision > 100 ||
      !Number.isSafeInteger(seed)
    ) {
      setError(t("image.errors.parameters"));
      return;
    }

    const jobId = createJobId("image");
    setActiveJobId(jobId);
    setProcessing(true);
    setError("");
    setProgress(0.02);
    setProgressKey("image.progress.starting");
    try {
      const envelope = await runImageJob(
        jobId,
        selected.path,
        {
          columns,
          rows,
          color_count: colorCount,
          alpha_threshold: alphaThreshold,
          background_mode: backgroundMode,
          background_tolerance: backgroundTolerance,
          wavelet_strength: waveletStrength,
          seed,
          remove_tiny_components: form.get("removeTinyComponents") === "on",
          symmetry,
        },
        mard221V1,
        (update) => {
          setProgress(update.progress);
          setProgressKey(update.message_key);
        },
      );
      const [masterUrl, patternUrl] = await Promise.all([
        readJobImage(jobId, envelope.result.assets.master),
        readJobImage(jobId, envelope.result.assets.pattern),
      ]);
      revokeImageUrl(processed?.masterUrl);
      revokeImageUrl(processed?.patternUrl);
      setProcessed({ jobId, masterUrl, patternUrl, result: envelope.result });
      setProgress(1);
      setProgressKey("image.progress.complete");
      setError("");
      // Board settings stay in the form and are read again when opening the editor.
    } catch (caught) {
      setError(translatedError(caught, t));
    } finally {
      setActiveJobId(null);
      setProcessing(false);
    }
  };

  const openEditor = () => {
    if (!processed) return;
    const form = document.querySelector<HTMLFormElement>("#image-conversion-form");
    if (!form) return;
    const values = new FormData(form);
    onImport(
      createDocumentFromImageResult(processed.result, mard221V1, {
        artifactName: artifactName.trim(),
        sourceFileName: selected?.name ?? "imported_image",
        jobId: processed.jobId,
        board: {
          columns: integer(values, "boardColumns"),
          rows: integer(values, "boardRows"),
          subdivision: integer(values, "subdivision"),
        },
      }),
    );
  };

  const cancel = async () => {
    if (activeJobId) await cancelImageJob(activeJobId);
  };

  return (
    <div className="image-import-shell">
      <header className="image-import-header">
        <button
          className="button button--secondary"
          disabled={processing}
          onClick={onBack}
          type="button"
        >
          <BackIcon />
          {t("image.back")}
        </button>
        <div>
          <span className="section-heading__eyebrow">{t("image.eyebrow")}</span>
          <h1>{t("image.title")}</h1>
          <p>{t("image.description")}</p>
        </div>
        <span className="offline-badge">
          <span aria-hidden="true" className="offline-badge__dot" />
          {t("status.offline")}
        </span>
      </header>

      <main className="image-import-main">
        <form
          className="image-settings-panel"
          id="image-conversion-form"
          onSubmit={(event) => void submit(event)}
        >
          <section>
            <div className="image-panel-heading">
              <span>01</span>
              <div>
                <strong>{t("image.sourceTitle")}</strong>
                <small>{t("image.sourceDescription")}</small>
              </div>
            </div>
            <button className="image-file-picker" onClick={() => void chooseFile()} type="button">
              <UploadIcon />
              <span>
                <strong>{selected?.name ?? t("image.chooseFile")}</strong>
                <small>
                  {selected
                    ? `${(selected.byteLength / 1024 / 1024).toFixed(1)} MB`
                    : t("image.fileLimits")}
                </small>
              </span>
            </button>
            {dimensions ? (
              <div className="image-source-facts">
                <span>
                  <small>{t("image.dimensions")}</small>
                  <strong>
                    {dimensions.width} × {dimensions.height}
                  </strong>
                </span>
                <span>
                  <small>{t("image.estimatedMemory")}</small>
                  <strong>≈ {estimatedMemory} MB</strong>
                </span>
              </div>
            ) : null}
          </section>

          <section>
            <div className="image-panel-heading">
              <span>02</span>
              <div>
                <strong>{t("image.structureTitle")}</strong>
                <small>{t("image.structureDescription")}</small>
              </div>
            </div>
            <label className="form-field">
              <span>{t("image.backgroundMode")}</span>
              <select
                value={backgroundMode}
                onChange={(event) =>
                  setBackgroundMode(
                    event.target.value as ImageConversionSettings["background_mode"],
                  )
                }
              >
                <option value="auto">{t("image.backgroundAuto")}</option>
                <option value="preserve">{t("image.backgroundPreserve")}</option>
                <option value="none">{t("image.backgroundNone")}</option>
              </select>
            </label>
            <label className="image-range-row">
              <span>{t("image.backgroundTolerance")}</span>
              <input
                disabled={backgroundMode !== "auto"}
                max="60"
                min="4"
                name="backgroundTolerance"
                onChange={(event) => setBackgroundTolerance(Number(event.target.value))}
                type="range"
                value={backgroundTolerance}
              />
              <output>{backgroundTolerance} ΔE</output>
            </label>
            <label className="image-range-row">
              <span>{t("image.waveletStrength")}</span>
              <input
                max="1"
                min="0"
                name="waveletStrength"
                onChange={(event) => setWaveletStrength(Number(event.target.value))}
                step="0.05"
                type="range"
                value={waveletStrength}
              />
              <output>{Math.round(waveletStrength * 100)}%</output>
            </label>
          </section>

          <section>
            <div className="image-panel-heading">
              <span>03</span>
              <div>
                <strong>{t("image.patternTitle")}</strong>
                <small>{t("image.patternDescription")}</small>
              </div>
            </div>
            <label className="form-field">
              <span>{t("newPattern.name")}</span>
              <input
                name="name"
                onChange={(event) => setArtifactName(event.target.value)}
                spellCheck={false}
                value={artifactName}
              />
            </label>
            <div className="form-field-row">
              <label className="form-field">
                <span>{t("image.maximumColumns")}</span>
                <input defaultValue="87" max="500" min="1" name="columns" type="number" />
              </label>
              <span aria-hidden="true" className="form-field-row__times">
                ×
              </span>
              <label className="form-field">
                <span>{t("image.maximumRows")}</span>
                <input defaultValue="87" max="500" min="1" name="rows" type="number" />
              </label>
            </div>
            <div className="image-option-grid">
              <label className="form-field">
                <span>{t("image.colorCount")}</span>
                <input defaultValue="24" max="64" min="2" name="colorCount" type="number" />
              </label>
              <label className="form-field">
                <span>{t("image.alphaThreshold")}</span>
                <input
                  max="0.95"
                  min="0.05"
                  name="alphaThreshold"
                  onChange={(event) => setAlphaThreshold(Number(event.target.value))}
                  step="0.01"
                  type="number"
                  value={alphaThreshold}
                />
              </label>
              <label className="form-field">
                <span>{t("image.symmetry")}</span>
                <select defaultValue="none" name="symmetry">
                  <option value="none">{t("image.symmetryNone")}</option>
                  <option value="vertical">{t("image.symmetryVertical")}</option>
                  <option value="horizontal">{t("image.symmetryHorizontal")}</option>
                  <option value="central">{t("image.symmetryCentral")}</option>
                </select>
              </label>
              <label className="form-field">
                <span>{t("image.seed")}</span>
                <input defaultValue="20260824" name="seed" type="number" />
              </label>
            </div>
            <fieldset className="image-board-settings">
              <legend>{t("newPattern.board")}</legend>
              <div className="image-option-grid">
                <label className="form-field">
                  <span>{t("csv.boardColumns")}</span>
                  <input defaultValue="29" max="500" min="1" name="boardColumns" type="number" />
                </label>
                <label className="form-field">
                  <span>{t("csv.boardRows")}</span>
                  <input defaultValue="29" max="500" min="1" name="boardRows" type="number" />
                </label>
                <label className="form-field">
                  <span>{t("newPattern.subdivision")}</span>
                  <input defaultValue="5" max="100" min="1" name="subdivision" type="number" />
                </label>
              </div>
            </fieldset>
            <label className="checkbox-row">
              <input defaultChecked name="removeTinyComponents" type="checkbox" />
              <span>{t("image.removeTinyComponents")}</span>
            </label>
          </section>

          {processing || progress > 0 ? (
            <div className="image-progress" role="status">
              <span
                style={{ "--job-progress": `${Math.round(progress * 100)}%` } as CSSProperties}
              />
              <div>
                <strong>{t(progressKey)}</strong>
                <small>{Math.round(progress * 100)}%</small>
              </div>
            </div>
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="image-form-actions">
            {processing ? (
              <button
                className="button button--secondary"
                onClick={() => void cancel()}
                type="button"
              >
                {t("image.cancelProcessing")}
              </button>
            ) : null}
            <button
              className="button button--primary"
              disabled={!selected || processing || !desktopAvailable}
              type="submit"
            >
              <ImageIcon />
              {processing ? t("image.processing") : t("image.process")}
            </button>
          </div>
          {!desktopAvailable ? (
            <small className="image-runtime-note">{t("image.desktopNote")}</small>
          ) : null}
        </form>

        <section className="image-preview-panel" aria-label={t("image.previewTitle")}>
          <div className="image-preview-heading">
            <div>
              <span className="section-heading__eyebrow">{t("image.compare")}</span>
              <h2>{t("image.previewTitle")}</h2>
            </div>
            {processed ? (
              <span className="validation-chip">
                <CheckIcon />
                {t("image.validated")}
              </span>
            ) : null}
          </div>
          <div className="image-preview-grid">
            <figure>
              <div className="image-preview-frame">
                {selected ? (
                  <img alt={t("image.originalAlt")} src={selected.previewUrl} />
                ) : (
                  <ImageIcon />
                )}
              </div>
              <figcaption>
                <strong>{t("image.original")}</strong>
                <span>
                  {dimensions
                    ? `${dimensions.width} × ${dimensions.height}`
                    : t("image.awaitingFile")}
                </span>
              </figcaption>
            </figure>
            <figure>
              <div className="image-preview-frame image-preview-frame--transparent">
                {processed ? (
                  <img alt={t("image.masterAlt")} src={processed.masterUrl} />
                ) : (
                  <ImageIcon />
                )}
              </div>
              <figcaption>
                <strong>{t("image.master")}</strong>
                <span>{processed ? t("image.masterDetail") : t("image.awaitingProcessing")}</span>
              </figcaption>
            </figure>
            <figure>
              <div className="image-preview-frame image-preview-frame--pattern">
                {processed ? (
                  <img alt={t("image.patternAlt")} src={processed.patternUrl} />
                ) : (
                  <ImageIcon />
                )}
              </div>
              <figcaption>
                <strong>{t("image.pattern")}</strong>
                <span>
                  {processed
                    ? `${processed.result.document.columns} × ${processed.result.document.rows} · ${processed.result.metadata.bead_count} ${t("image.beadUnit")}`
                    : t("image.awaitingProcessing")}
                </span>
              </figcaption>
            </figure>
          </div>
          <div className="image-pipeline-note">
            <strong>{t("image.pipelineTitle")}</strong>
            <ol>
              <li>{t("image.pipelineBackground")}</li>
              <li>{t("image.pipelineWavelet")}</li>
              <li>{t("image.pipelineCluster")}</li>
              <li>{t("image.pipelineRaster")}</li>
            </ol>
          </div>
          <button
            className="button button--primary image-open-editor"
            disabled={!processed}
            onClick={openEditor}
            type="button"
          >
            {t("image.openEditor")}
          </button>
        </section>
      </main>
    </div>
  );
}
