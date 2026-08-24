import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  EllipseIcon,
  EraserIcon,
  EyedropperIcon,
  FillIcon,
  FitIcon,
  HandIcon,
  LineIcon,
  MoonIcon,
  RectangleIcon,
  RedoIcon,
  SunIcon,
  SystemIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "../../components/Icons";
import { computeOccupiedBounds } from "../../editor/model/occupied-bounds";
import type { GridPoint } from "../../editor/tools/geometry";
import { PatternCanvas, type PatternCanvasHandle } from "./PatternCanvas";
import { CsvExportDialog } from "../csv/CsvExportDialog";
import { CompleteExportDialog } from "../export/CompleteExportDialog";

interface EditorPageProps {
  readonly onBack: () => void;
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
  { id: "pan", shortcut: "H", icon: <HandIcon /> },
];

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

export function EditorPage({ onBack }: EditorPageProps) {
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
  const strokeWidth = useEditorStore((state) => state.strokeWidth);
  const shapeFilled = useEditorStore((state) => state.shapeFilled);
  const setActiveTool = useEditorStore((state) => state.setActiveTool);
  const setSelectedColorIndex = useEditorStore((state) => state.setSelectedColorIndex);
  const setStrokeWidth = useEditorStore((state) => state.setStrokeWidth);
  const setShapeFilled = useEditorStore((state) => state.setShapeFilled);
  const canvasRef = useRef<PatternCanvasHandle>(null);
  const [cursor, setCursor] = useState<GridPoint | null>(null);
  const [zoom, setZoom] = useState(100);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [showCsvExport, setShowCsvExport] = useState(false);
  const [showCompleteExport, setShowCompleteExport] = useState(false);
  const bounds = useMemo(
    () => (document ? computeOccupiedBounds(document.grid) : null),
    [document],
  );

  const filteredColors = useMemo(() => {
    if (!document) return [];
    const query = paletteQuery.trim().toLocaleUpperCase();
    if (!query) return document.palette.colors.map((color, index) => ({ color, index }));
    return document.palette.colors
      .map((color, index) => ({ color, index }))
      .filter(({ color }) =>
        `${color.code} ${color.name ?? ""} ${color.hex}`.toLocaleUpperCase().includes(query),
      );
  }, [document, paletteQuery]);

  if (!document) return null;
  const selectedColor = document.palette.colors[selectedColorIndex] ?? document.palette.colors[0];
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
        <span className="offline-badge offline-badge--compact">
          <span aria-hidden="true" className="offline-badge__dot" />
          {t("status.offline")}
        </span>
        <EditorPreferences />
        <button
          className="button button--secondary editor-export"
          onClick={() => setShowCsvExport(true)}
          type="button"
        >
          {t("editor.exportCsv")}
        </button>
        <button
          className="button button--primary editor-export"
          onClick={() => setShowCompleteExport(true)}
          type="button"
        >
          {t("editor.exportPackage")}
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
            onUndo={undo}
            onZoomChange={setZoom}
            ref={canvasRef}
            revision={revision}
          />
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
            ) : null}
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
              <strong>{document.palette.colors.length}</strong>
            </div>
            <input
              aria-label={t("editor.searchColors")}
              className="palette-search"
              onChange={(event) => setPaletteQuery(event.target.value)}
              placeholder={t("editor.searchColors")}
              type="search"
              value={paletteQuery}
            />
            <div className="palette-grid" role="listbox" aria-label={document.palette.name}>
              {filteredColors.map(({ color, index }) => (
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
        <CsvExportDialog document={document} onClose={() => setShowCsvExport(false)} />
      ) : null}
      {showCompleteExport ? (
        <CompleteExportDialog document={document} onClose={() => setShowCompleteExport(false)} />
      ) : null}
    </div>
  );
}
