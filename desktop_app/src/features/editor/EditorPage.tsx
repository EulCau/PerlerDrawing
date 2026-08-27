import * as ToggleGroup from "@radix-ui/react-toggle-group";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useDocumentStore } from "../../app/document-store";
import { useEditorStore, type EditorTool } from "../../app/editor-store";
import {
  isLocale,
  isThemeMode,
  useSettingsStore,
  type Locale,
  type ThemeMode,
} from "../../app/settings-store";
import { BrandMark } from "../../components/BrandMark";
import {
  BackIcon,
  BrushIcon,
  ClockIcon,
  DownloadIcon,
  EllipseIcon,
  EraserIcon,
  EyedropperIcon,
  FillIcon,
  FileIcon,
  FitIcon,
  HandIcon,
  LineIcon,
  MoonIcon,
  PlusIcon,
  RectangleIcon,
  RedoIcon,
  SelectionIcon,
  SaveAsIcon,
  SaveIcon,
  SunIcon,
  SystemIcon,
  TableIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "../../components/Icons";
import { createGridPatchCommand } from "../../editor/commands/grid-patch-command";
import { createSymmetryCommand } from "../../editor/commands/symmetry-command";
import type { PatternGrid } from "../../editor/model/grid";
import { comparePatternGrids } from "../../editor/model/grid-comparison";
import { computeOccupiedBounds } from "../../editor/model/occupied-bounds";
import type { SymmetrySettings, SymmetryType } from "../../editor/model/pattern-document";
import {
  clearGridSelection,
  copyGridSelection,
  moveGridSelection,
  pasteGridClipboard,
  selectionHeight,
  selectionWidth,
  transformGridSelection,
  type GridClipboard,
  type GridSelection,
  type SelectionTransform,
} from "../../editor/selection/grid-selection";
import type { GridPoint } from "../../editor/tools/geometry";
import {
  fillSingleCellMaskHoles,
  removeIsolatedMaskCells,
} from "../../editor/tools/mask-correction";
import { PatternCanvas, type PatternCanvasHandle } from "./PatternCanvas";
import { AddColorDialog } from "./AddColorDialog";
import { CsvExportDialog } from "../csv/CsvExportDialog";
import { CompleteExportDialog } from "../export/CompleteExportDialog";
import { BoardPdfDialog } from "../export/BoardPdfDialog";
import { VersionCompareDialog } from "./VersionCompareDialog";

interface EditorPageProps {
  readonly onBack: () => void;
  readonly onSave: (saveAs: boolean) => Promise<void>;
  readonly saving: boolean;
  readonly saveError: string;
  readonly isDirty: boolean;
  readonly currentProjectPath?: string;
  readonly lastExportDirectory?: string;
  readonly onExportSaved: (path: string) => Promise<void>;
}

interface ToolDefinition {
  readonly id: EditorTool;
  readonly shortcut: string;
  readonly icon: ReactNode;
}

const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  { id: "brush", shortcut: "B", icon: <BrushIcon /> },
  { id: "eraser", shortcut: "E", icon: <EraserIcon /> },
  { id: "fill", shortcut: "F", icon: <FillIcon /> },
  { id: "eyedropper", shortcut: "I", icon: <EyedropperIcon /> },
  { id: "line", shortcut: "L", icon: <LineIcon /> },
  { id: "rectangle", shortcut: "R", icon: <RectangleIcon /> },
  { id: "ellipse", shortcut: "O", icon: <EllipseIcon /> },
  { id: "selection", shortcut: "S", icon: <SelectionIcon /> },
  { id: "pan", shortcut: "H", icon: <HandIcon /> },
];

function symmetrySettings(type: SymmetryType, columns: number, rows: number): SymmetrySettings {
  if (type === "vertical") return { type, axisOrCenter: [(columns - 1) / 2] };
  if (type === "horizontal") return { type, axisOrCenter: [(rows - 1) / 2] };
  if (type === "central") {
    return { type, axisOrCenter: [(rows - 1) / 2, (columns - 1) / 2] };
  }
  return { type: "none" };
}

const SYMMETRY_LABEL_KEYS: Readonly<Record<SymmetryType, string>> = {
  none: "image.symmetryNone",
  vertical: "image.symmetryVertical",
  horizontal: "image.symmetryHorizontal",
  central: "image.symmetryCentral",
};

function EditorPreferences() {
  const { t } = useTranslation();
  const locale = useSettingsStore((state) => state.locale);
  const theme = useSettingsStore((state) => state.theme);
  const setLocale = useSettingsStore((state) => state.setLocale);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const localeOptions: Array<{ value: Locale; label: string; short: string }> = [
    { value: "zh-CN", label: t("preferences.chinese"), short: "中" },
    { value: "en-US", label: t("preferences.english"), short: "EN" },
  ];
  const themeOptions: Array<{ value: ThemeMode; label: string; icon: ReactNode }> = [
    { value: "light", label: t("preferences.light"), icon: <SunIcon /> },
    { value: "dark", label: t("preferences.dark"), icon: <MoonIcon /> },
    { value: "system", label: t("preferences.system"), icon: <SystemIcon /> },
  ];

  return (
    <div className="editor-preferences">
      <ToggleGroup.Root
        aria-label={t("preferences.language")}
        className="segmented-control segmented-control--compact"
        onValueChange={(value) => {
          if (isLocale(value)) setLocale(value);
        }}
        type="single"
        value={locale}
      >
        {localeOptions.map((option) => (
          <ToggleGroup.Item
            aria-label={option.label}
            className="segmented-control__item"
            key={option.value}
            value={option.value}
          >
            {option.short}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <ToggleGroup.Root
        aria-label={t("preferences.theme")}
        className="segmented-control segmented-control--compact"
        onValueChange={(value) => {
          if (isThemeMode(value)) setTheme(value);
        }}
        type="single"
        value={theme}
      >
        {themeOptions.map((option) => (
          <ToggleGroup.Item
            aria-label={option.label}
            className="segmented-control__item segmented-control__item--icon"
            key={option.value}
            value={option.value}
          >
            {option.icon}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}

export function EditorPage({
  currentProjectPath,
  isDirty,
  lastExportDirectory,
  onBack,
  onExportSaved,
  onSave,
  saveError,
  saving,
}: EditorPageProps) {
  const { t } = useTranslation();
  const document = useDocumentStore((state) => state.document);
  const revision = useDocumentStore((state) => state.revision);
  const canUndo = useDocumentStore((state) => state.canUndo);
  const canRedo = useDocumentStore((state) => state.canRedo);
  const executeCommand = useDocumentStore((state) => state.executeCommand);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const activeTool = useEditorStore((state) => state.activeTool);
  const selectedColorIndex = useEditorStore((state) => state.selectedColorIndex);
  const addedColorIndices = useEditorStore((state) => state.addedColorIndices);
  const strokeWidth = useEditorStore((state) => state.strokeWidth);
  const shapeFilled = useEditorStore((state) => state.shapeFilled);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const setSelectedColorIndex = useEditorStore((state) => state.setSelectedColorIndex);
  const addColorIndex = useEditorStore((state) => state.addColorIndex);
  const setStrokeWidth = useEditorStore((state) => state.setStrokeWidth);
  const setShapeFilled = useEditorStore((state) => state.setShapeFilled);
  const canvasRef = useRef<PatternCanvasHandle>(null);
  const [cursor, setCursor] = useState<GridPoint | null>(null);
  const [zoom, setZoom] = useState(100);
  const [showAddColor, setShowAddColor] = useState(false);
  const [showCsvExport, setShowCsvExport] = useState(false);
  const [showCompleteExport, setShowCompleteExport] = useState(false);
  const [showPdfExport, setShowPdfExport] = useState(false);
  const [showVersionCompare, setShowVersionCompare] = useState(false);
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [clipboard, setClipboard] = useState<GridClipboard | null>(null);
  const [comparisonReference, setComparisonReference] = useState<{
    readonly fileName: string;
    readonly grid: PatternGrid;
  } | null>(null);
  const bounds = useMemo(
    () => (document ? computeOccupiedBounds(document.grid) : null),
    [document],
  );

  const addedColors = useMemo(
    () =>
      document
        ? addedColorIndices.flatMap((index) => {
            const color = document.palette.colors[index];
            return color ? [{ color, index }] : [];
          })
        : [],
    [addedColorIndices, document],
  );
  const comparison = useMemo(
    () =>
      document && comparisonReference
        ? {
            fileName: comparisonReference.fileName,
            result: comparePatternGrids(document.grid, comparisonReference.grid),
          }
        : null,
    [comparisonReference, document],
  );

  const executeSelectionEdit = useCallback(
    (
      edit: {
        readonly selection: GridSelection;
        readonly changes: readonly { row: number; column: number; value: number }[];
      } | null,
      label: string,
    ) => {
      if (!document || !edit) return;
      executeCommand(createGridPatchCommand(document, label, edit.changes));
      setSelection(edit.selection);
    },
    [document, executeCommand],
  );

  const moveSelection = useCallback(
    (source: GridSelection, columnDelta: number, rowDelta: number) => {
      if (!document) return;
      executeSelectionEdit(
        moveGridSelection(document.grid, source, columnDelta, rowDelta),
        "Move selection",
      );
    },
    [document, executeSelectionEdit],
  );

  const copySelection = useCallback(() => {
    if (document && selection) setClipboard(copyGridSelection(document.grid, selection));
  }, [document, selection]);

  const pasteSelection = useCallback(() => {
    if (!document || !clipboard) return;
    const maximumLeft = document.grid.columns - clipboard.columns;
    const maximumTop = document.grid.rows - clipboard.rows;
    if (maximumLeft < 0 || maximumTop < 0) return;
    const target = {
      column: Math.min(maximumLeft, Math.max(0, selection?.left ?? cursor?.column ?? 0)),
      row: Math.min(maximumTop, Math.max(0, selection?.top ?? cursor?.row ?? 0)),
    };
    executeSelectionEdit(pasteGridClipboard(clipboard, target, document.grid), "Paste selection");
  }, [clipboard, cursor, document, executeSelectionEdit, selection]);

  const deleteSelection = useCallback(() => {
    if (!document || !selection) return;
    executeCommand(
      createGridPatchCommand(
        document,
        "Clear selection",
        clearGridSelection(selection, document.grid),
      ),
    );
  }, [document, executeCommand, selection]);

  const transformSelection = useCallback(
    (transform: SelectionTransform) => {
      if (!document || !selection) return;
      executeSelectionEdit(
        transformGridSelection(document.grid, selection, transform),
        transform === "rotateClockwise"
          ? "Rotate selection"
          : transform === "flipHorizontal"
            ? "Flip selection horizontally"
            : "Flip selection vertically",
      );
    },
    [document, executeSelectionEdit, selection],
  );

  const applyMaskCorrection = useCallback(
    (kind: "removeIsolated" | "fillHoles") => {
      if (!document) return;
      const changes =
        kind === "removeIsolated"
          ? removeIsolatedMaskCells(document.grid, selection)
          : fillSingleCellMaskHoles(document.grid, selection);
      executeCommand(
        createGridPatchCommand(
          document,
          kind === "removeIsolated" ? "Remove isolated mask cells" : "Fill single-cell mask holes",
          changes,
        ),
      );
    },
    [document, executeCommand, selection],
  );

  useEffect(() => {
    const handleSaveShortcut = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "s") return;
      event.preventDefault();
      if (!saving) void onSave(event.shiftKey);
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [onSave, saving]);

  if (!document) return null;
  const symmetry = document.symmetry;
  const selectedColor =
    selectedColorIndex === null ? null : document.palette.colors[selectedColorIndex];
  const usesStroke = ["brush", "eraser", "line", "rectangle", "ellipse"].includes(activeTool);
  const usesFillOption = activeTool === "rectangle" || activeTool === "ellipse";

  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <button
          aria-label={t("app.homeLabel")}
          className="editor-brand-button"
          onClick={onBack}
          type="button"
        >
          <BackIcon className="editor-brand-button__back" />
          <BrandMark />
        </button>
        <div className="document-title">
          <strong>{document.artifact.name}</strong>
          <span>
            {document.grid.columns} × {document.grid.rows} · {document.palette.name}
          </span>
        </div>
        <div className="editor-topbar__group" aria-label={t("editor.history")}>
          <button
            aria-label={t("editor.undo")}
            className="icon-button"
            disabled={!canUndo}
            onClick={undo}
            title={`${t("editor.undo")} · Ctrl+Z`}
            type="button"
          >
            <UndoIcon />
          </button>
          <button
            aria-label={t("editor.redo")}
            className="icon-button"
            disabled={!canRedo}
            onClick={redo}
            title={`${t("editor.redo")} · Ctrl+Shift+Z`}
            type="button"
          >
            <RedoIcon />
          </button>
        </div>
        <div className="editor-topbar__group editor-zoom" aria-label={t("editor.zoom")}>
          <button
            aria-label={t("editor.zoomOut")}
            className="icon-button"
            onClick={() => canvasRef.current?.zoomOut()}
            type="button"
          >
            <ZoomOutIcon />
          </button>
          <output aria-label={t("editor.zoomLevel")}>{zoom}%</output>
          <button
            aria-label={t("editor.zoomIn")}
            className="icon-button"
            onClick={() => canvasRef.current?.zoomIn()}
            type="button"
          >
            <ZoomInIcon />
          </button>
          <button
            aria-label={t("editor.fit")}
            className="icon-button"
            onClick={() => canvasRef.current?.fit()}
            title={`${t("editor.fit")} · 0`}
            type="button"
          >
            <FitIcon />
          </button>
        </div>
        <div className="editor-topbar__spacer" />
        <button
          aria-label={t("project.save")}
          className="button button--secondary editor-save"
          disabled={saving}
          onClick={() => void onSave(false)}
          title={`${t("project.save")} · Ctrl+S`}
          type="button"
        >
          <SaveIcon />
          <span>{saving ? t("project.saving") : t("project.save")}</span>
        </button>
        <button
          aria-label={t("project.saveAs")}
          className="icon-button"
          disabled={saving}
          onClick={() => void onSave(true)}
          title={`${t("project.saveAs")} · Ctrl+Shift+S`}
          type="button"
        >
          <SaveAsIcon />
        </button>
        <span className="offline-badge offline-badge--compact">
          <span aria-hidden="true" className="offline-badge__dot" />
          {t("status.offline")}
        </span>
        <EditorPreferences />
        <button
          aria-label={t("editor.compare")}
          className="icon-button"
          onClick={() => setShowVersionCompare(true)}
          title={t("editor.compare")}
          type="button"
        >
          <ClockIcon />
        </button>
        <button
          aria-label={t("editor.printPdf")}
          className="icon-button"
          onClick={() => setShowPdfExport(true)}
          title={t("editor.printPdf")}
          type="button"
        >
          <FileIcon />
        </button>
        <button
          aria-label={t("editor.exportCsv")}
          className="button button--secondary editor-export"
          onClick={() => setShowCsvExport(true)}
          type="button"
        >
          <TableIcon />
          <span>{t("editor.exportCsv")}</span>
        </button>
        <button
          aria-label={t("editor.exportPackage")}
          className="button button--primary editor-export"
          onClick={() => setShowCompleteExport(true)}
          type="button"
        >
          <DownloadIcon />
          <span>{t("editor.exportPackage")}</span>
        </button>
      </header>

      <main className="editor-workspace">
        <aside aria-label={t("editor.tools")} className="tool-rail">
          {TOOL_DEFINITIONS.map((tool) => (
            <button
              aria-label={`${t(`tools.${tool.id}`)} (${tool.shortcut})`}
              aria-pressed={activeTool === tool.id}
              className="tool-button"
              data-active={activeTool === tool.id ? "true" : undefined}
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              title={`${t(`tools.${tool.id}`)} · ${tool.shortcut}`}
              type="button"
            >
              {tool.icon}
              <kbd>{tool.shortcut}</kbd>
            </button>
          ))}
        </aside>

        <section className="canvas-stage" aria-label={t("editor.canvasRegion")}>
          <PatternCanvas
            document={document}
            onCursorChange={setCursor}
            onExecute={executeCommand}
            onRedo={redo}
            onClearSelection={() => setSelection(null)}
            onCopySelection={copySelection}
            onDeleteSelection={deleteSelection}
            onMoveSelection={moveSelection}
            onPasteSelection={pasteSelection}
            onSelectionChange={setSelection}
            onUndo={undo}
            onZoomChange={setZoom}
            ref={canvasRef}
            revision={revision}
            selection={selection}
            symmetry={symmetry}
            differences={comparison?.result.differences ?? []}
          />
          {comparison ? (
            <div className="comparison-overlay" role="status">
              <span>
                <strong>{t("compare.overlayTitle")}</strong>
                <small>{comparison.fileName}</small>
              </span>
              <span data-kind="added">+{comparison.result.added}</span>
              <span data-kind="removed">−{comparison.result.removed}</span>
              <span data-kind="changed">~{comparison.result.changed}</span>
              <button
                aria-label={t("compare.clearOverlay")}
                onClick={() => setComparisonReference(null)}
                type="button"
              >
                ×
              </button>
            </div>
          ) : null}
        </section>

        <aside aria-label={t("editor.inspector")} className="inspector">
          <section className="inspector-section">
            <div className="inspector-heading">
              <span>{t("editor.currentColor")}</span>
              <strong>{selectedColor?.code}</strong>
            </div>
            {selectedColor ? (
              <div className="current-color-card">
                <span
                  aria-hidden="true"
                  className="current-color-card__swatch"
                  style={{ "--swatch-color": selectedColor.hex } as CSSProperties}
                />
                <span>
                  <strong>{selectedColor.code}</strong>
                  <small>{selectedColor.name ?? selectedColor.hex}</small>
                </span>
              </div>
            ) : (
              <div className="current-color-empty">
                <strong>{t("editor.noAddedColors")}</strong>
                <span>{t("editor.noAddedColorsHint")}</span>
              </div>
            )}
          </section>

          <section className="inspector-section">
            <div className="inspector-heading">
              <span>{t("editor.symmetryDrawing")}</span>
              <strong>{t(SYMMETRY_LABEL_KEYS[symmetry.type])}</strong>
            </div>
            <select
              aria-label={t("editor.symmetryDrawing")}
              className="inspector-select"
              onChange={(event) => {
                const type = event.target.value as SymmetryType;
                executeCommand(
                  createSymmetryCommand(
                    document,
                    symmetrySettings(type, document.grid.columns, document.grid.rows),
                  ),
                );
              }}
              value={symmetry.type}
            >
              <option value="none">{t("image.symmetryNone")}</option>
              <option value="vertical">{t("image.symmetryVertical")}</option>
              <option value="horizontal">{t("image.symmetryHorizontal")}</option>
              <option value="central">{t("image.symmetryCentral")}</option>
            </select>
            <p className="inspector-note inspector-note--spaced">{t("editor.symmetryHint")}</p>
          </section>

          {selection ? (
            <section className="inspector-section selection-panel">
              <div className="inspector-heading">
                <span>{t("editor.selection")}</span>
                <strong>
                  {selectionWidth(selection)} × {selectionHeight(selection)}
                </strong>
              </div>
              <div className="inspector-action-grid">
                <button onClick={copySelection} type="button">
                  {t("editor.copy")}
                </button>
                <button disabled={!clipboard} onClick={pasteSelection} type="button">
                  {t("editor.paste")}
                </button>
                <button onClick={() => transformSelection("rotateClockwise")} type="button">
                  {t("editor.rotate")}
                </button>
                <button onClick={() => transformSelection("flipHorizontal")} type="button">
                  {t("editor.flipHorizontal")}
                </button>
                <button onClick={() => transformSelection("flipVertical")} type="button">
                  {t("editor.flipVertical")}
                </button>
                <button data-danger="true" onClick={deleteSelection} type="button">
                  {t("editor.clearSelectionCells")}
                </button>
              </div>
              <p className="inspector-note inspector-note--spaced">{t("editor.selectionHint")}</p>
            </section>
          ) : null}

          <section className="inspector-section mask-panel">
            <div className="inspector-heading">
              <span>{t("editor.maskCorrection")}</span>
              <strong>{selection ? t("editor.selectionScope") : t("editor.canvasScope")}</strong>
            </div>
            <div className="inspector-action-grid">
              <button onClick={() => applyMaskCorrection("removeIsolated")} type="button">
                {t("editor.removeIsolated")}
              </button>
              <button onClick={() => applyMaskCorrection("fillHoles")} type="button">
                {t("editor.fillSingleHoles")}
              </button>
            </div>
            <p className="inspector-note inspector-note--spaced">{t("editor.maskHint")}</p>
          </section>

          <section className="inspector-section">
            <div className="inspector-heading">
              <span>{t("editor.toolParameters")}</span>
              <strong>{t(`tools.${activeTool}`)}</strong>
            </div>
            {usesStroke ? (
              <label className="parameter-row">
                <span>{t("editor.strokeWidth")}</span>
                <input
                  aria-label={t("editor.strokeWidth")}
                  max="12"
                  min="1"
                  onChange={(event) => setStrokeWidth(Number.parseInt(event.target.value, 10))}
                  type="range"
                  value={strokeWidth}
                />
                <output>{strokeWidth}</output>
              </label>
            ) : (
              <p className="inspector-note">{t("editor.noToolParameters")}</p>
            )}
            {usesFillOption ? (
              <label className="checkbox-row">
                <input
                  checked={shapeFilled}
                  onChange={(event) => setShapeFilled(event.target.checked)}
                  type="checkbox"
                />
                <span>{t("editor.filledShape")}</span>
              </label>
            ) : null}
          </section>

          <section className="inspector-section inspector-section--palette">
            <div className="inspector-heading">
              <span>{t("editor.palette")}</span>
              <strong>
                {addedColorIndices.length} / {document.palette.colors.length}
              </strong>
            </div>
            <button
              className="button button--secondary palette-add-button"
              onClick={() => setShowAddColor(true)}
              type="button"
            >
              <PlusIcon />
              {t("editor.addColor")}
            </button>
            {addedColors.length > 0 ? (
              <div className="palette-grid" role="listbox" aria-label={t("editor.addedColors")}>
                {addedColors.map(({ color, index }) => (
                  <button
                    aria-label={`${color.code} ${color.name ?? color.hex}`}
                    aria-selected={selectedColorIndex === index}
                    className="palette-swatch"
                    key={color.code}
                    onClick={() => setSelectedColorIndex(index)}
                    role="option"
                    style={{ "--swatch-color": color.hex } as CSSProperties}
                    title={`${color.code} · ${color.hex}`}
                    type="button"
                  >
                    <span aria-hidden="true" />
                    <small>{color.code}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="palette-empty-state">
                <strong>{t("editor.noAddedColors")}</strong>
                <span>{t("editor.paletteEmptyHint")}</span>
              </div>
            )}
          </section>

          <section className="inspector-section document-facts">
            <div className="inspector-heading">
              <span>{t("editor.document")}</span>
            </div>
            <dl>
              <div>
                <dt>{t("newPattern.canvas")}</dt>
                <dd>
                  {document.canvas.columns} × {document.canvas.rows}
                </dd>
              </div>
              <div>
                <dt>{t("newPattern.board")}</dt>
                <dd>
                  {document.board.columns} × {document.board.rows}
                </dd>
              </div>
              <div>
                <dt>{t("newPattern.subdivision")}</dt>
                <dd>{document.board.subdivision}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </main>

      <footer className="editor-statusbar">
        <span
          className="project-save-status"
          data-state={saveError ? "error" : isDirty ? "dirty" : "saved"}
          title={saveError || currentProjectPath}
        >
          {saveError
            ? t("project.saveFailed")
            : saving
              ? t("project.saving")
              : isDirty
                ? t("project.unsaved")
                : t("project.saved")}
        </span>
        <span>
          {t("editor.coordinates")}: {cursor ? `${cursor.column + 1}, ${cursor.row + 1}` : "—"}
        </span>
        <span>
          {t("editor.currentCode")}: {selectedColor?.code ?? "—"}
        </span>
        <span>
          {t("editor.occupied")}: {bounds ? `${bounds.width} × ${bounds.height}` : "0 × 0"}
        </span>
        <span>
          {t("editor.beads")}: {bounds?.beadCount ?? 0}
        </span>
        <span className="editor-statusbar__hint">{t("editor.shortcutHint")}</span>
      </footer>
      {showCsvExport ? (
        <CsvExportDialog
          document={document}
          lastExportDirectory={lastExportDirectory}
          onClose={() => setShowCsvExport(false)}
          onExportSaved={onExportSaved}
        />
      ) : null}
      {showCompleteExport ? (
        <CompleteExportDialog
          document={document}
          lastExportDirectory={lastExportDirectory}
          onClose={() => setShowCompleteExport(false)}
          onExportSaved={onExportSaved}
        />
      ) : null}
      {showPdfExport ? (
        <BoardPdfDialog
          document={document}
          lastExportDirectory={lastExportDirectory}
          onClose={() => setShowPdfExport(false)}
          onExportSaved={onExportSaved}
        />
      ) : null}
      {showVersionCompare ? (
        <VersionCompareDialog
          document={document}
          onApply={(grid, fileName) => {
            setComparisonReference({ grid, fileName });
            setShowVersionCompare(false);
          }}
          onClose={() => setShowVersionCompare(false)}
        />
      ) : null}
      {showAddColor ? (
        <AddColorDialog
          addedColorIndices={addedColorIndices}
          onAdd={(index) => {
            addColorIndex(index);
            setShowAddColor(false);
            canvasRef.current?.focus();
          }}
          onClose={() => setShowAddColor(false)}
          palette={document.palette}
        />
      ) : null}
    </div>
  );
}
