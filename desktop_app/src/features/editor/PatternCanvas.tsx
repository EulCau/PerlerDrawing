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
  renderInteractionCanvas,
  renderPatternCanvas,
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
import type { PatternDocument } from "../../editor/model/pattern-document";
import { floodFillCells } from "../../editor/tools/flood-fill";
import {
  rasterizeEllipse,
  rasterizeLine,
  rasterizeRectangle,
  type GridPoint,
} from "../../editor/tools/geometry";

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
    { document, revision, onExecute, onUndo, onRedo, onCursorChange, onZoomChange },
    forwardedRef,
  ) {
    const { t } = useTranslation();
    const activeTool = useEditorStore((state) => state.activeTool);
    const selectedColorIndex = useEditorStore((state) => state.selectedColorIndex);
    const strokeWidth = useEditorStore((state) => state.strokeWidth);
    const shapeFilled = useEditorStore((state) => state.shapeFilled);
    const setActiveTool = useEditorStore((state) => state.setActiveTool);
    const setSelectedColorIndex = useEditorStore((state) => state.setSelectedColorIndex);
    const themeMode = useSettingsStore((state) => state.theme);
    const containerRef = useRef<HTMLDivElement>(null);
    const baseCanvasRef = useRef<HTMLCanvasElement>(null);
    const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
    const gestureRef = useRef<Gesture | null>(null);
    const documentRef = useRef(document);
    const viewportRef = useRef<CanvasViewport>({ offsetX: 0, offsetY: 0, cellSize: 16 });
    const sizeRef = useRef<CanvasSize>({ width: 0, height: 0 });
    const lastFitKeyRef = useRef("");
    const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
    const [viewport, setViewport] = useState<CanvasViewport>(viewportRef.current);
    const [hover, setHover] = useState<GridPoint | null>(null);
    const [preview, setPreview] = useState<GridPoint[]>([]);
    const [previewErasing, setPreviewErasing] = useState(false);
    const [spacePan, setSpacePan] = useState(false);
    const [isPanning, setIsPanning] = useState(false);

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
      const canvas = baseCanvasRef.current;
      if (!canvas || size.width <= 0 || size.height <= 0) return;
      renderPatternCanvas(canvas, document, viewport, size, readTheme());
    }, [document, revision, size, themeMode, viewport]);

    useEffect(() => {
      const canvas = interactionCanvasRef.current;
      const color = document.palette.colors[selectedColorIndex]?.hex ?? "#000000";
      if (!canvas || size.width <= 0 || size.height <= 0) return;
      renderInteractionCanvas(
        canvas,
        preview,
        hover,
        viewport,
        size,
        color,
        previewErasing,
        readTheme(),
      );
    }, [
      document.palette.colors,
      hover,
      preview,
      previewErasing,
      selectedColorIndex,
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
        const command = createGridPatchCommand(
          currentDocument,
          label,
          clipped.map((point) => ({ ...point, value })),
        );
        onExecute(command);
      },
      [onExecute],
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

      if (event.button === 1 || activeTool === "pan" || spacePan) {
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

      if (activeTool === "eyedropper") {
        const value = getCell(currentDocument.grid, point.row, point.column);
        if (value !== EMPTY_CELL && value < currentDocument.palette.colors.length) {
          setSelectedColorIndex(value);
          setActiveTool("brush");
        }
        return;
      }

      if (activeTool === "fill") {
        const points = floodFillCells(currentDocument.grid, point, selectedColorIndex);
        commitPoints(points, selectedColorIndex, "Fill region");
        return;
      }

      if (activeTool === "brush" || activeTool === "eraser") {
        const points = new Map<string, GridPoint>();
        for (const stampedPoint of clipPoints(
          rasterizeLine(point, point, strokeWidth),
          currentDocument,
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
        const points = clipPoints(
          shapePoints(activeTool, point, point, strokeWidth, shapeFilled),
          currentDocument,
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

      if (gesture.kind === "stroke") {
        if (point.column === gesture.last.column && point.row === gesture.last.row) return;
        for (const stampedPoint of clipPoints(
          rasterizeLine(gesture.last, point, strokeWidth),
          documentRef.current,
        )) {
          gesture.points.set(pointKey(stampedPoint), stampedPoint);
        }
        gesture.last = point;
        setPreview([...gesture.points.values()]);
        return;
      }

      if (gesture.kind === "shape") {
        gesture.points = clipPoints(
          shapePoints(gesture.tool, gesture.start, point, strokeWidth, shapeFilled),
          documentRef.current,
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
        commitPoints(
          [...gesture.points.values()],
          gesture.erasing ? EMPTY_CELL : selectedColorIndex,
          gesture.erasing ? "Erase stroke" : "Brush stroke",
        );
      } else if (gesture.kind === "shape") {
        commitPoints(gesture.points, selectedColorIndex, `Draw ${gesture.tool}`);
      }

      setPreview([]);
      setPreviewErasing(false);
    };

    const cancelGesture = () => {
      gestureRef.current = null;
      setIsPanning(false);
      setPreview([]);
      setPreviewErasing(false);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
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
        cancelGesture();
        return;
      }
      if (event.key === "Delete" && hover) {
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

      const shortcuts: Partial<Record<string, EditorTool>> = {
        b: "brush",
        e: "eraser",
        i: "eyedropper",
        f: "fill",
        l: "line",
        r: "rectangle",
        o: "ellipse",
        h: "pan",
      };
      const tool = shortcuts[key];
      if (tool && !modifier && !event.altKey) {
        event.preventDefault();
        setActiveTool(tool);
      }
    };

    const cursorMode = isPanning
      ? "grabbing"
      : activeTool === "pan" || spacePan
        ? "grab"
        : activeTool === "fill" || activeTool === "eyedropper"
          ? "cell"
          : "crosshair";

    return (
      <div className="pattern-canvas" ref={containerRef}>
        <canvas aria-hidden="true" className="pattern-canvas__layer" ref={baseCanvasRef} />
        <canvas
          aria-describedby="canvas-help"
          aria-label={t("editor.canvasLabel", {
            columns: document.grid.columns,
            rows: document.grid.rows,
          })}
          className="pattern-canvas__layer pattern-canvas__interaction"
          data-cursor={cursorMode}
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
