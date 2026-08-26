import { isTauri } from "@tauri-apps/api/core";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { BackIcon, CheckIcon, ImageIcon, UploadIcon } from "../../components/Icons";
import type { PatternDocument, SymmetryType } from "../../editor/model/pattern-document";
import { cancelCodexJob, detectCodexCli, runCodexImagePlan } from "../codex/codex-transport";
import {
  applyCodexPlan,
  normalizeCodexProxy,
  type CodexCliStatus,
  type CodexImagePlan,
} from "../codex/codex-types";
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
const MAX_CODEX_OUTPUT_CHARACTERS = 32_768;
const CODEX_CONSENT_KEY = "perlerdrawing.codex-consent-v1";

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

function appendCodexOutput(current: string, addition: string): string {
  const cleaned = [...addition]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return character === "\n" || character === "\t" || (codePoint >= 32 && codePoint !== 127);
    })
    .join("")
    .replace(/\r\n?/g, "\n")
    .trim();
  if (!cleaned || current.trimEnd().endsWith(cleaned)) return current;
  const combined = current ? `${current}\n${cleaned}` : cleaned;
  if (combined.length <= MAX_CODEX_OUTPUT_CHARACTERS) return combined;
  const tail = combined.slice(-MAX_CODEX_OUTPUT_CHARACTERS);
  const firstLineBreak = tail.indexOf("\n");
  return `…\n${firstLineBreak >= 0 ? tail.slice(firstLineBreak + 1) : tail}`;
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
  const [colorCount, setColorCount] = useState(24);
  const [symmetry, setSymmetry] = useState<SymmetryType>("none");
  const [codexStatus, setCodexStatus] = useState<CodexCliStatus | null>(null);
  const [codexEnabled, setCodexEnabled] = useState(false);
  const [showCodexConsent, setShowCodexConsent] = useState(false);
  const [codexPlan, setCodexPlan] = useState<CodexImagePlan | null>(null);
  const [codexNotice, setCodexNotice] = useState("");
  const [codexProxy, setCodexProxy] = useState("");
  const [codexOutput, setCodexOutput] = useState("");
  const [activeCodexJobId, setActiveCodexJobId] = useState<string | null>(null);
  const [codexStage, setCodexStage] = useState("starting");
  const [codexEventCount, setCodexEventCount] = useState(0);
  const [codexElapsed, setCodexElapsed] = useState(0);
  const cancelRequested = useRef(false);
  const codexDialogRef = useRef<HTMLElement>(null);
  const codexOutputRef = useRef<HTMLPreElement>(null);
  const desktopAvailable = isTauri();

  useEffect(() => () => revokeImageUrl(selected?.previewUrl), [selected?.previewUrl]);
  useEffect(
    () => () => {
      revokeImageUrl(processed?.masterUrl);
      revokeImageUrl(processed?.patternUrl);
    },
    [processed?.masterUrl, processed?.patternUrl],
  );
  useEffect(() => {
    let active = true;
    void detectCodexCli()
      .then((status) => {
        if (active) setCodexStatus(status);
      })
      .catch(() => {
        if (active) {
          setCodexStatus({ available: false, compatible: false, version: null, missingFlags: [] });
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!activeCodexJobId) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      setCodexElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [activeCodexJobId]);
  useEffect(() => {
    const output = codexOutputRef.current;
    if (output) output.scrollTop = output.scrollHeight;
  }, [codexOutput]);

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
      setCodexPlan(null);
      setCodexNotice("");
      setCodexOutput("");
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
    const boardColumns = integer(form, "boardColumns");
    const boardRows = integer(form, "boardRows");
    const subdivision = integer(form, "subdivision");
    const seed = integer(form, "seed");
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
    if (codexEnabled) {
      try {
        normalizeCodexProxy(codexProxy);
      } catch {
        setError(t("codex.proxyInvalid"));
        return;
      }
    }

    cancelRequested.current = false;
    setProcessing(true);
    setError("");
    setProgress(0.02);
    setProgressKey("image.progress.starting");
    try {
      let conversionSettings: ImageConversionSettings = {
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
      };
      setCodexPlan(null);
      setCodexNotice("");
      setCodexOutput("");
      if (codexEnabled) {
        const codexJobId = createJobId("codex");
        setActiveCodexJobId(codexJobId);
        setCodexStage("starting");
        setCodexEventCount(0);
        setCodexElapsed(0);
        setProgress(0.03);
        setProgressKey("codex.progress.starting");
        try {
          const envelope = await runCodexImagePlan(
            codexJobId,
            selected.path,
            conversionSettings,
            mard221V1,
            codexProxy,
            (update) => {
              setCodexStage(update.stage);
              setCodexEventCount(update.event_count);
              if (update.text) {
                setCodexOutput((current) => appendCodexOutput(current, update.text ?? ""));
              }
              setProgress(update.progress * 0.24);
              setProgressKey("codex.progress.analyzing");
            },
          );
          conversionSettings = applyCodexPlan(conversionSettings, envelope.plan);
          setBackgroundMode(conversionSettings.background_mode);
          setBackgroundTolerance(conversionSettings.background_tolerance);
          setWaveletStrength(conversionSettings.wavelet_strength);
          setAlphaThreshold(conversionSettings.alpha_threshold);
          setColorCount(conversionSettings.color_count);
          setSymmetry(conversionSettings.symmetry);
          setCodexPlan(envelope.plan);
          setCodexOutput((current) => appendCodexOutput(current, envelope.finalMessage));
          setCodexNotice(t("codex.planApplied", { version: envelope.cliVersion }));
        } catch (caught) {
          if (cancelRequested.current) throw caught;
          setCodexNotice(t("codex.localFallback"));
        } finally {
          setActiveCodexJobId(null);
        }
      }
      if (cancelRequested.current) return;
      const jobId = createJobId("image");
      setActiveJobId(jobId);
      const localProgressStart = codexEnabled ? 0.25 : 0;
      setProgress(localProgressStart + 0.02);
      setProgressKey("image.progress.starting");
      const envelope = await runImageJob(
        jobId,
        selected.path,
        conversionSettings,
        mard221V1,
        (update) => {
          setProgress(localProgressStart + update.progress * (1 - localProgressStart));
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
      if (cancelRequested.current) {
        setProgress(0);
        setProgressKey("image.progress.ready");
        setError("");
      } else {
        setError(translatedError(caught, t));
      }
    } finally {
      setActiveJobId(null);
      setActiveCodexJobId(null);
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
        codexPlan: codexPlan ?? undefined,
        board: {
          columns: integer(values, "boardColumns"),
          rows: integer(values, "boardRows"),
          subdivision: integer(values, "subdivision"),
        },
      }),
    );
  };

  const cancel = async () => {
    cancelRequested.current = true;
    if (activeCodexJobId) await cancelCodexJob(activeCodexJobId);
    if (activeJobId) await cancelImageJob(activeJobId);
  };

  const toggleCodex = (enabled: boolean) => {
    if (!enabled) {
      setCodexEnabled(false);
      setCodexPlan(null);
      setCodexNotice("");
      return;
    }
    if (!codexStatus?.compatible) return;
    if (window.localStorage.getItem(CODEX_CONSENT_KEY) === "accepted") {
      setCodexEnabled(true);
    } else {
      setShowCodexConsent(true);
    }
  };

  const acceptCodexConsent = () => {
    window.localStorage.setItem(CODEX_CONSENT_KEY, "accepted");
    setCodexEnabled(true);
    setShowCodexConsent(false);
  };

  const handleCodexDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setShowCodexConsent(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = codexDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [tabindex]:not([tabindex="-1"])',
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
                <input
                  max="64"
                  min="2"
                  name="colorCount"
                  onChange={(event) => setColorCount(Number(event.target.value))}
                  type="number"
                  value={colorCount}
                />
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
                <select
                  name="symmetry"
                  onChange={(event) => setSymmetry(event.target.value as SymmetryType)}
                  value={symmetry}
                >
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

          <section className="codex-integration">
            <div className="image-panel-heading">
              <span>04</span>
              <div>
                <strong>{t("codex.title")}</strong>
                <small>{t("codex.description")}</small>
              </div>
            </div>
            <div className="codex-status-row">
              <span className="codex-experimental">{t("codex.experimental")}</span>
              <strong>
                {codexStatus === null
                  ? t("codex.statusChecking")
                  : codexStatus.compatible
                    ? t("codex.statusReady", { version: codexStatus.version })
                    : codexStatus.available
                      ? t("codex.statusIncompatible")
                      : t("codex.statusMissing")}
              </strong>
            </div>
            <label className="checkbox-row codex-toggle">
              <input
                checked={codexEnabled}
                disabled={!codexStatus?.compatible || processing}
                onChange={(event) => toggleCodex(event.target.checked)}
                type="checkbox"
              />
              <span>{t("codex.enable")}</span>
            </label>
            <label className="form-field codex-proxy-field">
              <span>{t("codex.proxy")}</span>
              <input
                aria-describedby="codex-proxy-hint"
                aria-label={t("codex.proxy")}
                autoCapitalize="none"
                autoComplete="off"
                disabled={processing}
                inputMode="url"
                maxLength={2048}
                onChange={(event) => setCodexProxy(event.target.value)}
                placeholder="http://127.0.0.1:7890"
                spellCheck={false}
                type="url"
                value={codexProxy}
              />
              <small id="codex-proxy-hint">{t("codex.proxyHint")}</small>
            </label>
            <p className="codex-privacy-note">{t("codex.privacy")}</p>
            {activeCodexJobId ? (
              <div className="codex-live-status" role="status">
                <strong>{t("codex.liveStage", { stage: codexStage })}</strong>
                <small>
                  {t("codex.liveDetail", { count: codexEventCount, seconds: codexElapsed })}
                </small>
              </div>
            ) : null}
            {activeCodexJobId || codexOutput ? (
              <div className="codex-output">
                <div className="codex-output__heading">
                  <strong>{t("codex.outputTitle")}</strong>
                  <small>
                    {activeCodexJobId ? t("codex.outputRunning") : t("codex.outputComplete")}
                  </small>
                </div>
                <pre
                  aria-label={t("codex.outputTitle")}
                  aria-live="polite"
                  aria-relevant="additions text"
                  className="codex-output__log"
                  ref={codexOutputRef}
                  role="log"
                  tabIndex={0}
                >
                  {codexOutput || t("codex.outputWaiting")}
                </pre>
              </div>
            ) : null}
            {codexNotice ? (
              <div className="codex-plan-result" role="status">
                <strong>{codexNotice}</strong>
                {codexPlan ? <small>{codexPlan.rationale}</small> : null}
              </div>
            ) : null}
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
      {showCodexConsent ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="codex-consent-title"
            aria-modal="true"
            className="new-pattern-dialog codex-consent-dialog"
            onKeyDown={handleCodexDialogKeyDown}
            ref={codexDialogRef}
            role="dialog"
          >
            <div className="new-pattern-dialog__heading">
              <div>
                <span className="section-heading__eyebrow">{t("codex.experimental")}</span>
                <h2 id="codex-consent-title">{t("codex.consentTitle")}</h2>
                <p>{t("codex.consentDescription")}</p>
              </div>
            </div>
            <ul className="codex-consent-list">
              <li>{t("codex.consentImage")}</li>
              <li>{t("codex.consentWorkspace")}</li>
              <li>{t("codex.consentNetwork")}</li>
              <li>{t("codex.consentCredentials")}</li>
            </ul>
            <div className="new-pattern-dialog__actions">
              <button
                className="button button--secondary"
                onClick={() => setShowCodexConsent(false)}
                type="button"
              >
                {t("common.cancel")}
              </button>
              <button
                className="button button--primary"
                autoFocus
                onClick={acceptCodexConsent}
                type="button"
              >
                {t("codex.consentAccept")}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
