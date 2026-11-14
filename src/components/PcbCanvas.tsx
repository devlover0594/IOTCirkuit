import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Code2,
  Download,
  Eraser,
  FileJson,
  FlipHorizontal2,
  GitBranch,
  Maximize2,
  MousePointer,
  PenTool,
  Printer,
  RotateCw,
  Spline,
  Trash2,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CATALOG_MAP } from '../data/catalog';
import {
  BoardConfig,
  NetConnection,
  PcbToolMode,
  PinDef,
  PlacedComponent,
  PointMm,
  RoutedBoard,
  SolderMaskColor,
  TraceConflict,
  TraceSegment,
  ViewMode,
} from '../types/pcb';
import { getPinWorldPos, getRotatedDims } from '../utils/autoRouter';
import {
  downloadPngFromSvgString,
  downloadSvgElement,
  downloadSvgString,
  generateTonerTransferSvgString,
} from '../utils/gerberExport';

interface PcbCanvasProps {
  mode: Extract<ViewMode, 'pcb' | 'toner' | 'wiring'>;
  config: BoardConfig;
  routed: RoutedBoard;
  selectedUid: string | null;
  selectedTraceId: string | null;
  toolMode: PcbToolMode;
  drawLayer: 'F.Cu' | 'B.Cu';
  conflicts: TraceConflict[];
  fixNotice: string | null;
  onSelectComponent: (uid: string | null) => void;
  onSelectTrace: (traceId: string | null) => void;
  onChangeToolMode: (tool: PcbToolMode) => void;
  onChangeDrawLayer: (layer: 'F.Cu' | 'B.Cu') => void;
  onMoveComponent: (uid: string, xMm: number, yMm: number) => void;
  onRotateComponent: (uid: string) => void;
  onUpdateConfig: (patch: Partial<BoardConfig>) => void;
  onAddCustomTrace: (
    points: PointMm[],
    layer: 'F.Cu' | 'B.Cu',
    netName?: string,
    netType?: NetConnection['netType']
  ) => void;
  onUpdateTrace: (traceId: string, patch: Partial<TraceSegment>) => void;
  onDeleteTrace: (traceId: string) => void;
  onFixConflicts: () => void;
  onJumpToView: (view: ViewMode, subTab?: 'mermaid' | 'json') => void;
}

const MASK_PALETTE: Record<SolderMaskColor, { bg: string; border: string; grid: string }> = {
  green: { bg: '#0c4a2b', border: '#15803d', grid: 'rgba(255,255,255,0.06)' },
  black: { bg: '#131720', border: '#334155', grid: 'rgba(255,255,255,0.05)' },
  blue: { bg: '#102a5c', border: '#2563eb', grid: 'rgba(255,255,255,0.06)' },
  red: { bg: '#5f1119', border: '#dc2626', grid: 'rgba(255,255,255,0.06)' },
};

function getNetColor(netType: string, mode: 'pcb' | 'wiring', layer?: 'F.Cu' | 'B.Cu'): string {
  if (mode === 'pcb') {
    // Strictly distinguish copper layers: Orange = Top (F.Cu), Blue/Cyan = Bottom (B.Cu)
    if (layer === 'F.Cu') return '#f97316';
    return netType === 'gnd' ? '#38bdf8' : '#0ea5e9';
  }
  // Wiring diagram color standard
  switch (netType) {
    case 'power_5v':
      return '#ef4444';
    case 'power_3v3':
      return '#f59e0b';
    case 'gnd':
      return '#64748b';
    case 'i2c':
      return '#a855f7';
    case 'adc':
      return '#10b981';
    default:
      return '#06b6d4';
  }
}

function pinTypeToNetType(pinType: PinDef['type']): NetConnection['netType'] {
  switch (pinType) {
    case 'power_5v':
      return 'power_5v';
    case 'power_3v3':
      return 'power_3v3';
    case 'gnd':
      return 'gnd';
    case 'i2c_sda':
    case 'i2c_scl':
      return 'i2c';
    case 'adc':
      return 'adc';
    default:
      return 'signal';
  }
}

export const PcbCanvas: React.FC<PcbCanvasProps> = ({
  mode,
  config,
  routed,
  selectedUid,
  selectedTraceId,
  toolMode,
  drawLayer,
  conflicts,
  fixNotice,
  onSelectComponent,
  onSelectTrace,
  onChangeToolMode,
  onChangeDrawLayer,
  onMoveComponent,
  onRotateComponent,
  onUpdateConfig,
  onAddCustomTrace,
  onUpdateTrace,
  onDeleteTrace,
  onFixConflicts,
  onJumpToView,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cursorMm, setCursorMm] = useState<PointMm>({ x: 0, y: 0 });
  const [hoveredNet, setHoveredNet] = useState<string | null>(null);
  const [hoveredTraceId, setHoveredTraceId] = useState<string | null>(null);

  // Interactive polyline drawing state
  const [drawingPoints, setDrawingPoints] = useState<PointMm[]>([]);
  const [drawingNet, setDrawingNet] = useState<{
    netName?: string;
    netType?: NetConnection['netType'];
  } | null>(null);
  const [snapPreview, setSnapPreview] = useState<{
    pt: PointMm;
    isPin: boolean;
    label?: string;
  } | null>(null);

  const [dragState, setDragState] = useState<{
    type: 'comp' | 'pan' | 'resize-r' | 'resize-b' | 'resize-br' | 'trace-vertex';
    uid?: string;
    traceId?: string;
    vertexIdx?: number;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const isToner = mode === 'toner';
  const isWiring = mode === 'wiring';
  const isDualBothToner =
    isToner && config.copperMode === '2-layer' && config.printLayerMode === 'both';
  const stackTonerVertically = isDualBothToner && config.widthMm > 95;
  const tonerGap = 12;

  const padMargin = isToner ? 8 : 10;
  const viewW =
    isDualBothToner && !stackTonerVertically
      ? config.widthMm * 2 + tonerGap + padMargin * 2
      : config.widthMm + padMargin * 2;
  const viewH =
    isDualBothToner && stackTonerVertically
      ? config.heightMm * 2 + tonerGap + padMargin * 2
      : config.heightMm + padMargin * 2;
  // Constant physical scale so resizing the PCB never shrinks or enlarges parts inside it
  const pxPerMm = 5.4 * zoom;

  const findSnapTarget = (raw: PointMm, allowPinSnap = true) => {
    if (allowPinSnap) {
      let bestDist = 1.45;
      let bestPin: {
        pos: PointMm;
        label: string;
        netName: string;
        netType: NetConnection['netType'];
      } | null = null;

      for (const comp of routed.placed) {
        const def = CATALOG_MAP[comp.defId];
        if (!def) continue;
        for (const pin of def.pins) {
          const pos = getPinWorldPos(comp, pin);
          const d = Math.hypot(raw.x - pos.x, raw.y - pos.y);
          if (d < bestDist) {
            bestDist = d;
            const conn = routed.connections.find(
              (c) =>
                (c.fromUid === comp.uid && c.fromPinId === pin.id) ||
                (c.toUid === comp.uid && c.toPinId === pin.id)
            );
            bestPin = {
              pos: { x: Number(pos.x.toFixed(2)), y: Number(pos.y.toFixed(2)) },
              label: `${comp.designator}.${pin.label}`,
              netName: conn?.netName ?? `${comp.designator}_${pin.label.replace(/\s+/g, '')}`,
              netType: conn?.netType ?? pinTypeToNetType(pin.type),
            };
          }
        }
      }

      if (bestPin) {
        return {
          pt: bestPin.pos,
          isPin: true,
          label: bestPin.label,
          netName: bestPin.netName,
          netType: bestPin.netType,
        };
      }
    }

    const grid = 1.27;
    const gx = Math.max(1.2, Math.min(config.widthMm - 1.2, Math.round(raw.x / grid) * grid));
    const gy = Math.max(1.2, Math.min(config.heightMm - 1.2, Math.round(raw.y / grid) * grid));
    return {
      pt: { x: Number(gx.toFixed(2)), y: Number(gy.toFixed(2)) },
      isPin: false,
      label: undefined,
      netName: undefined,
      netType: undefined,
    };
  };

  const finishDrawing = (pts: PointMm[], endNet?: { netName?: string; netType?: NetConnection['netType'] }) => {
    if (pts.length >= 2) {
      const effectiveLayer: 'F.Cu' | 'B.Cu' =
        config.copperMode === '1-layer' ? 'B.Cu' : drawLayer;
      onAddCustomTrace(
        pts,
        effectiveLayer,
        drawingNet?.netName ?? endNet?.netName,
        drawingNet?.netType ?? endNet?.netType
      );
    }
    setDrawingPoints([]);
    setDrawingNet(null);
  };

  const cancelDrawing = () => {
    setDrawingPoints([]);
    setDrawingNet(null);
  };

  useEffect(() => {
    if (toolMode !== 'draw' || mode !== 'pcb') {
      setDrawingPoints([]);
      setDrawingNet(null);
      setSnapPreview(null);
    }
  }, [toolMode, mode]);

  useEffect(() => {
    if (mode !== 'pcb') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        if (drawingPoints.length > 0) {
          cancelDrawing();
        } else if (toolMode !== 'select') {
          onChangeToolMode('select');
        } else {
          onSelectTrace(null);
          onSelectComponent(null);
        }
      } else if (e.key === 'Enter' && toolMode === 'draw' && drawingPoints.length >= 2) {
        e.preventDefault();
        finishDrawing(drawingPoints);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTraceId) {
        e.preventDefault();
        onDeleteTrace(selectedTraceId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, toolMode, drawingPoints, selectedTraceId, drawLayer, config.copperMode]);

  const clientToMm = (clientX: number, clientY: number): PointMm => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = viewW / rect.width;
    const scaleY = viewH / rect.height;
    const x = (clientX - rect.left) * scaleX - padMargin;
    const y = (clientY - rect.top) * scaleY - padMargin;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  };

  const handlePointerDownSvg = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setDragState({
        type: 'pan',
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: pan.x,
        origY: pan.y,
      });
      return;
    }

    if (mode === 'pcb' && toolMode === 'draw' && e.button === 0) {
      const rawMm = clientToMm(e.clientX, e.clientY);
      const snapRes = findSnapTarget(rawMm, true);

      if (drawingPoints.length === 0) {
        setDrawingPoints([snapRes.pt]);
        if (snapRes.isPin) {
          setDrawingNet({ netName: snapRes.netName, netType: snapRes.netType });
        } else {
          setDrawingNet(null);
        }
        return;
      }

      const last = drawingPoints[drawingPoints.length - 1];
      const distFromLast = Math.hypot(snapRes.pt.x - last.x, snapRes.pt.y - last.y);

      if (e.detail >= 2 && drawingPoints.length >= 2) {
        finishDrawing(drawingPoints, snapRes.isPin ? { netName: snapRes.netName, netType: snapRes.netType } : undefined);
        return;
      }

      if (distFromLast < 0.25) return;

      const nextPts = [...drawingPoints, snapRes.pt];
      if (snapRes.isPin) {
        finishDrawing(nextPts, { netName: snapRes.netName, netType: snapRes.netType });
      } else {
        setDrawingPoints(nextPts);
      }
      return;
    }

    if (e.target === svgRef.current) {
      onSelectComponent(null);
      onSelectTrace(null);
    }
  };

  const handlePointerDownComponent = (
    e: React.PointerEvent<SVGGElement>,
    comp: PlacedComponent
  ) => {
    if (mode === 'pcb' && toolMode === 'draw') {
      // Let draw clicks bubble to SVG so user can click directly onto component pins
      return;
    }
    if (mode === 'pcb' && toolMode === 'delete') {
      return;
    }
    e.stopPropagation();
    onSelectComponent(comp.uid);
    if (mode !== 'pcb' || toolMode !== 'select') return;
    setDragState({
      type: 'comp',
      uid: comp.uid,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: comp.xMm,
      origY: comp.yMm,
    });
  };

  const handlePointerDownTrace = (
    e: React.PointerEvent<SVGPathElement>,
    tr: TraceSegment
  ) => {
    if (mode !== 'pcb' || toolMode === 'draw') return;
    e.stopPropagation();
    if (toolMode === 'delete') {
      onDeleteTrace(tr.id);
      return;
    }
    onSelectTrace(tr.id);
  };

  const handlePointerDownVertex = (
    e: React.PointerEvent<SVGCircleElement>,
    traceId: string,
    vertexIdx: number,
    pt: PointMm
  ) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDragState({
      type: 'trace-vertex',
      traceId,
      vertexIdx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: pt.x,
      origY: pt.y,
    });
  };

  const handlePointerDownMidpoint = (
    e: React.PointerEvent<SVGGElement>,
    tr: TraceSegment,
    afterIdx: number,
    midPt: PointMm
  ) => {
    e.stopPropagation();
    const nextPts = [
      ...tr.points.slice(0, afterIdx + 1),
      midPt,
      ...tr.points.slice(afterIdx + 1),
    ];
    onUpdateTrace(tr.id, { points: nextPts });
    setDragState({
      type: 'trace-vertex',
      traceId: tr.id,
      vertexIdx: afterIdx + 1,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: midPt.x,
      origY: midPt.y,
    });
  };

  const handlePointerDownResize = (
    e: React.PointerEvent<SVGElement>,
    resizeType: 'resize-r' | 'resize-b' | 'resize-br'
  ) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDragState({
      type: resizeType,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: config.widthMm,
      origY: config.heightMm,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const mm = clientToMm(e.clientX, e.clientY);
    setCursorMm(mm);

    if (mode === 'pcb' && toolMode === 'draw') {
      const snapRes = findSnapTarget(mm, true);
      setSnapPreview({
        pt: snapRes.pt,
        isPin: snapRes.isPin,
        label: snapRes.label,
      });
    } else if (snapPreview) {
      setSnapPreview(null);
    }

    if (!dragState) return;

    if (dragState.type === 'pan') {
      setPan({
        x: dragState.origX + (e.clientX - dragState.startClientX),
        y: dragState.origY + (e.clientY - dragState.startClientY),
      });
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const currentPxPerMm = rect.width / viewW;
    const dxMm = (e.clientX - dragState.startClientX) / currentPxPerMm;
    const dyMm = (e.clientY - dragState.startClientY) / currentPxPerMm;

    if (
      dragState.type === 'resize-r' ||
      dragState.type === 'resize-b' ||
      dragState.type === 'resize-br'
    ) {
      const nextPatch: Partial<BoardConfig> = {};
      if (dragState.type === 'resize-r' || dragState.type === 'resize-br') {
        nextPatch.widthMm = Math.max(40, Math.min(240, Math.round(dragState.origX + dxMm)));
      }
      if (dragState.type === 'resize-b' || dragState.type === 'resize-br') {
        nextPatch.heightMm = Math.max(40, Math.min(240, Math.round(dragState.origY + dyMm)));
      }
      onUpdateConfig(nextPatch);
      return;
    }

    if (
      dragState.type === 'trace-vertex' &&
      dragState.traceId !== undefined &&
      dragState.vertexIdx !== undefined
    ) {
      const tr = routed.traces.find((t) => t.id === dragState.traceId);
      if (!tr) return;
      const isEndpoint =
        dragState.vertexIdx === 0 || dragState.vertexIdx === tr.points.length - 1;
      const snapRes = findSnapTarget(mm, isEndpoint);
      const nextPts = tr.points.map((p, idx) =>
        idx === dragState.vertexIdx ? snapRes.pt : p
      );
      onUpdateTrace(tr.id, { points: nextPts });
      return;
    }

    if (dragState.type === 'comp' && dragState.uid) {
      const comp = routed.placed.find((c) => c.uid === dragState.uid);
      const def = comp ? CATALOG_MAP[comp.defId] : undefined;
      const dims = comp && def ? getRotatedDims(def, comp.rotation) : { widthMm: 10, heightMm: 10 };

      const gridSnap = 1.27;
      const nx = Math.round((dragState.origX + dxMm) / gridSnap) * gridSnap;
      const ny = Math.round((dragState.origY + dyMm) / gridSnap) * gridSnap;

      const clampedX = Math.max(2, Math.min(config.widthMm - dims.widthMm - 2, nx));
      const clampedY = Math.max(2, Math.min(config.heightMm - dims.heightMm - 2, ny));
      onMoveComponent(dragState.uid, clampedX, clampedY);
    }
  };

  const handlePointerUp = () => {
    setDragState(null);
  };

  const mountingHoles = useMemo(() => {
    if (!config.mountingHoles) return [];
    const inset = 3.5;
    return [
      { x: inset, y: inset },
      { x: config.widthMm - inset, y: inset },
      { x: inset, y: config.heightMm - inset },
      { x: config.widthMm - inset, y: config.heightMm - inset },
    ];
  }, [config.mountingHoles, config.widthMm, config.heightMm]);

  const maskStyle = MASK_PALETTE[config.solderMask];

  const handleDownloadTonerSvg = () => {
    const svgStr = generateTonerTransferSvgString(routed, config);
    const safeName = config.projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'pcb';
    const layerTag =
      config.copperMode === '1-layer'
        ? '1layer_bottom'
        : config.printLayerMode === 'both'
        ? '2layer_top_and_bottom'
        : `2layer_${config.printLayerMode}`;
    downloadSvgString(svgStr, `${safeName}_toner_${layerTag}_1to1.svg`);
  };

  const handleDownloadTonerPng = () => {
    const svgStr = generateTonerTransferSvgString(routed, config);
    const safeName = config.projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'pcb';
    const layerTag =
      config.copperMode === '1-layer'
        ? '1layer_bottom'
        : config.printLayerMode === 'both'
        ? '2layer_top_and_bottom'
        : `2layer_${config.printLayerMode}`;
    downloadPngFromSvgString(svgStr, `${safeName}_toner_${layerTag}_600dpi.png`, 16);
  };

  const handleDownloadWiringSvg = () => {
    const safeName = config.projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'pcb';
    downloadSvgElement(svgRef.current, `${safeName}_layout_jalur_kabel.svg`);
  };

  const handleDownloadWiringPng = () => {
    if (!svgRef.current) return;
    const serializer = new XMLSerializer();
    const raw = serializer.serializeToString(svgRef.current);
    const safeName = config.projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'pcb';
    downloadPngFromSvgString(raw, `${safeName}_layout_jalur_kabel.png`, 14);
  };

  return (
    <div className="relative flex flex-col h-full w-full overflow-hidden bg-[#080B10]">
      {/* Viewport Action Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800/80 bg-[#0D1119]">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="font-mono-tabular text-slate-200 font-medium">
            {config.widthMm} × {config.heightMm} mm
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {config.copperMode === '1-layer' ? '1-Layer DIY (B.Cu)' : '2-Layer Fab (F.Cu + B.Cu)'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono-tabular">
            {routed.placed.length} Komponen · {routed.traces.length} Jalur
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(mode === 'pcb' || mode === 'toner') && (
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-0.5">
              <button
                onClick={() =>
                  onUpdateConfig({
                    copperMode: '1-layer',
                    visibleLayer: 'all',
                    printLayerMode: 'bottom',
                  })
                }
                className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                  config.copperMode === '1-layer'
                    ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Single Layer
              </button>
              <button
                onClick={() =>
                  onUpdateConfig({
                    copperMode: '2-layer',
                    visibleLayer: 'all',
                    printLayerMode: 'both',
                  })
                }
                className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                  config.copperMode === '2-layer'
                    ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Dual Layer
              </button>
            </div>
          )}

          {mode === 'pcb' && (
            <>
              {/* Trace Tool Selector */}
              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-0.5">
                <button
                  onClick={() => onChangeToolMode('select')}
                  title="Pilih & geser komponen atau jalur"
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                    toolMode === 'select'
                      ? 'bg-slate-800 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  Pilih
                </button>
                <button
                  onClick={() => onChangeToolMode('draw')}
                  title="Draw Lines: gambar jalur PCB secara manual"
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                    toolMode === 'draw'
                      ? 'bg-cyan-500/20 text-cyan-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5" />
                  Draw Lines
                </button>
                <button
                  onClick={() => onChangeToolMode('edit')}
                  title="Edit Jalur: geser titik atau tambah belokan jalur"
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                    toolMode === 'edit'
                      ? 'bg-amber-500/20 text-amber-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Spline className="w-3.5 h-3.5" />
                  Edit Jalur
                </button>
                <button
                  onClick={() => onChangeToolMode('delete')}
                  title="Hapus Jalur: klik jalur PCB untuk menghapus"
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                    toolMode === 'delete'
                      ? 'bg-rose-500/20 text-rose-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Hapus Jalur
                </button>
              </div>

              {/* Draw Layer Picker (2-layer mode when Draw Lines active) */}
              {toolMode === 'draw' && config.copperMode === '2-layer' && (
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-0.5">
                  <button
                    onClick={() => onChangeDrawLayer('F.Cu')}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      drawLayer === 'F.Cu'
                        ? 'bg-orange-500/20 text-orange-300 font-medium'
                        : 'text-slate-400 hover:text-orange-300'
                    }`}
                  >
                    Gambar: Top
                  </button>
                  <button
                    onClick={() => onChangeDrawLayer('B.Cu')}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      drawLayer === 'B.Cu'
                        ? 'bg-sky-500/20 text-sky-300 font-medium'
                        : 'text-slate-400 hover:text-sky-300'
                    }`}
                  >
                    Gambar: Bottom
                  </button>
                </div>
              )}

              {/* Active Polyline Confirm / Cancel Buttons */}
              {toolMode === 'draw' && drawingPoints.length > 0 && (
                <div className="flex items-center gap-1">
                  {drawingPoints.length >= 2 && (
                    <button
                      onClick={() => finishDrawing(drawingPoints)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 whitespace-nowrap shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Selesai
                    </button>
                  )}
                  <button
                    onClick={cancelDrawing}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white whitespace-nowrap shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                    Batal
                  </button>
                </div>
              )}

              {/* Conflict Indicator & Auto-Fix Button */}
              <div className="flex items-center gap-2">
                {conflicts.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-mono-tabular whitespace-nowrap shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    0 Persinggungan
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-rose-400 font-medium font-mono-tabular whitespace-nowrap shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {conflicts.length} Persinggungan
                  </span>
                )}
                <button
                  onClick={onFixConflicts}
                  disabled={routed.traces.length === 0}
                  title="Perbaiki jalur PCB yang bersinggungan secara otomatis"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
                    conflicts.length > 0
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 hover:bg-amber-500/30'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Perbaiki Otomatis
                </button>
              </div>

              {config.copperMode === '2-layer' && (
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-0.5">
                  <button
                    onClick={() => onUpdateConfig({ visibleLayer: 'all' })}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      config.visibleLayer === 'all'
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Semua Layer
                  </button>
                  <button
                    onClick={() => onUpdateConfig({ visibleLayer: 'F.Cu' })}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      config.visibleLayer === 'F.Cu'
                        ? 'bg-orange-500/20 text-orange-300 font-medium'
                        : 'text-slate-400 hover:text-orange-300'
                    }`}
                  >
                    Top (F.Cu)
                  </button>
                  <button
                    onClick={() => onUpdateConfig({ visibleLayer: 'B.Cu' })}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      config.visibleLayer === 'B.Cu'
                        ? 'bg-sky-500/20 text-sky-300 font-medium'
                        : 'text-slate-400 hover:text-sky-300'
                    }`}
                  >
                    Bottom (B.Cu)
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-0.5">
                {(['green', 'black', 'blue', 'red'] as SolderMaskColor[]).map((col) => (
                  <button
                    key={col}
                    onClick={() => onUpdateConfig({ solderMask: col })}
                    title={`Solder mask ${col}`}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 capitalize ${
                      config.solderMask === col
                        ? 'bg-slate-800 text-white font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {col === 'green'
                      ? 'Hijau'
                      : col === 'black'
                      ? 'Hitam'
                      : col === 'blue'
                      ? 'Biru'
                      : 'Merah'}
                  </button>
                ))}
              </div>

              <button
                onClick={() => onUpdateConfig({ showSilkscreen: !config.showSilkscreen })}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  config.showSilkscreen
                    ? 'bg-slate-800 border-slate-700 text-slate-100'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Silkscreen
              </button>

              {selectedUid && (
                <button
                  onClick={() => onRotateComponent(selectedUid)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Putar 90°
                </button>
              )}

              {selectedTraceId && (
                <button
                  onClick={() => onDeleteTrace(selectedTraceId)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-rose-500/15 border border-rose-500/40 text-rose-300 hover:bg-rose-500/25 transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus Jalur
                </button>
              )}
            </>
          )}

          {mode === 'toner' && (
            <>
              {config.copperMode === '2-layer' && (
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-0.5">
                  <button
                    onClick={() => onUpdateConfig({ printLayerMode: 'top' })}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      config.printLayerMode === 'top'
                        ? 'bg-slate-800 text-orange-300 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Cetak Top (F.Cu)
                  </button>
                  <button
                    onClick={() => onUpdateConfig({ printLayerMode: 'bottom' })}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      config.printLayerMode === 'bottom'
                        ? 'bg-slate-800 text-sky-300 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Cetak Bottom (B.Cu)
                  </button>
                  <button
                    onClick={() => onUpdateConfig({ printLayerMode: 'both' })}
                    className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap shrink-0 ${
                      config.printLayerMode === 'both'
                        ? 'bg-slate-800 text-cyan-300 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Cetak Bersamaan (2 Layer)
                  </button>
                </div>
              )}

              <button
                onClick={() => onUpdateConfig({ mirrorToner: !config.mirrorToner })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  config.mirrorToner
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
                {config.mirrorToner ? 'Mirror Aktif' : 'Normal'}
              </button>
              <button
                onClick={() => onUpdateConfig({ showDrillGuides: !config.showDrillGuides })}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  config.showDrillGuides
                    ? 'bg-slate-800 border-slate-700 text-slate-100'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Titik Bor
              </button>
              <button
                onClick={handleDownloadTonerSvg}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                SVG 1:1
              </button>
              <button
                onClick={handleDownloadTonerPng}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                PNG 600DPI
              </button>
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak 1:1
              </button>
            </>
          )}

          {mode === 'wiring' && (
            <>
              <button
                onClick={handleDownloadWiringSvg}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh Layout SVG
              </button>
              <button
                onClick={handleDownloadWiringPng}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh PNG
              </button>
            </>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-md p-0.5 ml-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Perkecil"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-xs font-mono-tabular text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(2.8, Number((z + 0.15).toFixed(2))))}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Perbesar"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1 text-slate-400 hover:text-white rounded"
              title="Reset Tampilan"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main CAD / Paper Viewport */}
      <div
        className={`relative flex-1 overflow-auto flex items-center justify-center ${
          isToner ? 'bg-slate-200 print-only-sheet' : isWiring ? 'bg-[#0C121E]' : 'bg-[#080B10]'
        }`}
      >
        <div
          className="flex items-center justify-center p-6 min-w-full min-h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transition: dragState ? 'none' : 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`${-padMargin} ${-padMargin} ${viewW} ${viewH}`}
            className={`select-none shrink-0 ${
              mode === 'pcb'
                ? toolMode === 'draw'
                  ? 'cursor-crosshair'
                  : toolMode === 'delete'
                  ? 'cursor-not-allowed'
                  : 'cursor-default'
                : 'cursor-default'
            } ${isToner ? 'shadow-xl bg-white' : ''}`}
            style={{
              width: `${viewW * pxPerMm}px`,
              height: `${viewH * pxPerMm}px`,
            }}
            onPointerDown={handlePointerDownSvg}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              handlePointerUp();
              setSnapPreview(null);
            }}
            onContextMenu={(e) => {
              if (toolMode === 'draw' && drawingPoints.length > 0) {
                e.preventDefault();
                cancelDrawing();
              }
            }}
          >
            <defs>
              {/* 2.54mm standard pitch grid pattern */}
              <pattern
                id="pcb-grid-minor"
                width="2.54"
                height="2.54"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 2.54 0 L 0 0 0 2.54"
                  fill="none"
                  stroke={isWiring ? 'rgba(148,163,184,0.08)' : maskStyle.grid}
                  strokeWidth="0.08"
                />
              </pattern>
              <pattern
                id="pcb-grid-major"
                width="12.7"
                height="12.7"
                patternUnits="userSpaceOnUse"
              >
                <rect width="12.7" height="12.7" fill="url(#pcb-grid-minor)" />
                <path
                  d="M 12.7 0 L 0 0 0 12.7"
                  fill="none"
                  stroke={isWiring ? 'rgba(148,163,184,0.16)' : 'rgba(255,255,255,0.12)'}
                  strokeWidth="0.14"
                />
              </pattern>
            </defs>

            {/* Dedicated Layer-Separated Rendering for Toner Transfer Mode */}
            {isToner ? (
              <>
                <rect
                  x={-padMargin}
                  y={-padMargin}
                  width={viewW}
                  height={viewH}
                  fill="#ffffff"
                />
                {(() => {
                  const sheetsToRender: Array<{
                    layer: 'F.Cu' | 'B.Cu';
                    offsetX: number;
                    offsetY: number;
                  }> = [];

                  if (config.copperMode === '1-layer' || config.printLayerMode === 'bottom') {
                    sheetsToRender.push({ layer: 'B.Cu', offsetX: 0, offsetY: 0 });
                  } else if (config.printLayerMode === 'top') {
                    sheetsToRender.push({ layer: 'F.Cu', offsetX: 0, offsetY: 0 });
                  } else {
                    sheetsToRender.push({ layer: 'F.Cu', offsetX: 0, offsetY: 0 });
                    sheetsToRender.push({
                      layer: 'B.Cu',
                      offsetX: stackTonerVertically ? 0 : config.widthMm + tonerGap,
                      offsetY: stackTonerVertically ? config.heightMm + tonerGap : 0,
                    });
                  }

                  return sheetsToRender.map(({ layer, offsetX, offsetY }) => {
                    const shouldMirror =
                      config.copperMode === '2-layer' && config.printLayerMode === 'both'
                        ? layer === 'F.Cu'
                          ? config.mirrorToner
                          : !config.mirrorToner
                        : config.mirrorToner;
                    const tx = (x: number) => offsetX + (shouldMirror ? config.widthMm - x : x);
                    const ty = (y: number) => offsetY + y;
                    const layerTraces = routed.traces.filter((t) => t.layer === layer);

                    return (
                      <g key={`toner-sheet-${layer}`}>
                        {/* Board Outline */}
                        <rect
                          x={offsetX}
                          y={offsetY}
                          width={config.widthMm}
                          height={config.heightMm}
                          fill="#ffffff"
                          stroke="#000000"
                          strokeWidth="0.3"
                        />
                        {/* Corner Crop Marks */}
                        {[
                          [offsetX, offsetY, -1, -1],
                          [offsetX + config.widthMm, offsetY, 1, -1],
                          [offsetX, offsetY + config.heightMm, -1, 1],
                          [offsetX + config.widthMm, offsetY + config.heightMm, 1, 1],
                        ].map(([cx, cy, sx, sy], idx) => (
                          <g key={idx}>
                            <line
                              x1={cx}
                              y1={cy}
                              x2={cx + sx * 3.2}
                              y2={cy}
                              stroke="#000000"
                              strokeWidth="0.2"
                            />
                            <line
                              x1={cx}
                              y1={cy}
                              x2={cx}
                              y2={cy + sy * 3.2}
                              stroke="#000000"
                              strokeWidth="0.2"
                            />
                          </g>
                        ))}

                        {/* Mounting Holes */}
                        {mountingHoles.map((mh, i) => {
                          const mx = tx(mh.x);
                          const my = ty(mh.y);
                          return (
                            <g key={`tmh-${i}`}>
                              <circle cx={mx} cy={my} r={1.6} fill="none" stroke="#000000" strokeWidth="0.25" />
                              <line x1={mx - 2.2} y1={my} x2={mx + 2.2} y2={my} stroke="#000000" strokeWidth="0.18" />
                              <line x1={mx} y1={my - 2.2} x2={mx} y2={my + 2.2} stroke="#000000" strokeWidth="0.18" />
                            </g>
                          );
                        })}

                        {/* ONLY Traces Belonging to This Specific Copper Layer */}
                        {layerTraces.map((tr) => {
                          if (tr.points.length < 2) return null;
                          const d = tr.points
                            .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${tx(pt.x)} ${ty(pt.y)}`)
                            .join(' ');
                          return (
                            <path
                              key={tr.id}
                              d={d}
                              fill="none"
                              stroke="#000000"
                              strokeWidth={tr.widthMm}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          );
                        })}

                        {/* Shared THT Component Pads */}
                        {routed.placed.map((comp) => {
                          const def = CATALOG_MAP[comp.defId];
                          if (!def) return null;
                          return def.pins.map((pin) => {
                            const pos = getPinWorldPos(comp, pin);
                            const px = tx(pos.x);
                            const py = ty(pos.y);
                            return (
                              <g key={`tpad-${layer}-${comp.uid}-${pin.id}`}>
                                <circle cx={px} cy={py} r={pin.padMm / 2} fill="#000000" />
                                {config.showDrillGuides && pin.drillMm > 0 && (
                                  <circle
                                    cx={px}
                                    cy={py}
                                    r={Math.min(0.32, pin.drillMm * 0.35)}
                                    fill="#ffffff"
                                  />
                                )}
                              </g>
                            );
                          });
                        })}

                        {/* Shared Vias */}
                        {routed.vias.map((via) => {
                          const vx = tx(via.xMm);
                          const vy = ty(via.yMm);
                          return (
                            <g key={`tvia-${layer}-${via.id}`}>
                              <circle cx={vx} cy={vy} r={via.padMm / 2} fill="#000000" />
                              {config.showDrillGuides && (
                                <circle cx={vx} cy={vy} r={0.22} fill="#ffffff" />
                              )}
                            </g>
                          );
                        })}

                        {/* Sheet Header & 10mm Calibration Bar */}
                        <text
                          x={offsetX}
                          y={offsetY - 1.8}
                          fontSize="2.4"
                          fontWeight="700"
                          fontFamily="JetBrains Mono, monospace"
                          fill="#000000"
                        >
                          {layer === 'F.Cu' ? 'LAYER TOP (F.Cu)' : 'LAYER BOTTOM (B.Cu)'} ·{' '}
                          {layerTraces.length} Jalur · {shouldMirror ? 'MIRROR' : 'NORMAL'}
                        </text>
                        <text
                          x={offsetX}
                          y={offsetY + config.heightMm + 4.2}
                          fontSize="2.0"
                          fontFamily="JetBrains Mono, monospace"
                          fill="#000000"
                        >
                          {config.projectName} | {config.widthMm}×{config.heightMm}mm | SKALA 1:1
                        </text>
                        <line
                          x1={offsetX + config.widthMm - 12}
                          y1={offsetY + config.heightMm + 3.4}
                          x2={offsetX + config.widthMm - 2}
                          y2={offsetY + config.heightMm + 3.4}
                          stroke="#000000"
                          strokeWidth="0.35"
                        />
                        <line
                          x1={offsetX + config.widthMm - 12}
                          y1={offsetY + config.heightMm + 2.4}
                          x2={offsetX + config.widthMm - 12}
                          y2={offsetY + config.heightMm + 4.4}
                          stroke="#000000"
                          strokeWidth="0.25"
                        />
                        <line
                          x1={offsetX + config.widthMm - 2}
                          y1={offsetY + config.heightMm + 2.4}
                          x2={offsetX + config.widthMm - 2}
                          y2={offsetY + config.heightMm + 4.4}
                          stroke="#000000"
                          strokeWidth="0.25"
                        />
                        <text
                          x={offsetX + config.widthMm - 7}
                          y={offsetY + config.heightMm + 6.0}
                          textAnchor="middle"
                          fontSize="1.7"
                          fontFamily="JetBrains Mono, monospace"
                          fill="#000000"
                        >
                          10 mm Kalibrasi
                        </text>
                      </g>
                    );
                  });
                })()}
              </>
            ) : (
              <>
                <rect
                  x={0}
                  y={0}
                  width={config.widthMm}
                  height={config.heightMm}
                  rx="1.5"
                  fill={isWiring ? '#0F172A' : maskStyle.bg}
                  stroke={isWiring ? '#334155' : maskStyle.border}
                  strokeWidth="0.45"
                />
                <rect
                  x={0}
                  y={0}
                  width={config.widthMm}
                  height={config.heightMm}
                  rx="1.5"
                  fill="url(#pcb-grid-major)"
                />

                {/* Ruler Calibration Ticks along Top & Left edges */}
                <g opacity={0.6}>
                  {Array.from({ length: Math.floor(config.widthMm / 10) + 1 }).map((_, i) => {
                    const mm = i * 10;
                    return (
                      <g key={`rx-${mm}`}>
                        <line x1={mm} y1={-1.8} x2={mm} y2={0} stroke="#64748b" strokeWidth="0.2" />
                        <text
                          x={mm}
                          y={-2.4}
                          textAnchor="middle"
                          fontSize="2.1"
                          fontFamily="JetBrains Mono, monospace"
                          fill="#94a3b8"
                        >
                          {mm}
                        </text>
                      </g>
                    );
                  })}
                  {Array.from({ length: Math.floor(config.heightMm / 10) + 1 }).map((_, i) => {
                    const mm = i * 10;
                    return (
                      <g key={`ry-${mm}`}>
                        <line x1={-1.8} y1={mm} x2={0} y2={mm} stroke="#64748b" strokeWidth="0.2" />
                        <text
                          x={-2.4}
                          y={mm + 0.7}
                          textAnchor="end"
                          fontSize="2.1"
                          fontFamily="JetBrains Mono, monospace"
                          fill="#94a3b8"
                        >
                          {mm}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* Mounting Holes M3 */}
                {mountingHoles.map((mh, i) => (
                  <g key={`mh-${i}`}>
                    <circle cx={mh.x} cy={mh.y} r={2.6} fill="#d97706" opacity={0.85} />
                    <circle cx={mh.x} cy={mh.y} r={1.6} fill="#080B10" stroke="#94a3b8" strokeWidth="0.2" />
                  </g>
                ))}

                {/* Copper Traces / Wiring Paths (B.Cu drawn underneath F.Cu, respecting visibleLayer filter in PCB mode) */}
                <g>
                  {[...routed.traces]
                    .sort((a, b) => (a.layer === b.layer ? 0 : a.layer === 'B.Cu' ? -1 : 1))
                    .map((tr) => {
                      if (tr.points.length < 2) return null;
                      if (
                        mode === 'pcb' &&
                        config.copperMode === '2-layer' &&
                        config.visibleLayer !== 'all' &&
                        tr.layer !== config.visibleLayer
                      ) {
                        return null;
                      }
                      const d = tr.points
                        .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
                        .join(' ');
                      const isTraceSelected = mode === 'pcb' && selectedTraceId === tr.id;
                      const isTraceHovered = hoveredTraceId === tr.id;
                      const isHighlighted =
                        hoveredNet === tr.netName || isTraceSelected || isTraceHovered;
                      const isDeleteHover =
                        mode === 'pcb' && toolMode === 'delete' && isTraceHovered;
                      const color = isDeleteHover
                        ? '#fb7185'
                        : getNetColor(tr.netType, isWiring ? 'wiring' : 'pcb', tr.layer);

                      return (
                        <g key={tr.id}>
                          {/* Selection Halo */}
                          {isTraceSelected && (
                            <path
                              d={d}
                              fill="none"
                              stroke="#67e8f9"
                              strokeWidth={tr.widthMm + 0.9}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              opacity={0.45}
                              pointerEvents="none"
                            />
                          )}

                          {/* Visible Copper Trace */}
                          <path
                            d={d}
                            fill="none"
                            stroke={color}
                            strokeWidth={
                              isHighlighted
                                ? tr.widthMm * 1.65
                                : isWiring
                                ? Math.max(0.55, tr.widthMm)
                                : tr.widthMm
                            }
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            opacity={hoveredNet && !isHighlighted ? 0.28 : 0.94}
                            strokeDasharray={isWiring && tr.netType === 'gnd' ? '1.6 0.9' : undefined}
                            pointerEvents="none"
                          />

                          {/* Wide Interactive Hit-Target for Select / Edit / Delete */}
                          {mode === 'pcb' && toolMode !== 'draw' && (
                            <path
                              d={d}
                              fill="none"
                              stroke="transparent"
                              strokeWidth={Math.max(2.6, tr.widthMm * 3)}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={
                                toolMode === 'delete' ? 'cursor-pointer' : 'cursor-pointer'
                              }
                              onMouseEnter={() => {
                                setHoveredNet(tr.netName);
                                setHoveredTraceId(tr.id);
                              }}
                              onMouseLeave={() => {
                                setHoveredNet(null);
                                setHoveredTraceId(null);
                              }}
                              onPointerDown={(e) => handlePointerDownTrace(e, tr)}
                            />
                          )}
                        </g>
                      );
                    })}
                </g>

                {/* Vias (2-layer mode) */}
                {routed.vias.map((via) => (
                  <g key={via.id} pointerEvents="none">
                    <circle cx={via.xMm} cy={via.yMm} r={via.padMm / 2} fill="#e5b84b" />
                    <circle cx={via.xMm} cy={via.yMm} r={via.drillMm / 2} fill="#080B10" />
                  </g>
                ))}

                {/* Components: Silkscreen Outlines, Bodies, Pads, Drills, Pin Labels */}
                {routed.placed.map((comp) => {
                  const def = CATALOG_MAP[comp.defId];
                  if (!def) return null;
                  const dims = getRotatedDims(def, comp.rotation);
                  const isSelected = selectedUid === comp.uid;

                  return (
                    <g
                      key={comp.uid}
                      onPointerDown={(e) => handlePointerDownComponent(e, comp)}
                      className={
                        mode === 'pcb' && toolMode === 'select'
                          ? 'cursor-grab active:cursor-grabbing'
                          : ''
                      }
                    >
                      {(config.showSilkscreen || isWiring) && (
                        <g>
                          <rect
                            x={comp.xMm}
                            y={comp.yMm}
                            width={dims.widthMm}
                            height={dims.heightMm}
                            rx="0.9"
                            fill={
                              isWiring
                                ? 'rgba(30, 41, 59, 0.85)'
                                : isSelected
                                ? 'rgba(6, 182, 212, 0.14)'
                                : 'rgba(15, 23, 42, 0.35)'
                            }
                            stroke={isSelected ? '#22d3ee' : isWiring ? '#64748b' : '#e2e8f0'}
                            strokeWidth={isSelected ? 0.55 : 0.28}
                          />
                          <circle
                            cx={comp.xMm + 1.5}
                            cy={comp.yMm + 1.5}
                            r={0.5}
                            fill="#e2e8f0"
                          />
                          <text
                            x={comp.xMm + dims.widthMm / 2}
                            y={comp.yMm + dims.heightMm / 2 - 0.8}
                            textAnchor="middle"
                            fontSize="2.5"
                            fontWeight="700"
                            fontFamily="JetBrains Mono, monospace"
                            fill={isSelected ? '#67e8f9' : '#f8fafc'}
                          >
                            {comp.designator}
                          </text>
                          <text
                            x={comp.xMm + dims.widthMm / 2}
                            y={comp.yMm + dims.heightMm / 2 + 2.2}
                            textAnchor="middle"
                            fontSize="1.8"
                            fontFamily="IBM Plex Sans, sans-serif"
                            fill="#cbd5e1"
                          >
                            {comp.label}
                          </text>
                        </g>
                      )}

                      {def.pins.map((pin) => {
                        const pos = getPinWorldPos(comp, pin);
                        const conn = routed.connections.find(
                          (c) =>
                            (c.fromUid === comp.uid && c.fromPinId === pin.id) ||
                            (c.toUid === comp.uid && c.toPinId === pin.id)
                        );
                        const isNetActive = conn && hoveredNet === conn.netName;
                        const padColor =
                          pin.type === 'gnd'
                            ? '#94a3b8'
                            : pin.type === 'power_5v'
                            ? '#f87171'
                            : pin.type === 'power_3v3'
                            ? '#fbbf24'
                            : '#e5b84b';

                        return (
                          <g
                            key={`${comp.uid}-${pin.id}`}
                            onMouseEnter={() => conn && setHoveredNet(conn.netName)}
                            onMouseLeave={() => setHoveredNet(null)}
                          >
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={isNetActive ? (pin.padMm / 2) * 1.35 : pin.padMm / 2}
                              fill={isWiring ? padColor : '#e5b84b'}
                              stroke={isNetActive ? '#ffffff' : '#78350f'}
                              strokeWidth={isNetActive ? 0.28 : 0.12}
                            />
                            {pin.drillMm > 0 && (
                              <circle cx={pos.x} cy={pos.y} r={pin.drillMm / 2} fill="#090d14" />
                            )}
                            {(isWiring || isSelected || zoom >= 1.35) && (
                              <text
                                x={pos.x}
                                y={pos.y - pin.padMm / 2 - 0.55}
                                textAnchor="middle"
                                fontSize="1.35"
                                fontFamily="JetBrains Mono, monospace"
                                fill="#e2e8f0"
                              >
                                {pin.label}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* Trace Edit Handles (Vertices & Midpoint + Bend Inserters) */}
                {mode === 'pcb' &&
                  selectedTraceId &&
                  (() => {
                    const selTrace = routed.traces.find((t) => t.id === selectedTraceId);
                    if (!selTrace) return null;
                    return (
                      <g className="no-print">
                        {/* Midpoint + handles to add bends */}
                        {selTrace.points.slice(0, -1).map((pt, idx) => {
                          const next = selTrace.points[idx + 1];
                          const segLen = Math.hypot(next.x - pt.x, next.y - pt.y);
                          if (segLen < 3.0) return null;
                          const mx = Number(((pt.x + next.x) / 2).toFixed(2));
                          const my = Number(((pt.y + next.y) / 2).toFixed(2));
                          return (
                            <g
                              key={`mid-${idx}`}
                              className="cursor-pointer"
                              onPointerDown={(e) =>
                                handlePointerDownMidpoint(e, selTrace, idx, { x: mx, y: my })
                              }
                            >
                              <circle
                                cx={mx}
                                cy={my}
                                r={0.9}
                                fill="#0f172a"
                                stroke="#67e8f9"
                                strokeWidth={0.25}
                              />
                              <line x1={mx - 0.4} y1={my} x2={mx + 0.4} y2={my} stroke="#67e8f9" strokeWidth={0.24} />
                              <line x1={mx} y1={my - 0.4} x2={mx} y2={my + 0.4} stroke="#67e8f9" strokeWidth={0.24} />
                            </g>
                          );
                        })}

                        {/* Draggable Vertex Handles (double-click interior point to remove) */}
                        {selTrace.points.map((pt, idx) => {
                          const isEnd = idx === 0 || idx === selTrace.points.length - 1;
                          return (
                            <circle
                              key={`vtx-${idx}`}
                              cx={pt.x}
                              cy={pt.y}
                              r={isEnd ? 1.15 : 0.95}
                              fill={isEnd ? '#22d3ee' : '#fbbf24'}
                              stroke="#082f49"
                              strokeWidth={0.28}
                              className="cursor-move"
                              onPointerDown={(e) =>
                                handlePointerDownVertex(e, selTrace.id, idx, pt)
                              }
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (!isEnd && selTrace.points.length > 2) {
                                  onUpdateTrace(selTrace.id, {
                                    points: selTrace.points.filter((_, i) => i !== idx),
                                  });
                                }
                              }}
                            />
                          );
                        })}
                      </g>
                    );
                  })()}

                {/* Live Draw Lines Preview & Snap Ring */}
                {mode === 'pcb' && toolMode === 'draw' && (
                  <g className="no-print" pointerEvents="none">
                    {drawingPoints.length > 0 && (
                      <>
                        <path
                          d={drawingPoints
                            .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
                            .join(' ')}
                          fill="none"
                          stroke={
                            config.copperMode === '2-layer' && drawLayer === 'F.Cu'
                              ? '#f97316'
                              : '#38bdf8'
                          }
                          strokeWidth={config.traceWidthMm}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {snapPreview && (
                          <line
                            x1={drawingPoints[drawingPoints.length - 1].x}
                            y1={drawingPoints[drawingPoints.length - 1].y}
                            x2={snapPreview.pt.x}
                            y2={snapPreview.pt.y}
                            stroke={
                              config.copperMode === '2-layer' && drawLayer === 'F.Cu'
                                ? '#fb923c'
                                : '#67e8f9'
                            }
                            strokeWidth={config.traceWidthMm}
                            strokeDasharray="1.2 0.8"
                            strokeLinecap="round"
                          />
                        )}
                        {drawingPoints.map((pt, idx) => (
                          <circle
                            key={`dp-${idx}`}
                            cx={pt.x}
                            cy={pt.y}
                            r={0.65}
                            fill="#ffffff"
                            stroke="#0284c7"
                            strokeWidth={0.25}
                          />
                        ))}
                      </>
                    )}

                    {snapPreview && (
                      <g>
                        <circle
                          cx={snapPreview.pt.x}
                          cy={snapPreview.pt.y}
                          r={snapPreview.isPin ? 1.55 : 0.75}
                          fill="none"
                          stroke={snapPreview.isPin ? '#22d3ee' : '#94a3b8'}
                          strokeWidth={snapPreview.isPin ? 0.35 : 0.22}
                        />
                        {snapPreview.label && (
                          <text
                            x={snapPreview.pt.x + 2}
                            y={snapPreview.pt.y - 1.5}
                            fontSize="2.1"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="600"
                            fill="#67e8f9"
                          >
                            {snapPreview.label}
                          </text>
                        )}
                      </g>
                    )}
                  </g>
                )}

                {/* Live DRC Trace Crossing Conflict Markers */}
                {mode === 'pcb' &&
                  conflicts.map((conf) => (
                    <g key={conf.id} className="no-print" pointerEvents="none">
                      <circle
                        cx={conf.xMm}
                        cy={conf.yMm}
                        r={2.1}
                        fill="rgba(244, 63, 94, 0.22)"
                        stroke="#fb7185"
                        strokeWidth={0.35}
                      />
                      <line
                        x1={conf.xMm - 1.0}
                        y1={conf.yMm - 1.0}
                        x2={conf.xMm + 1.0}
                        y2={conf.yMm + 1.0}
                        stroke="#fda4af"
                        strokeWidth={0.4}
                      />
                      <line
                        x1={conf.xMm + 1.0}
                        y1={conf.yMm - 1.0}
                        x2={conf.xMm - 1.0}
                        y2={conf.yMm + 1.0}
                        stroke="#fda4af"
                        strokeWidth={0.4}
                      />
                    </g>
                  ))}
              </>
            )}
            {/* PCB Board Resize Handles (in mm space — parts keep exact size) */}
            {mode === 'pcb' && (
              <g className="no-print">
                {/* Right Edge Width Handle */}
                <g
                  onPointerDown={(e) => handlePointerDownResize(e, 'resize-r')}
                  className="cursor-ew-resize"
                >
                  <rect
                    x={config.widthMm - 1.2}
                    y={config.heightMm / 2 - 5}
                    width={3.4}
                    height={10}
                    rx={0.8}
                    fill="#0ea5e9"
                    stroke="#082f49"
                    strokeWidth={0.3}
                  />
                  <line
                    x1={config.widthMm + 0.5}
                    y1={config.heightMm / 2 - 2.5}
                    x2={config.widthMm + 0.5}
                    y2={config.heightMm / 2 + 2.5}
                    stroke="#082f49"
                    strokeWidth={0.35}
                  />
                </g>

                {/* Bottom Edge Height Handle */}
                <g
                  onPointerDown={(e) => handlePointerDownResize(e, 'resize-b')}
                  className="cursor-ns-resize"
                >
                  <rect
                    x={config.widthMm / 2 - 5}
                    y={config.heightMm - 1.2}
                    width={10}
                    height={3.4}
                    rx={0.8}
                    fill="#0ea5e9"
                    stroke="#082f49"
                    strokeWidth={0.3}
                  />
                  <line
                    x1={config.widthMm / 2 - 2.5}
                    y1={config.heightMm + 0.5}
                    x2={config.widthMm / 2 + 2.5}
                    y2={config.heightMm + 0.5}
                    stroke="#082f49"
                    strokeWidth={0.35}
                  />
                </g>

                {/* Bottom-Right Corner Diagonal Handle */}
                <g
                  onPointerDown={(e) => handlePointerDownResize(e, 'resize-br')}
                  className="cursor-nwse-resize"
                >
                  <rect
                    x={config.widthMm - 2.2}
                    y={config.heightMm - 2.2}
                    width={4.8}
                    height={4.8}
                    rx={0.9}
                    fill="#22d3ee"
                    stroke="#082f49"
                    strokeWidth={0.35}
                  />
                  <path
                    d={`M ${config.widthMm - 0.5} ${config.heightMm + 1.4} L ${config.widthMm + 1.4} ${config.heightMm - 0.5}`}
                    stroke="#082f49"
                    strokeWidth={0.4}
                  />
                </g>

                {/* Live dimension badge during resize */}
                {(dragState?.type === 'resize-r' ||
                  dragState?.type === 'resize-b' ||
                  dragState?.type === 'resize-br') && (
                  <g>
                    <rect
                      x={config.widthMm + 3.5}
                      y={config.heightMm - 4.5}
                      width={26}
                      height={5.5}
                      rx={1}
                      fill="#0f172a"
                      stroke="#22d3ee"
                      strokeWidth={0.3}
                    />
                    <text
                      x={config.widthMm + 16.5}
                      y={config.heightMm - 0.9}
                      textAnchor="middle"
                      fontSize="2.4"
                      fontFamily="JetBrains Mono, monospace"
                      fill="#67e8f9"
                    >
                      {config.widthMm}×{config.heightMm}mm
                    </text>
                  </g>
                )}
              </g>
            )}
          </svg>
        </div>

        {/* Empty PCB Quick-Start Bar */}
        {routed.placed.length === 0 && mode === 'pcb' && (
          <div className="no-print absolute top-14 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-slate-950/92 border border-slate-700/80 shadow-lg max-w-2xl">
            <span className="text-xs text-slate-300">
              Papan PCB kosong siap diisi. Pilih komponen di panel kiri atau generate otomatis dari:
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onJumpToView('sketch')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/40 transition-colors whitespace-nowrap"
              >
                <Code2 className="w-3.5 h-3.5" />
                Kode C++ / .ino
              </button>
              <button
                onClick={() => onJumpToView('mermaid', 'mermaid')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 transition-colors whitespace-nowrap"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Script Mermaid
              </button>
              <button
                onClick={() => onJumpToView('mermaid', 'json')}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 transition-colors whitespace-nowrap"
              >
                <FileJson className="w-3.5 h-3.5" />
                Diagram JSON
              </button>
            </div>
          </div>
        )}

        {/* Draw Lines Hint / Fix Notice Banner */}
        {mode === 'pcb' && (fixNotice || toolMode === 'draw' || toolMode === 'edit' || toolMode === 'delete') && (
          <div className="no-print absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-3.5 py-1.5 rounded-md bg-slate-950/92 border border-slate-700/90 text-xs text-slate-200 shadow-lg pointer-events-none">
            {fixNotice ? (
              <span className="text-emerald-300 font-medium">{fixNotice}</span>
            ) : toolMode === 'draw' ? (
              <span>
                {drawingPoints.length === 0
                  ? 'Mode Draw Lines: Klik pin atau titik grid untuk mulai menggambar jalur PCB.'
                  : 'Klik titik belokan, klik pin tujuan untuk selesai, atau double-klik / Enter · Esc batal.'}
              </span>
            ) : toolMode === 'edit' ? (
              <span>
                Mode Edit Jalur: Klik jalur PCB lalu seret titik biru/kuning, klik + di tengah segmen untuk tambah belokan.
              </span>
            ) : (
              <span className="text-rose-300">
                Mode Hapus Jalur: Klik langsung pada jalur PCB yang ingin dihapus.
              </span>
            )}
          </div>
        )}

        {/* Floating Coordinate & Net Inspector HUD */}
        <div className="no-print absolute bottom-3 left-3 flex items-center gap-3 px-3 py-1.5 rounded-md bg-slate-950/90 border border-slate-800 text-xs font-mono-tabular text-slate-300 pointer-events-none">
          <span>
            X: {cursorMm.x.toFixed(1)} mm · Y: {cursorMm.y.toFixed(1)} mm
          </span>
          {hoveredNet && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-cyan-400 font-semibold">NET: {hoveredNet}</span>
            </>
          )}
        </div>

        {/* Layer Color Legend for PCB View */}
        {mode === 'pcb' && (
          <div className="no-print absolute bottom-3 right-3 flex items-center gap-3 px-3 py-1.5 rounded-md bg-slate-950/90 border border-slate-800 text-xs text-slate-300">
            {config.copperMode === '2-layer' && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-orange-500" /> Top (F.Cu)
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-sky-400" /> Bottom (B.Cu)
            </span>
          </div>
        )}

        {/* Color Legend for Wiring View */}
        {isWiring && (
          <div className="no-print absolute bottom-3 right-3 flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-md bg-slate-950/90 border border-slate-800 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> +5V
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" /> +3.3V
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" /> GND
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" /> I2C (SDA/SCL)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Analog ADC
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" /> GPIO / PWM
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
