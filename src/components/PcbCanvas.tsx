import React, { useMemo, useRef, useState } from 'react';
import {
  Code2,
  Download,
  FileJson,
  FlipHorizontal2,
  GitBranch,
  Maximize2,
  Printer,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CATALOG_MAP } from '../data/catalog';
import {
  BoardConfig,
  PlacedComponent,
  PointMm,
  RoutedBoard,
  SolderMaskColor,
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
  onSelectComponent: (uid: string | null) => void;
  onMoveComponent: (uid: string, xMm: number, yMm: number) => void;
  onRotateComponent: (uid: string) => void;
  onUpdateConfig: (patch: Partial<BoardConfig>) => void;
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
    if (layer === 'F.Cu') return '#f97316';
    if (netType === 'gnd') return '#22d3ee';
    if (netType === 'power_5v' || netType === 'power_3v3') return '#fbbf24';
    return '#38bdf8';
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

export const PcbCanvas: React.FC<PcbCanvasProps> = ({
  mode,
  config,
  routed,
  selectedUid,
  onSelectComponent,
  onMoveComponent,
  onRotateComponent,
  onUpdateConfig,
  onJumpToView,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [cursorMm, setCursorMm] = useState<PointMm>({ x: 0, y: 0 });
  const [hoveredNet, setHoveredNet] = useState<string | null>(null);

  const [dragState, setDragState] = useState<{
    type: 'comp' | 'pan' | 'resize-r' | 'resize-b' | 'resize-br';
    uid?: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const padMargin = 10;
  const viewW = config.widthMm + padMargin * 2;
  const viewH = config.heightMm + padMargin * 2;
  // Constant physical scale so resizing the PCB never shrinks or enlarges parts inside it
  const pxPerMm = 5.4 * zoom;

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
    if (e.target === svgRef.current) {
      onSelectComponent(null);
    }
  };

  const handlePointerDownComponent = (
    e: React.PointerEvent<SVGGElement>,
    comp: PlacedComponent
  ) => {
    e.stopPropagation();
    onSelectComponent(comp.uid);
    if (mode !== 'pcb') return;
    setDragState({
      type: 'comp',
      uid: comp.uid,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: comp.xMm,
      origY: comp.yMm,
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

    if (dragState.type === 'comp' && dragState.uid) {
      const comp = routed.placed.find((c) => c.uid === dragState.uid);
      const def = comp ? CATALOG_MAP[comp.defId] : undefined;
      const dims = comp && def ? getRotatedDims(def, comp.rotation) : { widthMm: 10, heightMm: 10 };

      const snap = 1.27;
      const nx = Math.round((dragState.origX + dxMm) / snap) * snap;
      const ny = Math.round((dragState.origY + dyMm) / snap) * snap;

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
  const isToner = mode === 'toner';
  const isWiring = mode === 'wiring';

  const tonerTransformX = (x: number) => (isToner && config.mirrorToner ? config.widthMm - x : x);

  const handleDownloadTonerSvg = () => {
    const svgStr = generateTonerTransferSvgString(routed, config);
    const safeName = config.projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'pcb';
    downloadSvgString(svgStr, `${safeName}_toner_transfer_1to1.svg`);
  };

  const handleDownloadTonerPng = () => {
    const svgStr = generateTonerTransferSvgString(routed, config);
    const safeName = config.projectName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() || 'pcb';
    downloadPngFromSvgString(svgStr, `${safeName}_toner_transfer_600dpi.png`, 16);
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
          {mode === 'pcb' && (
            <>
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
            </>
          )}

          {mode === 'toner' && (
            <>
              <button
                onClick={() => onUpdateConfig({ mirrorToner: !config.mirrorToner })}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  config.mirrorToner
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-900 border-slate-700 text-slate-300'
                }`}
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
                {config.mirrorToner ? 'Mirror Aktif (Etching)' : 'Normal (Top View)'}
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
                Unduh SVG 1:1
              </button>
              <button
                onClick={handleDownloadTonerPng}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh PNG 600DPI
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
              mode === 'pcb' ? 'cursor-crosshair' : 'cursor-default'
            } ${isToner ? 'shadow-xl bg-white' : ''}`}
            style={{
              width: `${viewW * pxPerMm}px`,
              height: `${viewH * pxPerMm}px`,
            }}
            onPointerDown={handlePointerDownSvg}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
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

            {/* Board / Paper Substrate */}
            {isToner ? (
              <>
                <rect
                  x={-padMargin}
                  y={-padMargin}
                  width={viewW}
                  height={viewH}
                  fill="#ffffff"
                />
                <rect
                  x={0}
                  y={0}
                  width={config.widthMm}
                  height={config.heightMm}
                  fill="#ffffff"
                  stroke="#000000"
                  strokeWidth="0.3"
                />
                {/* Corner Crop Marks */}
                {[
                  [0, 0, -1, -1],
                  [config.widthMm, 0, 1, -1],
                  [0, config.heightMm, -1, 1],
                  [config.widthMm, config.heightMm, 1, 1],
                ].map(([cx, cy, sx, sy], idx) => (
                  <g key={idx}>
                    <line
                      x1={cx}
                      y1={cy}
                      x2={cx + sx * 3.5}
                      y2={cy}
                      stroke="#000000"
                      strokeWidth="0.2"
                    />
                    <line
                      x1={cx}
                      y1={cy}
                      x2={cx}
                      y2={cy + sy * 3.5}
                      stroke="#000000"
                      strokeWidth="0.2"
                    />
                  </g>
                ))}
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
              </>
            )}

            {/* Ruler Calibration Ticks along Top & Left edges */}
            {!isToner && (
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
            )}

            {/* Mounting Holes M3 */}
            {mountingHoles.map((mh, i) => {
              const mx = tonerTransformX(mh.x);
              return isToner ? (
                <g key={`mh-${i}`}>
                  <circle cx={mx} cy={mh.y} r={1.6} fill="none" stroke="#000000" strokeWidth="0.25" />
                  <line x1={mx - 2.2} y1={mh.y} x2={mx + 2.2} y2={mh.y} stroke="#000000" strokeWidth="0.18" />
                  <line x1={mx} y1={mh.y - 2.2} x2={mx} y2={mh.y + 2.2} stroke="#000000" strokeWidth="0.18" />
                </g>
              ) : (
                <g key={`mh-${i}`}>
                  <circle cx={mh.x} cy={mh.y} r={2.6} fill="#d97706" opacity={0.85} />
                  <circle cx={mh.x} cy={mh.y} r={1.6} fill="#080B10" stroke="#94a3b8" strokeWidth="0.2" />
                </g>
              );
            })}

            {/* Copper Traces / Wiring Paths */}
            <g>
              {routed.traces.map((tr) => {
                if (tr.points.length < 2) return null;
                const d = tr.points
                  .map(
                    (pt, idx) =>
                      `${idx === 0 ? 'M' : 'L'} ${tonerTransformX(pt.x)} ${pt.y}`
                  )
                  .join(' ');
                const isHighlighted = hoveredNet === tr.netName;
                const color = isToner
                  ? '#000000'
                  : getNetColor(tr.netType, isWiring ? 'wiring' : 'pcb', tr.layer);

                return (
                  <path
                    key={tr.id}
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={isHighlighted ? tr.widthMm * 1.65 : isWiring ? Math.max(0.55, tr.widthMm) : tr.widthMm}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={hoveredNet && !isHighlighted ? 0.28 : isToner ? 1 : 0.92}
                    strokeDasharray={isWiring && tr.netType === 'gnd' ? '1.6 0.9' : undefined}
                    onMouseEnter={() => setHoveredNet(tr.netName)}
                    onMouseLeave={() => setHoveredNet(null)}
                  />
                );
              })}
            </g>

            {/* Vias (2-layer mode) */}
            {routed.vias.map((via) => {
              const vx = tonerTransformX(via.xMm);
              if (isToner) {
                return (
                  <g key={via.id}>
                    <circle cx={vx} cy={via.yMm} r={via.padMm / 2} fill="#000000" />
                    {config.showDrillGuides && (
                      <circle cx={vx} cy={via.yMm} r={0.22} fill="#ffffff" />
                    )}
                  </g>
                );
              }
              return (
                <g key={via.id}>
                  <circle cx={vx} cy={via.yMm} r={via.padMm / 2} fill="#e5b84b" />
                  <circle cx={vx} cy={via.yMm} r={via.drillMm / 2} fill="#080B10" />
                </g>
              );
            })}

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
                  className={mode === 'pcb' ? 'cursor-grab active:cursor-grabbing' : ''}
                >
                  {/* Component Silkscreen / Outline (hidden on Toner Transfer except mirror text) */}
                  {!isToner && (config.showSilkscreen || isWiring) && (
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
                      {/* Pin 1 Orientation Notch */}
                      <circle
                        cx={comp.xMm + 1.5}
                        cy={comp.yMm + 1.5}
                        r={0.5}
                        fill="#e2e8f0"
                      />
                      {/* Designator & Label */}
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

                  {/* Component Pins / Copper Pads */}
                  {def.pins.map((pin) => {
                    const pos = getPinWorldPos(comp, pin);
                    const px = tonerTransformX(pos.x);
                    const py = pos.y;

                    const conn = routed.connections.find(
                      (c) =>
                        (c.fromUid === comp.uid && c.fromPinId === pin.id) ||
                        (c.toUid === comp.uid && c.toPinId === pin.id)
                    );
                    const isNetActive = conn && hoveredNet === conn.netName;

                    if (isToner) {
                      return (
                        <g key={`${comp.uid}-${pin.id}`}>
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
                    }

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
                          cx={px}
                          cy={py}
                          r={isNetActive ? (pin.padMm / 2) * 1.35 : pin.padMm / 2}
                          fill={isWiring ? padColor : '#e5b84b'}
                          stroke={isNetActive ? '#ffffff' : '#78350f'}
                          strokeWidth={isNetActive ? 0.28 : 0.12}
                        />
                        {pin.drillMm > 0 && (
                          <circle cx={px} cy={py} r={pin.drillMm / 2} fill="#090d14" />
                        )}
                        {/* Show pin labels clearly in Wiring View or when zoomed / selected */}
                        {(isWiring || isSelected || zoom >= 1.35) && (
                          <text
                            x={px}
                            y={py - pin.padMm / 2 - 0.55}
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

            {/* Toner Transfer Footer Stamp inside sheet */}
            {isToner && (
              <g>
                <text
                  x={1}
                  y={config.heightMm + 4.5}
                  fontSize="2.2"
                  fontFamily="JetBrains Mono, monospace"
                  fill="#000000"
                >
                  {config.projectName} | {config.widthMm}×{config.heightMm}mm | SKALA 1:1{' '}
                  {config.mirrorToner ? '| MIRROR (SETrika KE TEMBAGA)' : '| TOP VIEW'}
                </text>
                {/* 10mm physical calibration bar */}
                <line
                  x1={config.widthMm - 12}
                  y1={config.heightMm + 3.5}
                  x2={config.widthMm - 2}
                  y2={config.heightMm + 3.5}
                  stroke="#000000"
                  strokeWidth="0.35"
                />
                <line
                  x1={config.widthMm - 12}
                  y1={config.heightMm + 2.5}
                  x2={config.widthMm - 12}
                  y2={config.heightMm + 4.5}
                  stroke="#000000"
                  strokeWidth="0.25"
                />
                <line
                  x1={config.widthMm - 2}
                  y1={config.heightMm + 2.5}
                  x2={config.widthMm - 2}
                  y2={config.heightMm + 4.5}
                  stroke="#000000"
                  strokeWidth="0.25"
                />
                <text
                  x={config.widthMm - 7}
                  y={config.heightMm + 6.2}
                  textAnchor="middle"
                  fontSize="1.8"
                  fontFamily="JetBrains Mono, monospace"
                  fill="#000000"
                >
                  10 mm Kalibrasi
                </text>
              </g>
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
