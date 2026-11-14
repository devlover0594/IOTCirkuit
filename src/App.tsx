import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FilePlus2,
  Layers,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import { BomTable } from './components/BomTable';
import { MermaidViewer } from './components/MermaidViewer';
import { PcbCanvas } from './components/PcbCanvas';
import { SketchPanel } from './components/SketchPanel';
import {
  CATALOG_MAP,
  COMPONENT_CATALOG,
  PROJECT_PRESETS,
  SAMPLE_SKETCHES,
} from './data/catalog';
import {
  BoardConfig,
  ComponentCategory,
  NetConnection,
  PcbToolMode,
  PlacedComponent,
  PointMm,
  RoutedBoard,
  TraceSegment,
  ViaPoint,
  ViewMode,
} from './types/pcb';
import {
  autoPlaceComponents,
  detectTraceConflicts,
  resolveTraceConflicts,
  routePcb,
} from './utils/autoRouter';
import {
  exportBoardToJson,
  parseJsonToPcb,
  parseMermaidToPcb,
} from './utils/diagramImporter';
import { exportGerberZip } from './utils/gerberExport';
import { generateMermaidScript } from './utils/mermaidGenerator';
import {
  generateSketchFromBoard,
  parseArduinoSketch,
  ParsedPinSymbol,
} from './utils/sketchParser';

const INITIAL_PRESET = PROJECT_PRESETS[0];

const CATEGORY_TABS: Array<{ id: 'all' | ComponentCategory; label: string }> = [
  { id: 'all', label: 'Semua' },
  { id: 'mcu', label: 'MCU' },
  { id: 'sensor', label: 'Sensor' },
  { id: 'actuator', label: 'Aktuator' },
  { id: 'tactile', label: 'Tombol/LED' },
  { id: 'connector', label: 'Konektor' },
];

const NAV_VIEWS: Array<{ id: ViewMode; label: string }> = [
  { id: 'pcb', label: 'Desain PCB' },
  { id: 'toner', label: 'Toner Transfer' },
  { id: 'wiring', label: 'Jalur Kabel' },
  { id: 'mermaid', label: 'Diagram Mermaid' },
  { id: 'sketch', label: 'Sketch C++' },
  { id: 'bom', label: 'Daftar BOM' },
];

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('pcb');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ComponentCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [config, setConfig] = useState<BoardConfig>({
    projectName: 'ESP32_Smart_Relay_Controller',
    widthMm: INITIAL_PRESET.boardWidthMm,
    heightMm: INITIAL_PRESET.boardHeightMm,
    copperMode: '1-layer',
    visibleLayer: 'all',
    printLayerMode: 'both',
    traceWidthMm: 0.6,
    solderMask: 'green',
    mirrorToner: true,
    showDrillGuides: true,
    showSilkscreen: true,
    mountingHoles: true,
  });

  const [placed, setPlaced] = useState<PlacedComponent[]>(() =>
    autoPlaceComponents(
      INITIAL_PRESET.componentIds,
      INITIAL_PRESET.boardWidthMm,
      INITIAL_PRESET.boardHeightMm
    )
  );

  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [toolMode, setToolMode] = useState<PcbToolMode>('select');
  const [drawLayer, setDrawLayer] = useState<'F.Cu' | 'B.Cu'>('B.Cu');

  const [editedTraces, setEditedTraces] = useState<Record<string, TraceSegment>>({});
  const [deletedTraceIds, setDeletedTraceIds] = useState<Set<string>>(() => new Set());
  const [customTraces, setCustomTraces] = useState<TraceSegment[]>([]);
  const [customVias, setCustomVias] = useState<ViaPoint[]>([]);
  const [fixNotice, setFixNotice] = useState<string | null>(null);

  const [diagramSubTab, setDiagramSubTab] = useState<'mermaid' | 'json'>('mermaid');
  const [sketchCode, setSketchCode] = useState<string>(SAMPLE_SKETCHES[0].code);
  const [extractedPins, setExtractedPins] = useState<ParsedPinSymbol[]>([]);
  const [detectedLibs, setDetectedLibs] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  const autoRouted = useMemo(() => routePcb(placed, config), [placed, config]);

  const routed: RoutedBoard = useMemo(() => {
    const mergedAutoTraces = autoRouted.traces
      .filter((t) => !deletedTraceIds.has(t.id))
      .map((t) => {
        const edited = editedTraces[t.id];
        if (!edited) return t;
        return config.copperMode === '1-layer' ? { ...edited, layer: 'B.Cu' as const } : edited;
      });

    const normalizedCustom = customTraces.map((t) =>
      config.copperMode === '1-layer' ? { ...t, layer: 'B.Cu' as const } : t
    );

    return {
      ...autoRouted,
      traces: [...mergedAutoTraces, ...normalizedCustom],
      vias: [...autoRouted.vias, ...customVias],
    };
  }, [autoRouted, deletedTraceIds, editedTraces, customTraces, customVias, config.copperMode]);

  const conflicts = useMemo(() => detectTraceConflicts(routed.traces), [routed.traces]);

  const mermaidScript = useMemo(
    () => generateMermaidScript(routed.placed, routed.connections),
    [routed.placed, routed.connections]
  );
  const jsonString = useMemo(
    () => exportBoardToJson(routed.placed, routed.connections, config),
    [routed.placed, routed.connections, config]
  );

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return COMPONENT_CATALOG.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.shortName.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.footprint.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, searchQuery]);

  const resetTraceEdits = () => {
    setEditedTraces({});
    setDeletedTraceIds(new Set());
    setCustomTraces([]);
    setCustomVias([]);
    setSelectedTraceId(null);
    setFixNotice(null);
  };

  useEffect(() => {
    if (config.copperMode === '1-layer' && drawLayer !== 'B.Cu') {
      setDrawLayer('B.Cu');
    }
  }, [config.copperMode, drawLayer]);

  useEffect(() => {
    if (!fixNotice) return;
    const timer = window.setTimeout(() => setFixNotice(null), 4500);
    return () => window.clearTimeout(timer);
  }, [fixNotice]);

  const handleUpdateConfig = (patch: Partial<BoardConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleAddComponent = (defId: string) => {
    const currentIds = placed.map((p) => p.defId);
    const overrides = placed.map((p) => p.pinOverrides);
    const nextPlaced = autoPlaceComponents(
      [...currentIds, defId],
      config.widthMm,
      config.heightMm,
      [...overrides, undefined]
    );
    setPlaced(nextPlaced);
    setEditedTraces({});
    setDeletedTraceIds(new Set());
    const newest = nextPlaced[nextPlaced.length - 1];
    if (newest) {
      setSelectedUid(newest.uid);
      setSelectedTraceId(null);
    }
  };

  const handleRemoveComponent = (uid: string) => {
    setPlaced((prev) => prev.filter((p) => p.uid !== uid));
    setEditedTraces({});
    setDeletedTraceIds(new Set());
    if (selectedUid === uid) setSelectedUid(null);
  };

  const handleMoveComponent = (uid: string, xMm: number, yMm: number) => {
    setPlaced((prev) =>
      prev.map((p) => (p.uid === uid ? { ...p, xMm, yMm } : p))
    );
    // Clear edited trace overrides attached to the moved component so auto-traces stay snapped to its pads
    setEditedTraces((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      autoRouted.connections.forEach((conn, idx) => {
        if (conn.fromUid === uid || conn.toUid === uid) {
          delete next[`tr-${idx}`];
          delete next[`tr-${idx}-a`];
          delete next[`tr-${idx}-b`];
        }
      });
      return next;
    });
  };

  const handleRotateComponent = (uid: string) => {
    setPlaced((prev) =>
      prev.map((p) =>
        p.uid === uid
          ? { ...p, rotation: ((p.rotation + 90) % 360) as 0 | 90 | 180 | 270 }
          : p
      )
    );
    setEditedTraces((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      autoRouted.connections.forEach((conn, idx) => {
        if (conn.fromUid === uid || conn.toUid === uid) {
          delete next[`tr-${idx}`];
          delete next[`tr-${idx}-a`];
          delete next[`tr-${idx}-b`];
        }
      });
      return next;
    });
  };

  const handleAutoArrange = () => {
    const ids = placed.map((p) => p.defId);
    const overrides = placed.map((p) => p.pinOverrides);
    setPlaced(autoPlaceComponents(ids, config.widthMm, config.heightMm, overrides));
    setEditedTraces({});
    setDeletedTraceIds(new Set());
    setSelectedTraceId(null);
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = PROJECT_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setConfig((prev) => ({
      ...prev,
      projectName: preset.name.replace(/[^a-zA-Z0-9]+/g, '_'),
      widthMm: preset.boardWidthMm,
      heightMm: preset.boardHeightMm,
    }));
    setPlaced(
      autoPlaceComponents(
        preset.componentIds,
        preset.boardWidthMm,
        preset.boardHeightMm
      )
    );
    resetTraceEdits();
    setSelectedUid(null);
  };

  const handleAnalyzeSketchAndBuild = (code: string) => {
    const res = parseArduinoSketch(code);
    setExtractedPins(res.extractedPins);
    setDetectedLibs(res.detectedLibraries);

    const neededW = res.componentIds.length > 7 ? 115 : 98;
    const neededH = res.componentIds.length > 7 ? 82 : 74;

    setConfig((prev) => ({
      ...prev,
      widthMm: neededW,
      heightMm: neededH,
    }));

    const nextPlaced = autoPlaceComponents(
      res.componentIds,
      neededW,
      neededH,
      res.pinOverridesList
    );
    setPlaced(nextPlaced);
    resetTraceEdits();
    setSelectedUid(null);
    setViewMode('pcb');
  };

  const handleGenerateSketchFromPcb = () => {
    const generated = generateSketchFromBoard(routed.placed, routed.connections);
    setSketchCode(generated);
  };

  const handleNewBoard = () => {
    setPlaced([]);
    setSelectedUid(null);
    resetTraceEdits();
    setExtractedPins([]);
    setDetectedLibs([]);
    setConfig((prev) => ({
      ...prev,
      projectName: 'New_PCB_Project',
      widthMm: 90,
      heightMm: 70,
    }));
    setViewMode('pcb');
  };

  const handleImportMermaid = (mermaidText: string) => {
    const res = parseMermaidToPcb(mermaidText, config.widthMm, config.heightMm);
    if (res.placed.length === 0) {
      throw new Error(
        'Tidak ada komponen yang dikenali dari script Mermaid. Sertakan nama komponen seperti ESP32, Relay, DHT22, OLED, Button, LED, atau Terminal.'
      );
    }
    setConfig((prev) => ({
      ...prev,
      widthMm: res.boardWidthMm ?? prev.widthMm,
      heightMm: res.boardHeightMm ?? prev.heightMm,
    }));
    setPlaced(res.placed);
    resetTraceEdits();
    setSelectedUid(null);
    setViewMode('pcb');
  };

  const handleImportJson = (jsonText: string) => {
    const res = parseJsonToPcb(jsonText, config.widthMm, config.heightMm);
    setConfig((prev) => ({
      ...prev,
      projectName: res.projectName || prev.projectName,
      widthMm: res.boardWidthMm ?? prev.widthMm,
      heightMm: res.boardHeightMm ?? prev.heightMm,
      copperMode: res.copperMode ?? prev.copperMode,
    }));
    setPlaced(res.placed);
    resetTraceEdits();
    setSelectedUid(null);
    setViewMode('pcb');
  };

  const handleAddCustomTrace = (
    points: PointMm[],
    layer: 'F.Cu' | 'B.Cu',
    netName?: string,
    netType?: NetConnection['netType']
  ) => {
    if (points.length < 2) return;
    const effectiveLayer: 'F.Cu' | 'B.Cu' =
      config.copperMode === '1-layer' ? 'B.Cu' : layer;
    const id = `custom-tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
    const newTrace: TraceSegment = {
      id,
      netName: netName || `MANUAL_${customTraces.length + 1}`,
      netType: netType || 'signal',
      layer: effectiveLayer,
      widthMm: config.traceWidthMm,
      points,
    };
    setCustomTraces((prev) => [...prev, newTrace]);
    setSelectedTraceId(id);
    setSelectedUid(null);
  };

  const handleUpdateTrace = (
    traceId: string,
    patch: Partial<TraceSegment>
  ) => {
    if (traceId.startsWith('custom-')) {
      setCustomTraces((prev) =>
        prev.map((t) => (t.id === traceId ? { ...t, ...patch } : t))
      );
      return;
    }
    const baseTrace =
      editedTraces[traceId] ?? autoRouted.traces.find((t) => t.id === traceId);
    if (!baseTrace) return;
    setEditedTraces((prev) => ({
      ...prev,
      [traceId]: { ...baseTrace, ...patch },
    }));
  };

  const handleDeleteTrace = (traceId: string) => {
    if (traceId.startsWith('custom-')) {
      setCustomTraces((prev) => prev.filter((t) => t.id !== traceId));
    } else {
      setDeletedTraceIds((prev) => {
        const next = new Set(prev);
        next.add(traceId);
        return next;
      });
      setEditedTraces((prev) => {
        if (!(traceId in prev)) return prev;
        const next = { ...prev };
        delete next[traceId];
        return next;
      });
    }
    if (selectedTraceId === traceId) setSelectedTraceId(null);
  };

  const handleFixTraceConflicts = () => {
    if (conflicts.length === 0) {
      setFixNotice('Semua jalur PCB sudah bebas persinggungan.');
      return;
    }

    const res = resolveTraceConflicts(
      routed.traces,
      routed.vias,
      routed.placed,
      config
    );

    const nextCustom: TraceSegment[] = [];
    const nextEdited: Record<string, TraceSegment> = { ...editedTraces };

    for (const tr of res.traces) {
      if (tr.id.startsWith('custom-')) {
        nextCustom.push(tr);
      } else {
        const orig = autoRouted.traces.find((a) => a.id === tr.id);
        const changed =
          !orig ||
          orig.layer !== tr.layer ||
          orig.points.length !== tr.points.length ||
          orig.points.some(
            (p, idx) =>
              Math.abs(p.x - tr.points[idx].x) > 0.01 ||
              Math.abs(p.y - tr.points[idx].y) > 0.01
          );
        if (changed) {
          nextEdited[tr.id] = tr;
        }
      }
    }

    setCustomTraces(nextCustom);
    setEditedTraces(nextEdited);

    if (res.remainingConflicts.length === 0) {
      setFixNotice(
        `Berhasil memperbaiki ${conflicts.length} titik persinggungan secara otomatis.`
      );
    } else {
      setFixNotice(
        `${Math.max(0, conflicts.length - res.remainingConflicts.length)} diperbaiki, ${res.remainingConflicts.length} tersisa (aktifkan Dual Layer atau geser komponen).`
      );
    }
  };

  const handleJumpToView = (view: ViewMode, subTab?: 'mermaid' | 'json') => {
    if (subTab) setDiagramSubTab(subTab);
    setViewMode(view);
  };

  const handleExportGerber = async () => {
    if (routed.placed.length === 0) return;
    setIsExporting(true);
    try {
      await exportGerberZip(routed, config);
    } finally {
      setIsExporting(false);
    }
  };

  const selectedComp = placed.find((p) => p.uid === selectedUid) ?? null;
  const selectedDef = selectedComp ? CATALOG_MAP[selectedComp.defId] : null;
  const selectedTrace = routed.traces.find((t) => t.id === selectedTraceId) ?? null;
  const activeMcu = placed.find((p) => CATALOG_MAP[p.defId]?.category === 'mcu');
  const activeMcuDef = activeMcu ? CATALOG_MAP[activeMcu.defId] : null;

  const handlePinOverrideChange = (compUid: string, pinId: string, mcuPinStr: string) => {
    setPlaced((prev) =>
      prev.map((c) => {
        if (c.uid !== compUid) return c;
        const nextOverrides = { ...(c.pinOverrides || {}) };
        if (!mcuPinStr) {
          delete nextOverrides[pinId];
        } else {
          nextOverrides[pinId] = mcuPinStr;
        }
        return { ...c, pinOverrides: nextOverrides };
      })
    );
    setEditedTraces({});
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B0E14] text-slate-100">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="no-print flex items-center justify-between gap-8 px-5 h-13 border-b border-slate-800/90 bg-[#0D1119] shrink-0">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="text-base font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
          TraceForge PCB
        </div>

        {/* Zone 2: Clean single-line view navigation */}
        <nav className="flex items-center gap-5 overflow-x-auto no-scrollbar">
          {NAV_VIEWS.map((nav) => {
            const active = viewMode === nav.id;
            return (
              <button
                key={nav.id}
                onClick={() => setViewMode(nav.id)}
                className={`py-3.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                {nav.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: New + Ekspor Gerber .ZIP */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleNewBoard}
            title="Buat papan PCB kosong baru"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 transition-colors whitespace-nowrap shrink-0"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-cyan-300" />
            New
          </button>
          <button
            onClick={handleExportGerber}
            disabled={isExporting || routed.placed.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? 'Membuat ZIP...' : 'Ekspor Gerber .ZIP'}
          </button>
        </div>
      </header>

      {/* Main 3-Column CAD Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Component & Preset Library */}
        <aside className="no-print w-[290px] xl:w-[310px] flex flex-col border-r border-slate-800/80 bg-[#0D1119] shrink-0">
          {/* Quick Presets */}
          <div className="p-3.5 border-b border-slate-800/80">
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Template Proyek Cepat
            </label>
            <select
              onChange={(e) => handleApplyPreset(e.target.value)}
              defaultValue={INITIAL_PRESET.id}
              className="w-full px-2.5 py-1.5 text-xs rounded-md bg-slate-900 border border-slate-700/80 text-slate-100 focus:outline-none focus:border-cyan-500"
            >
              {PROJECT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search & Category Tabs */}
          <div className="p-3.5 border-b border-slate-800/80 space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari ESP32, relay, sensor, tombol..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md bg-slate-900 border border-slate-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex flex-wrap gap-1">
              {CATEGORY_TABS.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    categoryFilter === cat.id
                      ? 'bg-slate-800 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Component Catalog List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {filteredCatalog.map((item) => (
              <div
                key={item.id}
                className="p-3 hover:bg-slate-900/50 transition-colors flex items-start justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {item.description}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-500 mt-1">
                    {item.widthMm}×{item.heightMm}mm · {item.pins.length} Pin · {item.voltage}
                  </div>
                </div>
                <button
                  onClick={() => handleAddComponent(item.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-300 border border-slate-700/80 transition-colors shrink-0 whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  Tambah
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* Center Main Viewport */}
        <main className="flex-1 min-w-0 h-full overflow-hidden">
          {(viewMode === 'pcb' || viewMode === 'toner' || viewMode === 'wiring') && (
            <PcbCanvas
              mode={viewMode}
              config={config}
              routed={routed}
              selectedUid={selectedUid}
              selectedTraceId={selectedTraceId}
              toolMode={toolMode}
              drawLayer={drawLayer}
              conflicts={conflicts}
              fixNotice={fixNotice}
              onSelectComponent={(uid) => {
                setSelectedUid(uid);
                if (uid) setSelectedTraceId(null);
              }}
              onSelectTrace={(tid) => {
                setSelectedTraceId(tid);
                if (tid) setSelectedUid(null);
              }}
              onChangeToolMode={setToolMode}
              onChangeDrawLayer={setDrawLayer}
              onMoveComponent={handleMoveComponent}
              onRotateComponent={handleRotateComponent}
              onUpdateConfig={handleUpdateConfig}
              onAddCustomTrace={handleAddCustomTrace}
              onUpdateTrace={handleUpdateTrace}
              onDeleteTrace={handleDeleteTrace}
              onFixConflicts={handleFixTraceConflicts}
              onJumpToView={handleJumpToView}
            />
          )}

          {viewMode === 'mermaid' && (
            <MermaidViewer
              script={mermaidScript}
              jsonString={jsonString}
              projectName={config.projectName}
              activeSubTab={diagramSubTab}
              onChangeSubTab={setDiagramSubTab}
              onImportMermaid={handleImportMermaid}
              onImportJson={handleImportJson}
            />
          )}

          {viewMode === 'sketch' && (
            <SketchPanel
              code={sketchCode}
              onChangeCode={setSketchCode}
              onAnalyzeAndBuild={handleAnalyzeSketchAndBuild}
              onGenerateFromCurrentPcb={handleGenerateSketchFromPcb}
              lastExtractedPins={extractedPins}
              lastDetectedLibs={detectedLibs}
            />
          )}

          {viewMode === 'bom' && (
            <BomTable
              bom={routed.bom}
              connections={routed.connections}
              projectName={config.projectName}
            />
          )}
        </main>

        {/* Right Inspector Sidebar */}
        <aside className="no-print hidden lg:flex w-[275px] xl:w-[295px] flex-col border-l border-slate-800/80 bg-[#0D1119] shrink-0 overflow-y-auto">
          {/* Board Parameters */}
          <div className="p-3.5 border-b border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Parameter Papan PCB
              </span>
              <Layers className="w-3.5 h-3.5 text-slate-400" />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Nama Proyek
              </label>
              <input
                type="text"
                value={config.projectName}
                onChange={(e) => handleUpdateConfig({ projectName: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs font-mono-tabular rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Lebar (mm)
                </label>
                <input
                  type="number"
                  min={40}
                  max={240}
                  value={config.widthMm}
                  onChange={(e) =>
                    handleUpdateConfig({
                      widthMm: Math.max(40, Math.min(240, Number(e.target.value) || 80)),
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono-tabular rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Tinggi (mm)
                </label>
                <input
                  type="number"
                  min={40}
                  max={240}
                  value={config.heightMm}
                  onChange={(e) =>
                    handleUpdateConfig({
                      heightMm: Math.max(40, Math.min(240, Number(e.target.value) || 60)),
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono-tabular rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Lapisan Tembaga
                </label>
                <select
                  value={config.copperMode}
                  onChange={(e) => {
                    const nextMode = e.target.value as BoardConfig['copperMode'];
                    handleUpdateConfig({
                      copperMode: nextMode,
                      visibleLayer: 'all',
                      printLayerMode: nextMode === '1-layer' ? 'bottom' : 'both',
                    });
                  }}
                  className="w-full px-2 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="1-layer">Single Layer (1-Layer)</option>
                  <option value="2-layer">Dual Layer (2-Layer)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Lebar Jalur
                </label>
                <select
                  value={config.traceWidthMm}
                  onChange={(e) =>
                    handleUpdateConfig({ traceWidthMm: Number(e.target.value) })
                  }
                  className="w-full px-2 py-1.5 text-xs font-mono-tabular rounded bg-slate-900 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value={0.4}>0.4 mm</option>
                  <option value={0.6}>0.6 mm</option>
                  <option value={0.8}>0.8 mm</option>
                  <option value={1.0}>1.0 mm</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.mountingHoles}
                onChange={(e) =>
                  handleUpdateConfig({ mountingHoles: e.target.checked })
                }
                className="rounded border-slate-700 bg-slate-900 text-cyan-500"
              />
              Lubang Baut M3 di 4 Sudut (3.2mm)
            </label>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleAutoArrange}
                disabled={placed.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Susun Otomatis
              </button>
              <button
                onClick={() => {
                  setPlaced([]);
                  setSelectedUid(null);
                  resetTraceEdits();
                }}
                disabled={placed.length === 0 && customTraces.length === 0}
                className="px-2.5 py-1.5 text-xs font-medium rounded bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-300 border border-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                Bersihkan
              </button>
            </div>
          </div>

          {/* DRC Trace Conflict Status & Auto-Fix */}
          <div className="p-3.5 border-b border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">Cek Jalur (DRC)</span>
              {conflicts.length === 0 ? (
                <span className="inline-flex items-center gap-1 text-emerald-400 font-mono-tabular">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  0 Persinggungan
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-400 font-semibold font-mono-tabular">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {conflicts.length} Persinggungan
                </span>
              )}
            </div>
            <button
              onClick={handleFixTraceConflicts}
              disabled={routed.traces.length === 0}
              className={`w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap disabled:opacity-40 ${
                conflicts.length > 0
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/50 text-amber-300'
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              Perbaiki Jalur Otomatis
            </button>
          </div>

          {/* Warnings */}
          {routed.warnings.length > 0 && (
            <div className="p-3 border-b border-slate-800/80 bg-amber-950/20 space-y-1">
              {routed.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-[11px] text-amber-300 leading-relaxed"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Selected Trace Inspector */}
          {selectedTrace && (
            <div className="p-3.5 border-b border-slate-800/80 bg-cyan-950/20 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-cyan-300 font-mono-tabular truncate">
                    Jalur: {selectedTrace.netName}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-400">
                    {selectedTrace.points.length} titik · {selectedTrace.id.startsWith('custom-') ? 'Manual' : 'Auto'}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTrace(selectedTrace.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-800/70 transition-colors whitespace-nowrap shrink-0"
                  title="Hapus Jalur (Del)"
                >
                  <Trash2 className="w-3 h-3" />
                  Hapus
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Layer Tembaga
                  </label>
                  <select
                    value={selectedTrace.layer}
                    disabled={config.copperMode === '1-layer'}
                    onChange={(e) =>
                      handleUpdateTrace(selectedTrace.id, {
                        layer: e.target.value as 'F.Cu' | 'B.Cu',
                      })
                    }
                    className="w-full px-2 py-1 text-xs rounded bg-slate-900 border border-slate-700 text-slate-100 disabled:opacity-60 focus:outline-none"
                  >
                    <option value="B.Cu">Bottom (B.Cu)</option>
                    {config.copperMode === '2-layer' && (
                      <option value="F.Cu">Top (F.Cu)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Lebar Jalur
                  </label>
                  <select
                    value={selectedTrace.widthMm}
                    onChange={(e) =>
                      handleUpdateTrace(selectedTrace.id, {
                        widthMm: Number(e.target.value),
                      })
                    }
                    className="w-full px-2 py-1 text-xs font-mono-tabular rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none"
                  >
                    <option value={0.4}>0.4 mm</option>
                    <option value={0.6}>0.6 mm</option>
                    <option value={0.8}>0.8 mm</option>
                    <option value={1.0}>1.0 mm</option>
                    <option value={1.2}>1.2 mm</option>
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Seret titik biru pada jalur untuk mengubah rute, klik ikon + di tengah segmen untuk tambah belokan.
              </p>
            </div>
          )}

          {/* Selected Component Pinout Inspector */}
          {selectedComp && selectedDef && (
            <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-cyan-300 font-mono-tabular">
                    {selectedComp.designator} · {selectedDef.shortName}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-400">
                    X: {selectedComp.xMm.toFixed(1)}mm · Y: {selectedComp.yMm.toFixed(1)}mm ·{' '}
                    {selectedComp.rotation}°
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRotateComponent(selectedComp.uid)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                    title="Putar 90°"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemoveComponent(selectedComp.uid)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-rose-900/70 text-rose-300"
                    title="Hapus Komponen"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Pin Mapping Override for non-MCU components */}
              {selectedDef.category !== 'mcu' && activeMcuDef && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-medium text-slate-400">
                    Pemetaan Pin ke {activeMcu?.designator}
                  </div>
                  {selectedDef.pins
                    .filter(
                      (p) =>
                        p.type === 'gpio' ||
                        p.type === 'adc' ||
                        p.type === 'pwm'
                    )
                    .map((pin) => {
                      const activeConn = routed.connections.find(
                        (c) =>
                          c.toUid === selectedComp.uid &&
                          c.toPinId === pin.id &&
                          (c.netType === 'signal' || c.netType === 'adc')
                      );
                      const mcuSignalOptions = activeMcuDef.pins.filter(
                        (mp) =>
                          mp.type === 'gpio' ||
                          mp.type === 'adc' ||
                          mp.type === 'pwm'
                      );

                      return (
                        <div
                          key={pin.id}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-mono-tabular text-slate-300">
                            {pin.label}
                          </span>
                          <select
                            value={selectedComp.pinOverrides?.[pin.id] ?? ''}
                            onChange={(e) =>
                              handlePinOverrideChange(
                                selectedComp.uid,
                                pin.id,
                                e.target.value
                              )
                            }
                            className="px-2 py-1 text-[11px] font-mono-tabular rounded bg-slate-900 border border-slate-700 text-cyan-300 focus:outline-none"
                          >
                            <option value="">
                              Otomatis ({activeConn?.fromPinLabel ?? 'Auto'})
                            </option>
                            {mcuSignalOptions.map((mp) => (
                              <option key={mp.id} value={mp.id}>
                                {mp.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Active Placed Components List */}
          <div className="p-3.5 flex-1">
            <div className="text-xs font-semibold text-slate-300 mb-2">
              Komponen di Papan ({placed.length})
            </div>
            {placed.length === 0 ? (
              <p className="text-xs text-slate-500">
                Papan kosong. Pilih komponen di panel kiri.
              </p>
            ) : (
              <div className="divide-y divide-slate-800/60 border border-slate-800/80 rounded-md overflow-hidden">
                {placed.map((comp) => {
                  const isSel = comp.uid === selectedUid;
                  return (
                    <div
                      key={comp.uid}
                      onClick={() => {
                        setSelectedUid(comp.uid);
                        setSelectedTraceId(null);
                      }}
                      className={`px-2.5 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isSel ? 'bg-cyan-500/10' : 'hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-100 truncate">
                          <span className="font-mono-tabular text-cyan-300 mr-1.5">
                            {comp.designator}
                          </span>
                          {comp.label}
                        </div>
                        <div className="text-[11px] font-mono-tabular text-slate-500">
                          ({comp.xMm.toFixed(0)}, {comp.yMm.toFixed(0)}) mm · {comp.rotation}°
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveComponent(comp.uid);
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 rounded"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
