import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useEditorStore, type EditorTool } from "../../app/editor-store";
import { useSettingsStore } from "../../app/settings-store";
import { createGridPatchCommand } from "../../editor/commands/grid-patch-command";
import {
  computeGridDifferenceBounds,
  renderBeadCanvas,
  renderGridCanvas,
  renderGridOverlayCanvas,
  renderInteractionCanvas,
  type CanvasDisplayMode,
  type CanvasTheme,
} from "../../editor/canvas/render-canvas";
import {
  canvasPointToGrid,
  fitViewport,
  zoomViewportAtPoint,
  type CanvasPoint,
  type CanvasSize,
  type CanvasViewport,
} from "../../editor/canvas/viewport";
import { EMPTY_CELL, getCell } from "../../editor/model/grid";
import type { CellDifference } from "../../editor/model/grid-comparison";
import type { PatternDocument, SymmetrySettings } from "../../editor/model/pattern-document";
import {
  normalizeSelection,
  selectionContains,
  translateSelection,
  type GridSelection,
} from "../../editor/selection/grid-selection";
import { floodFillCells } from "../../editor/tools/flood-fill";
import {
  rasterizeEllipse,
  rasterizeLine,
  rasterizeRectangle,
  type GridPoint,
} from "../../editor/tools/geometry";
import { applySymmetryToChanges } from "../../editor/tools/symmetry";

export interface PatternCanvasHandle {
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  focus(): void;
}

interface PatternCanvasProps {
  readonly document: PatternDocument;
  readonly revision: number;
  readonly onExecute: (command: ReturnType<typeof createGridPatchCommand>) => boolean;
  readonly onUndo: () => boolean;
  readonly onRedo: () => boolean;
  readonly onCursorChange: (point: GridPoint | null) => void;
  readonly onZoomChange: (zoomPercent: number) => void;
  readonly selection: GridSelection | null;
  readonly symmetry: SymmetrySettings;
  readonly differences: readonly CellDifference[];
  readonly displayMode: CanvasDisplayMode;
  readonly onSelectionChange: (selection: GridSelection | null) => void;
  readonly onMoveSelection: (
    selection: GridSelection,
    columnDelta: number,
    rowDelta: number,
  ) => void;
  readonly onClearSelection: () => void;
  readonly onDeleteSelection: () => void;
  readonly onCopySelection: () => void;
  readonly onPasteSelection: () => void;
}

type Gesture =
  | {
      readonly kind: "pan";
      readonly pointerId: number;
      readonly startClient: CanvasPoint;
      readonly startViewport: CanvasViewport;
    }
  | {
      readonly kind: "stroke";
      readonly pointerId: number;
      last: GridPoint;
      readonly points: Map<string, GridPoint>;
      readonly erasing: boolean;
    }
  | {
      readonly kind: "shape";
      readonly pointerId: number;
      readonly tool: "line" | "rectangle" | "ellipse";
      readonly start: GridPoint;
      points: GridPoint[];
    }
  | {
      readonly kind: "selection";
      readonly pointerId: number;
      readonly start: GridPoint;
    }
  | {
      readonly kind: "selection-move";
      readonly pointerId: number;
      readonly start: GridPoint;
      readonly original: GridSelection;
      current: GridSelection;
    };

function pointKey(point: GridPoint): string {
  return `${point.row}:${point.column}`;
}

function clipPoints(points: readonly GridPoint[], document: PatternDocument): GridPoint[] {
  return points.filter(
    (point) =>
      point.column >= 0 &&
      point.row >= 0 &&
      point.column < document.grid.columns &&
      point.row < document.grid.rows,
  );
}

function symmetricPoints(
  points: readonly GridPoint[],
  document: PatternDocument,
  symmetry: SymmetrySettings,
): GridPoint[] {
  return applySymmetryToChanges(
    points.map((point) => ({ ...point, value: 0 })),
    document.grid,
    symmetry,
  ).map(({ column, row }) => ({ column, row }));
}

function shapePoints(
  tool: "line" | "rectangle" | "ellipse",
  start: GridPoint,
  end: GridPoint,
  strokeWidth: number,
  filled: boolean,
): GridPoint[] {
  if (tool === "line") return rasterizeLine(start, end, strokeWidth);
  if (tool === "rectangle") {
    return rasterizeRectangle(start, end, { filled, strokeWidth });
  }
  return rasterizeEllipse(start, end, { filled, strokeWidth });
}

function readTheme(): CanvasTheme {
  const styles = getComputedStyle(document.documentElement);
  const variable = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    workspace: variable("--canvas-workspace", "#ececf2"),
    board: variable("--canvas-board", "#ffffff"),
    grid: variable("--canvas-grid", "rgba(37, 36, 52, 0.13)"),
    subdivision: variable("--canvas-subdivision", "rgba(37, 36, 52, 0.3)"),
    boardBoundary: variable("--canvas-board-boundary", "rgba(37, 36, 52, 0.7)"),
    coordinate: variable("--canvas-coordinate", "#6d6c78"),
    beadHole: variable("--canvas-bead-hole", "rgba(255, 255, 255, 0.7)"),
    accent: variable("--color-accent", "#6759d7"),
    erase: variable("--color-danger", "#d94b5f"),
    selectionFill: variable("--color-accent-soft", "rgba(103, 89, 215, 0.12)"),
    differenceAdded: variable("--color-success", "#278b63"),
    differenceRemoved: variable("--color-danger", "#d94b5f"),
    differenceChanged: variable("--color-warning", "#b7791f"),
  };
}

function localPoint(event: PointerEvent<HTMLCanvasElement>): CanvasPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

function localWheelPoint(event: WheelEvent<HTMLCanvasElement>): CanvasPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export const PatternCanvas = forwardRef<PatternCanvasHandle, PatternCanvasProps>(
  function PatternCanvas(
    {
      document,
      revision,
      onExecute,
      onUndo,
      onRedo,
      onCursorChange,
      onZoomChange,
      selection,
      symmetry,
      differences,
      displayMode,
      onSelectionChange,
      onMoveSelection,
      onClearSelection,
      onDeleteSelection,
      onCopySelection,
      onPasteSelection,
    },
    forwardedRef,
  ) {
    const { t } = useTranslation();
    const activeTool = useEditorStore((state) => state.activeTool);
    const selectedColorIndex = useEditorStore((state) => state.selectedColorIndex);
    const addedColorIndices = useEditorStore((state) => state.addedColorIndices);
    const strokeWidth = useEditorStore((state) => state.strokeWidth);
    const shapeFilled = useEditorStore((state) => state.shapeFilled);
    const setActiveTool = useEditorStore((state) => state.setActiveTool);
    const setSelectedColorIndex = useEditorStore((state) => state.setSelectedColorIndex);
    const themeMode = useSettingsStore((state) => state.theme);
    const containerRef = useRef<HTMLDivElement>(null);
    const gridCanvasRef = useRef<HTMLCanvasElement>(null);
    const beadCanvasRef = useRef<HTMLCanvasElement>(null);
    const guideCanvasRef = useRef<HTMLCanvasElement>(null);
    const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
    const gestureRef = useRef<Gesture | null>(null);
    const documentRef = useRef(document);
    const viewportRef = useRef<CanvasViewport>({ offsetX: 0, offsetY: 0, cellSize: 16 });
    const sizeRef = useRef<CanvasSize>({ width: 0, height: 0 });
    const lastFitKeyRef = useRef("");
    const renderKeyRef = useRef("");
    const previousCellsRef = useRef<Uint16Array | null>(null);
    const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
    const [viewport, setViewport] = useState<CanvasViewport>(viewportRef.current);
    const [hover, setHover] = useState<GridPoint | null>(null);
    const [preview, setPreview] = useState<GridPoint[]>([]);
    const [previewErasing, setPreviewErasing] = useState(false);
    const [spacePan, setSpacePan] = useState(false);
    const [isPanning, setIsPanning] = useState(false);
    const selectedPaintIndex =
      selectedColorIndex !== null && addedColorIndices.includes(selectedColorIndex)
        ? selectedColorIndex
        : null;

    documentRef.current = document;
    viewportRef.current = viewport;
    sizeRef.current = size;

    const setViewportAndRef = useCallback((next: CanvasViewport) => {
      viewportRef.current = next;
      setViewport(next);
    }, []);

    const fit = useCallback(() => {
      const currentSize = sizeRef.current;
      if (currentSize.width <= 0 || currentSize.height <= 0) return;
      setViewportAndRef(fitViewport(currentSize, documentRef.current.grid));
    }, [setViewportAndRef]);

    const zoomBy = useCallback(
      (factor: number) => {
        const currentSize = sizeRef.current;
        const anchor = { x: currentSize.width / 2, y: currentSize.height / 2 };
        setViewportAndRef(
          zoomViewportAtPoint(viewportRef.current, viewportRef.current.cellSize * factor, anchor),
        );
      },
      [setViewportAndRef],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        fit,
        zoomIn: () => zoomBy(1.2),
        zoomOut: () => zoomBy(1 / 1.2),
        focus: () => interactionCanvasRef.current?.focus(),
      }),
      [fit, zoomBy],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const updateSize = (width: number, height: number) => {
        const next = { width: Math.max(1, width), height: Math.max(1, height) };
        setSize((current) =>
          current.width === next.width && current.height === next.height ? current : next,
        );
      };

      if (typeof ResizeObserver === "undefined") {
        const bounds = container.getBoundingClientRect();
        updateSize(bounds.width || 800, bounds.height || 600);
        return;
      }

      const observer = new ResizeObserver(([entry]) => {
        if (entry) updateSize(entry.contentRect.width, entry.contentRect.height);
      });
      observer.observe(container);
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      const key = `${document.artifact.name}:${document.artifact.version}:${document.grid.columns}x${document.grid.rows}`;
      if (size.width <= 0 || size.height <= 0 || lastFitKeyRef.current === key) return;
      lastFitKeyRef.current = key;
      setViewportAndRef(fitViewport(size, document.grid));
    }, [document, setViewportAndRef, size]);

    useEffect(() => {
      const gridCanvas = gridCanvasRef.current;
      const beadCanvas = beadCanvasRef.current;
      const guideCanvas = guideCanvasRef.current;
      if (!gridCanvas || !beadCanvas || !guideCanvas || size.width <= 0 || size.height <= 0) return;
      const theme = readTheme();
      const renderKey = [
        document.artifact.name,
        document.artifact.version,
        document.grid.columns,
        document.grid.rows,
        document.board.columns,
        document.board.rows,
        document.board.subdivision,
        size.width,
        size.height,
        viewport.offsetX,
        viewport.offsetY,
        viewport.cellSize,
        themeMode,
        displayMode,
      ].join(":");
      const previousCells = previousCellsRef.current;
      if (renderKeyRef.current !== renderKey || !previousCells) {
        renderGridCanvas(gridCanvas, document, viewport, size, theme);
        renderBeadCanvas(beadCanvas, document, viewport, size, theme, null, displayMode);
        renderGridOverlayCanvas(guideCanvas, document, viewport, size, theme, displayMode);
      } else {
        const dirtyBounds = computeGridDifferenceBounds(
          previousCells,
          document.grid.cells,
          document.grid.columns,
        );
        if (dirtyBounds) {
          renderBeadCanvas(beadCanvas, document, viewport, size, theme, dirtyBounds, displayMode);
        }
      }
      renderKeyRef.current = renderKey;
      previousCellsRef.current = document.grid.cells.slice();
    }, [displayMode, document, revision, size, themeMode, viewport]);

    useEffect(() => {
      const canvas = interactionCanvasRef.current;
      const color =
        selectedPaintIndex === null
          ? "#000000"
          : (document.palette.colors[selectedPaintIndex]?.hex ?? "#000000");
      if (!canvas || size.width <= 0 || size.height <= 0) return;
      renderInteractionCanvas(
        canvas,
        displayMode === "preview" ? [] : preview,
        displayMode === "preview" ? null : hover,
        viewport,
        size,
        color,
        previewErasing,
        readTheme(),
        displayMode === "preview" ? null : selection,
        displayMode === "preview" ? [] : differences,
      );
    }, [
      document.palette.colors,
      differences,
      displayMode,
      hover,
      preview,
      previewErasing,
      selectedPaintIndex,
      selection,
      size,
      themeMode,
      viewport,
    ]);

    useEffect(() => {
      onZoomChange(Math.round((viewport.cellSize / 24) * 100));
    }, [onZoomChange, viewport.cellSize]);

    const commitPoints = useCallback(
      (points: readonly GridPoint[], value: number, label: string) => {
        const currentDocument = documentRef.current;
        const clipped = clipPoints(points, currentDocument);
        if (clipped.length === 0) return;
        const changes = applySymmetryToChanges(
          clipped.map((point) => ({ ...point, value })),
          currentDocument.grid,
          symmetry,
        );
        const command = createGridPatchCommand(currentDocument, label, changes);
        onExecute(command);
      },
      [onExecute, symmetry],
    );

    const updateHover = (event: PointerEvent<HTMLCanvasElement>): GridPoint | null => {
      const point = canvasPointToGrid(
        localPoint(event),
        viewportRef.current,
        documentRef.current.grid,
      );
      setHover((current) =>
        current?.column === point?.column && current?.row === point?.row ? current : point,
      );
      onCursorChange(point);
      return point;
    };

    const beginPointerGesture = (event: PointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture?.(event.pointerId);

      if (event.button === 1 || displayMode === "preview" || activeTool === "pan" || spacePan) {
        gestureRef.current = {
          kind: "pan",
          pointerId: event.pointerId,
          startClient: { x: event.clientX, y: event.clientY },
          startViewport: viewportRef.current,
        };
        setIsPanning(true);
        return;
      }

      const point = updateHover(event);
      if (!point) return;
      const currentDocument = documentRef.current;

      if (activeTool === "selection") {
        if (selection && selectionContains(selection, point)) {
          gestureRef.current = {
            kind: "selection-move",
            pointerId: event.pointerId,
            start: point,
            original: selection,
            current: selection,
          };
        } else {
          const nextSelection = normalizeSelection(point, point);
          onSelectionChange(nextSelection);
          gestureRef.current = {
            kind: "selection",
            pointerId: event.pointerId,
            start: point,
          };
        }
        return;
      }

      if (activeTool === "eyedropper") {
        const value = getCell(currentDocument.grid, point.row, point.column);
        if (
          value !== EMPTY_CELL &&
          value < currentDocument.palette.colors.length &&
          addedColorIndices.includes(value)
        ) {
          setSelectedColorIndex(value);
          setActiveTool("brush");
        }
        return;
      }

      if (activeTool === "fill") {
        if (selectedPaintIndex === null) return;
        const points = floodFillCells(currentDocument.grid, point, selectedPaintIndex);
        commitPoints(points, selectedPaintIndex, "Fill region");
        return;
      }

      if (activeTool === "brush" || activeTool === "eraser") {
        if (activeTool === "brush" && selectedPaintIndex === null) return;
        const points = new Map<string, GridPoint>();
        for (const stampedPoint of symmetricPoints(
          clipPoints(rasterizeLine(point, point, strokeWidth), currentDocument),
          currentDocument,
          symmetry,
        )) {
          points.set(pointKey(stampedPoint), stampedPoint);
        }
        const erasing = activeTool === "eraser";
        gestureRef.current = {
          kind: "stroke",
          pointerId: event.pointerId,
          last: point,
          points,
          erasing,
        };
        setPreviewErasing(erasing);
        setPreview([...points.values()]);
        return;
      }

      if (activeTool === "line" || activeTool === "rectangle" || activeTool === "ellipse") {
        if (selectedPaintIndex === null) return;
        const points = symmetricPoints(
          clipPoints(
            shapePoints(activeTool, point, point, strokeWidth, shapeFilled),
            currentDocument,
          ),
          currentDocument,
          symmetry,
        );
        gestureRef.current = {
          kind: "shape",
          pointerId: event.pointerId,
          tool: activeTool,
          start: point,
          points,
        };
        setPreviewErasing(false);
        setPreview(points);
      }
    };

    const movePointerGesture = (event: PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      if (gesture?.pointerId === event.pointerId && gesture.kind === "pan") {
        setViewportAndRef({
          ...gesture.startViewport,
          offsetX: gesture.startViewport.offsetX + event.clientX - gesture.startClient.x,
          offsetY: gesture.startViewport.offsetY + event.clientY - gesture.startClient.y,
        });
        return;
      }

      const point = updateHover(event);
      if (!gesture || gesture.pointerId !== event.pointerId || !point) return;

      if (gesture.kind === "selection") {
        onSelectionChange(normalizeSelection(gesture.start, point));
        return;
      }

      if (gesture.kind === "selection-move") {
        gesture.current = translateSelection(
          gesture.original,
          point.column - gesture.start.column,
          point.row - gesture.start.row,
          documentRef.current.grid,
        );
        onSelectionChange(gesture.current);
        return;
      }

      if (gesture.kind === "stroke") {
        if (point.column === gesture.last.column && point.row === gesture.last.row) return;
        for (const stampedPoint of symmetricPoints(
          clipPoints(rasterizeLine(gesture.last, point, strokeWidth), documentRef.current),
          documentRef.current,
          symmetry,
        )) {
          gesture.points.set(pointKey(stampedPoint), stampedPoint);
        }
        gesture.last = point;
        setPreview([...gesture.points.values()]);
        return;
      }

      if (gesture.kind === "shape") {
        gesture.points = symmetricPoints(
          clipPoints(
            shapePoints(gesture.tool, gesture.start, point, strokeWidth, shapeFilled),
            documentRef.current,
          ),
          documentRef.current,
          symmetry,
        );
        setPreview(gesture.points);
      }
    };

    const finishPointerGesture = (event: PointerEvent<HTMLCanvasElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      setIsPanning(false);

      if (gesture.kind === "stroke") {
        const value = gesture.erasing ? EMPTY_CELL : selectedPaintIndex;
        if (value === null) {
          setPreview([]);
          setPreviewErasing(false);
          return;
        }
        commitPoints(
          [...gesture.points.values()],
          value,
          gesture.erasing ? "Erase stroke" : "Brush stroke",
        );
      } else if (gesture.kind === "shape") {
        if (selectedPaintIndex !== null) {
          commitPoints(gesture.points, selectedPaintIndex, `Draw ${gesture.tool}`);
        }
      } else if (gesture.kind === "selection-move") {
        onMoveSelection(
          gesture.original,
          gesture.current.left - gesture.original.left,
          gesture.current.top - gesture.original.top,
        );
      }

      setPreview([]);
      setPreviewErasing(false);
    };

    const cancelGesture = () => {
      const gesture = gestureRef.current;
      if (gesture?.kind === "selection-move") onSelectionChange(gesture.original);
      gestureRef.current = null;
      setIsPanning(false);
      setPreview([]);
      setPreviewErasing(false);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (displayMode === "draw" && modifier && key === "c" && selection) {
        event.preventDefault();
        onCopySelection();
        return;
      }
      if (displayMode === "draw" && modifier && key === "v") {
        event.preventDefault();
        onPasteSelection();
        return;
      }
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) onRedo();
        else onUndo();
        return;
      }
      if (modifier && key === "y") {
        event.preventDefault();
        onRedo();
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        setSpacePan(true);
        return;
      }
      if (event.key === "Escape") {
        if (gestureRef.current) cancelGesture();
        else onClearSelection();
        return;
      }
      if (displayMode === "draw" && event.key === "Delete" && selection) {
        event.preventDefault();
        onDeleteSelection();
        return;
      }
      if (displayMode === "draw" && event.key === "Delete" && hover) {
        event.preventDefault();
        commitPoints([hover], EMPTY_CELL, "Erase cell");
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        fit();
        return;
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(1.2);
        return;
      }
      if (event.key === "-") {
        event.preventDefault();
        zoomBy(1 / 1.2);
        return;
      }
      const arrowDelta: Readonly<Record<string, readonly [number, number]>> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const delta = arrowDelta[event.key];
      if (displayMode === "draw" && selection && delta) {
        event.preventDefault();
        onMoveSelection(selection, delta[0], delta[1]);
        return;
      }

      const shortcuts: Partial<Record<string, EditorTool>> = {
        b: "brush",
        e: "eraser",
        i: "eyedropper",
        f: "fill",
        l: "line",
        r: "rectangle",
        o: "ellipse",
        h: "pan",
        s: "selection",
      };
      const tool = shortcuts[key];
      if (displayMode === "draw" && tool && !modifier && !event.altKey) {
        event.preventDefault();
        setActiveTool(tool);
      }
    };

    const cursorMode = isPanning
      ? "grabbing"
      : displayMode === "preview" || activeTool === "pan" || spacePan
        ? "grab"
        : activeTool === "selection" && selection && hover && selectionContains(selection, hover)
          ? "move"
          : activeTool === "fill" || activeTool === "eyedropper"
            ? "cell"
            : "crosshair";

    return (
      <div className="pattern-canvas" ref={containerRef}>
        <canvas aria-hidden="true" className="pattern-canvas__layer" ref={gridCanvasRef} />
        <canvas aria-hidden="true" className="pattern-canvas__layer" ref={beadCanvasRef} />
        <canvas aria-hidden="true" className="pattern-canvas__layer" ref={guideCanvasRef} />
        <canvas
          aria-describedby="canvas-help"
          aria-label={t("editor.canvasLabel", {
            columns: document.grid.columns,
            rows: document.grid.rows,
          })}
          className="pattern-canvas__layer pattern-canvas__interaction"
          data-cursor={cursorMode}
          data-mode={displayMode}
          onBlur={() => setSpacePan(false)}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => {
            if (event.key === " ") setSpacePan(false);
          }}
          onPointerCancel={cancelGesture}
          onPointerDown={beginPointerGesture}
          onPointerLeave={() => {
            if (!gestureRef.current) {
              setHover(null);
              onCursorChange(null);
            }
          }}
          onPointerMove={movePointerGesture}
          onPointerUp={finishPointerGesture}
          onWheel={(event) => {
            event.preventDefault();
            const factor = Math.exp(-event.deltaY * 0.0015);
            setViewportAndRef(
              zoomViewportAtPoint(
                viewportRef.current,
                viewportRef.current.cellSize * factor,
                localWheelPoint(event),
              ),
            );
          }}
          ref={interactionCanvasRef}
          tabIndex={0}
        >
          {t("editor.canvasFallback")}
        </canvas>
        <p className="visually-hidden" id="canvas-help">
          {t("editor.canvasHelp")}
        </p>
      </div>
    );
  },
);
